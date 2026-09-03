import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore } from '@/stores';

// No se puede entrar a los pasos de onboarding sin estar logueado, y una
// vez que la cuenta ya tiene farmId (onboarding completado) tampoco se
// puede volver — server-app ya rechaza un segundo registro con 409
// (assertNotOnboarded en auth.service.ts); esto solo evita que el usuario
// llegue siquiera a intentarlo y se choque con ese error.
export default function OnboardingLayout() {
  const { user, claims, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (claims.farmId) {
    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
