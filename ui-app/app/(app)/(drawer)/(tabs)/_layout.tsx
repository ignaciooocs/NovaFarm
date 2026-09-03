import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { strings } from '@/constants/strings';
import { colors } from '@/theme';

// Tabs: solo los dos destinos que se visitan todo el tiempo (RNF-02 — pocos
// botones grandes y claros). El resto (catálogos, equipo, ajustes, perfil,
// cerrar sesión) vive en el drawer que envuelve este grupo (ver
// (drawer)/_layout.tsx). El header lo maneja este navegador, no el drawer
// (headerShown: false allá) — así el título cambia según la tab activa, y
// DrawerToggleButton es el botón hamburguesa para abrir el menú.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerLeft: () => <DrawerToggleButton tintColor={colors.textPrimary} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: strings.home.title,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: strings.home.history,
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="history" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
