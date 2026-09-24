import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore, usePalette } from '@/stores';
import { colors } from '@/theme';
import { Text } from 'react-native-paper';

// Simétrico a (auth) y (onboarding): sin sesión, o con sesión pero sin
// farmId todavía (onboarding sin terminar), no se puede entrar a la app
// real — por ejemplo si alguien reabre un link viejo a /home.
export default function AppLayout() {
  const { user, claims, isBootstrapping } = useAuthStore();
  // headerTintColor: sin esto, el botón de volver de las pantallas con
  // header propio (Anotador, detalle de Historial) queda con el azul por
  // defecto de React Navigation en vez del tema elegido — Paper no tiene
  // nada que ver acá, el Stack de expo-router estiliza sus propios headers.
  const palette = usePalette();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (!user || !claims.farmId) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: palette.primary,
        // headerTintColor también tiñe el texto del título por defecto
        // (ver HeaderTitle de React Navigation) — se fija acá aparte para
        // que el título de la pantalla (ej. "Anotador") siga en el mismo
        // gris oscuro de siempre, y solo la flecha de volver use el color
        // de marca.
        headerTitleStyle: { color: colors.textPrimary },
      }}
    />
  );
}
