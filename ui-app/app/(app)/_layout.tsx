import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore } from '@/stores';

// Simétrico a (auth) y (onboarding): sin sesión, o con sesión pero sin
// farmId todavía (onboarding sin terminar), no se puede entrar a la app
// real — por ejemplo si alguien reabre un link viejo a /home.
export default function AppLayout() {
  const { user, claims, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user || !claims.farmId) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
