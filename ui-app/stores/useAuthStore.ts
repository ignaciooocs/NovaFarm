import type { User } from 'firebase/auth';
import { onIdTokenChanged } from 'firebase/auth';
import { create } from 'zustand';
import { auth } from '../lib/firebase';

interface AuthClaims {
  farmId: string | null;
  role: 'recorder' | 'admin' | null;
}

interface AuthState {
  user: User | null;
  claims: AuthClaims;
  // true hasta que se resuelve el primer chequeo de sesión — evita mandar
  // a la pantalla de login a alguien que en realidad ya tenía sesión
  // persistida, solo porque Firebase todavía no terminó de leerla.
  isBootstrapping: boolean;
  setUser: (user: User | null, claims: AuthClaims) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  claims: { farmId: null, role: null },
  isBootstrapping: true,
  setUser: (user, claims) => set({ user, claims, isBootstrapping: false }),
}));

// Se llama una sola vez desde app/_layout.tsx al montar la app. Usa
// onIdTokenChanged (no onAuthStateChanged) a propósito: también dispara
// cuando el token se refresca, que es justo lo que pasa después del
// onboarding cuando el cliente fuerza getIdToken(true) para recibir las
// claims farmId/role recién asignadas (ver auth.controller.ts en server-app).
export function bootstrapAuthListener(): () => void {
  return onIdTokenChanged(auth, async (user) => {
    if (!user) {
      useAuthStore.getState().setUser(null, { farmId: null, role: null });
      return;
    }

    const tokenResult = await user.getIdTokenResult();
    useAuthStore.getState().setUser(user, {
      farmId: (tokenResult.claims.farmId as string | undefined) ?? null,
      role: (tokenResult.claims.role as 'recorder' | 'admin' | undefined) ?? null,
    });
  });
}
