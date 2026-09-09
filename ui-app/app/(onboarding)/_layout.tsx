import { Redirect, Stack, usePathname } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore, usePalette } from '@/stores';
import { colors } from '@/theme';

// No se puede entrar a los pasos de onboarding sin estar logueado, y una
// vez que la cuenta ya tiene farmId (onboarding completado) tampoco se
// puede volver — server-app ya rechaza un segundo registro con 409
// (assertNotOnboarded en auth.service.ts); esto solo evita que el usuario
// llegue siquiera a intentarlo y se choque con ese error.
//
// Excepción real, encontrada en producción (2026-09-03): create-farm.tsx y
// join-farm.tsx fuerzan `getIdToken(true)` justo después de registrar, para
// que el token en memoria ya lleve el farmId recién asignado — eso hace que
// `claims.farmId` pase a tener valor casi al instante (onIdTokenChanged
// reacciona al refresh). Sin esta excepción, el guard de abajo se disparaba
// ANTES de que la navegación a /invite-code o /starter-products alcanzara a
// mostrarse — ninguna de las dos pantallas llegaba a aparecer nunca, siempre
// se saltaba directo a /home. Estas dos son pantallas de "onboarding recién
// terminado", no de "onboarding en progreso" — necesitan farmId ya seteado
// (para las llamadas a /products en starter-products.tsx) pero siguen siendo
// parte del flujo, así que quedan exceptuadas del guard.
const POST_REGISTRATION_ROUTES = ['/invite-code', '/starter-products'];

export default function OnboardingLayout() {
  const { user, claims, isBootstrapping } = useAuthStore();
  const pathname = usePathname();
  // Mismo cuidado que (app)/_layout.tsx: sin esto, el header de las
  // pantallas que sí lo activan (create-farm, join-farm — ver más abajo)
  // queda con el azul de fábrica de React Navigation en vez del tema
  // elegido. `headerShown` sigue en false por defecto acá (role.tsx e
  // invite-code.tsx no tienen "pantalla anterior" a la que volver con
  // sentido); cada pantalla que sí necesita volver lo prende puntualmente.
  const palette = usePalette();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (claims.farmId && !POST_REGISTRATION_ROUTES.includes(pathname)) {
    return <Redirect href="/home" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: palette.primary,
        headerTitleStyle: { color: colors.textPrimary },
      }}
    />
  );
}
