/**
 * One-off migration for the `users.role` (string) -> `users.roles` (array)
 * schema change (multi-role support, see docs/diagrams/ui-arquitectura.md
 * §5). Converts every user document that still has the old `role` field
 * into `roles: [role]` and drops `role`, then re-publishes that user's
 * Firebase custom claims in the new `{ farmId, roles }` shape — the Mongo
 * document and the Firebase claim both encode role today, and RolesGuard
 * only ever reads the *claim*, so a user left with the old claim shape
 * would resolve `roles` as `undefined ?? []` after the code deploys and get
 * locked out of every role-gated route until an admin touches their roles
 * again. Safe to re-run: only touches documents that still have `role`.
 *
 * Deliberately does NOT read MONGODB_URI_ATLAS from .env — which database
 * this touches must be an explicit, conscious choice each run, never a
 * silent default that could land on the real Atlas cluster by accident.
 *
 * Usage:
 *   MIGRATE_MONGO_URI="mongodb://admin:admin123@localhost:27017/novafarm?authSource=admin" \
 *     pnpm exec ts-node scripts/migrate-user-roles.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';
import mongoose from 'mongoose';

// No dotenv dependency in this project — parse the handful of FIREBASE_*
// lines we need out of server-app/.env by hand. Deliberately ignores
// MONGODB_URI_ATLAS in that same file, see the module doc above.
function loadFirebaseEnvFromDotenv(): void {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = /^(FIREBASE_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) {
      // dotenv strips matching surrounding quotes — .env wraps
      // FIREBASE_PRIVATE_KEY in "..." since it contains literal \n's.
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  }
}

async function main(): Promise<void> {
  const mongoUri = process.env.MIGRATE_MONGO_URI;
  if (!mongoUri) {
    throw new Error(
      'Set MIGRATE_MONGO_URI explicitly — refusing to guess which database to migrate.',
    );
  }

  loadFirebaseEnvFromDotenv();
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

  await mongoose.connect(mongoUri);
  const users = mongoose.connection.collection('users');

  const toMigrate = await users
    .find({ role: { $exists: true } })
    .toArray();

  console.log(`Found ${toMigrate.length} user(s) with the old role field.`);

  let migrated = 0;
  for (const doc of toMigrate) {
    const roles = [doc.role as string];

    await users.updateOne(
      { _id: doc._id },
      { $set: { roles }, $unset: { role: '' } },
    );

    await admin.auth().setCustomUserClaims(doc.firebaseUid as string, {
      farmId: (doc.farmId as mongoose.Types.ObjectId).toString(),
      roles,
    });

    migrated += 1;
    console.log(`Migrated ${doc.email as string} -> roles: ${roles.join(', ')}`);
  }

  console.log(`Done. Migrated ${migrated} user(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
