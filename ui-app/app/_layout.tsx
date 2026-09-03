import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { PaperProvider, Text } from 'react-native-paper';
import { LoadingScreen } from '@/components/LoadingScreen';
import { db } from '@/db/client';
// eslint-disable-next-line import/no-unresolved -- generado por `pnpm db:generate`
import migrations from '../drizzle/migrations';
import { buildTheme } from '@/theme';
import { bootstrapCatalogSyncOnReconnect } from '@/lib/catalogSync';
import { bootstrapFarmSettingsOnReconnect } from '@/lib/farmSettings';
import {
  bootstrapAuthListener,
  bootstrapConnectivityListener,
  useThemeStore,
} from '@/stores';

export default function RootLayout() {
  // Corre las migraciones de Drizzle una sola vez, antes de renderizar
  // cualquier pantalla que pueda necesitar la base local.
  const { success, error } = useMigrations(db, migrations);
  // Tema elegido por el usuario (Ajustes), persistido en el dispositivo —
  // ver stores/useThemeStore.ts. Recompone el theme de Paper solo cuando
  // cambia, no en cada render.
  const palette = useThemeStore((state) => state.palette);
  const theme = useMemo(() => buildTheme(palette), [palette]);

  useEffect(() => {
    const unsubscribeAuth = bootstrapAuthListener();
    const unsubscribeConnectivity = bootstrapConnectivityListener();
    const unsubscribeCatalogSync = bootstrapCatalogSyncOnReconnect();
    const unsubscribeFarmSettings = bootstrapFarmSettingsOnReconnect();
    return () => {
      unsubscribeAuth();
      unsubscribeConnectivity();
      unsubscribeCatalogSync();
      unsubscribeFarmSettings();
    };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Error al preparar la base de datos local: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return <LoadingScreen />;
  }

  return (
    // El drawer de (app)/(drawer)/_layout.tsx necesita este wrapper en la
    // raíz para que el gesto de deslizar a abrir/cerrar funcione.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <Stack screenOptions={{ headerShown: false }} />
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
