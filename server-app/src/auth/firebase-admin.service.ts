import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Thin wrapper around the firebase-admin SDK. server-app never handles
 * credentials directly — ui-app authenticates against Firebase Authentication
 * client-side, and this service only verifies the ID token the client
 * presents, and (during onboarding) sets the farmId/role custom claims that
 * carry tenant scope on every subsequent token.
 */
@Injectable()
export class FirebaseAdminService {
  private readonly app: admin.app.App;

  constructor(private readonly configService: ConfigService) {
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');

      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      this.app = admin.app();
    }
  }

  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth(this.app).verifyIdToken(token);
  }

  async setCustomUserClaims(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    await admin.auth(this.app).setCustomUserClaims(uid, claims);
  }
}
