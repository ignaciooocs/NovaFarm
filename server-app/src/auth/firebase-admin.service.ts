import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Envoltorio delgado sobre el SDK de firebase-admin. server-app nunca maneja
 * credenciales directamente — ui-app se autentica contra Firebase
 * Authentication del lado del cliente, y este servicio solo verifica el ID
 * token que el cliente presenta, y (durante el onboarding) setea los custom
 * claims farmId/roles que viajan en cada token siguiente.
 */
@Injectable()
export class FirebaseAdminService {
  private readonly app: admin.app.App;

  constructor(private readonly configService: ConfigService) {
    // Firebase Admin solo se puede inicializar una vez por proceso. Si ya
    // hay una app inicializada (por ejemplo con hot-reload en desarrollo),
    // reutiliza esa instancia en vez de crear una nueva.
    if (admin.apps.length === 0) {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      // La private key viene de una variable de entorno con los \n escapados
      // literalmente — hay que des-escaparlos para que sea una PEM válida.
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

  // Verifica un ID token de Firebase y devuelve su payload decodificado
  // (incluye uid, email, y los custom claims farmId/roles una vez seteados).
  async verifyIdToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return admin.auth(this.app).verifyIdToken(token);
  }

  // Setea los custom claims (farmId, roles) en la cuenta de Firebase del
  // usuario. Quedan embebidos en el ID token, y son justo lo que
  // FarmScopeGuard lee para hacer el scoping multi-tenant en cada request.
  async setCustomUserClaims(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    await admin.auth(this.app).setCustomUserClaims(uid, claims);
  }
}
