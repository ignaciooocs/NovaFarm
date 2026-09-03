import { Redirect } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore } from '@/stores';

// Punto de entrada real de la app: decide a dónde mandar al usuario según
// el estado de sesión — nunca renderiza contenido propio.
export default function Index() {
  const { user, claims, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!claims.farmId) {
    return <Redirect href="/role" />;
  }

  return <Redirect href="/home" />;
}
