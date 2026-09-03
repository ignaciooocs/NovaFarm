import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { ActivityIndicator } from 'react-native-paper';
import { useAuthStore } from '@/stores';

// Punto de entrada real de la app: decide a dónde mandar al usuario según
// el estado de sesión — nunca renderiza contenido propio.
export default function Index() {
  const { user, claims, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!claims.farmId) {
    return <Redirect href="/role" />;
  }

  return <Redirect href="/home" />;
}
