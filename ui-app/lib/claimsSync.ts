import { usersControllerFindMe } from '@/api/generated/users/users';
import { useAuthStore, useConnectivityStore, type Role } from '@/stores';

let inFlight: Promise<void> | null = null;

// Los roles de una cuenta viven en dos lugares: el documento de Mongo (lo
// que devuelve GET /users/me) y el custom claim del token de Firebase (lo
// que RolesGuard lee de verdad en cada request, y lo único que esta app
// tiene a mano para decidir qué mostrar). Cuando un admin cambia los roles
// de alguien, server-app actualiza los dos (ver users.service.ts
// updateRoles) — pero el token que este dispositivo ya tiene en la mano
// sigue siendo el viejo hasta que Firebase lo refresque solo (~1h) o la
// persona cierre sesión y vuelva a entrar. O sea: el cambio está hecho y no
// se ve, que es exactamente el gap que esto cierra.
//
// Sin push ni polling nuevo: compara los roles del documento contra los del
// token y, solo si difieren, fuerza getIdToken(true). El refresco dispara
// onIdTokenChanged, que es el listener que ya mantiene useAuthStore (ver
// bootstrapAuthListener) — las claims nuevas llegan al store por el mismo
// camino de siempre, no hay que escribirlas a mano acá.
//
// Mismo patrón que lib/farmSettings.ts: fire-and-forget desde un punto
// ya-online (Home) o al reconectar, dedupeada para no apilar llamadas
// concurrentes, y nunca lanza — sin conexión las claims quedan como estaban.
export function syncClaims(): Promise<void> {
  if (!inFlight) {
    inFlight = performSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performSync(): Promise<void> {
  try {
    const { user, claims } = useAuthStore.getState();
    // Sin sesión no hay token que refrescar, y /users/me respondería 401.
    if (!user) {
      return;
    }

    const me = await usersControllerFindMe();
    if (sameRoles(me.roles, claims.roles)) {
      return;
    }

    // El caso patológico (Mongo y el claim en desacuerdo permanente, si
    // alguna vez fallara el setCustomUserClaims del server) cuesta un
    // refresco de token por visita a Home, no un loop — el dedup de arriba
    // ya impide que se apilen, y el token nuevo es válido igual.
    await user.getIdToken(true);
  } catch {
    // Sin conexión (u otro error): las claims del token siguen mandando,
    // igual que antes de esta función.
  }
}

function sameRoles(fromServer: readonly string[], fromToken: Role[]): boolean {
  if (fromServer.length !== fromToken.length) {
    return false;
  }
  // Ordenadas antes de comparar: el set de roles es lo que importa, no en
  // qué orden los devolvió cada lado.
  const sortedServer = [...fromServer].sort();
  const sortedToken = [...fromToken].sort();
  return sortedServer.every((role, index) => role === sortedToken[index]);
}

// Se llama una sola vez desde app/_layout.tsx, junto a los otros bootstrap*
// — mismo motivo que ellos: en terreno la señal entra y sale, y el trigger
// de Home no alcanza si el dispositivo quedó parado ahí sin señal y la
// recupera sin navegar a ninguna otra pantalla.
export function bootstrapClaimsSyncOnReconnect(): () => void {
  return useConnectivityStore.subscribe((state, prevState) => {
    if (state.isConnected && !prevState.isConnected) {
      syncClaims();
    }
  });
}
