import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore } from '@/stores';

// Nadie que ya inició sesión debería poder llegar a login/signup (por
// ejemplo con el botón atrás) — si hay usuario, el índice raíz decide si
// corresponde onboarding o home.
export default function AuthLayout() {
  const { user, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
