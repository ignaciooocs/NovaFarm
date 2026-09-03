import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import {
  Drawer,
  DrawerContentScrollView,
  DrawerItem,
  DrawerItemList,
} from 'expo-router/drawer';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { signOut } from 'firebase/auth';
import { strings } from '@/constants/strings';
import { auth } from '@/lib/firebase';
import { useAuthStore, useFarmSettingsStore } from '@/stores';
import { colors } from '@/theme';

// "Cerrar sesión" es una acción directa acá, no una pantalla propia — se
// agrega a mano después de la lista de pantallas que arma DrawerItemList.
function DrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();

  async function handleLogout() {
    await signOut(auth);
    router.replace('/');
  }

  return (
    <DrawerContentScrollView {...props}>
      <DrawerItemList {...props} />
      <DrawerItem
        label={strings.settings.logout}
        icon={({ color, size }) => (
          <MaterialCommunityIcons name="logout" color={color} size={size} />
        )}
        onPress={handleLogout}
      />
    </DrawerContentScrollView>
  );
}

// Envuelve las tabs (Inicio/Historial, ver (tabs)/_layout.tsx) más las
// pantallas ocasionales/administrativas. El ítem "(tabs)" queda listado en
// el drawer (como "Inicio") a propósito, aunque Inicio también viva en la
// barra de tabs: Perfil/Ajustes/catálogos no tienen barra de tabs, así que
// sin este ítem no había forma de volver desde ahí (bug real, encontrado
// probando). Catálogos: admin siempre los ve, y un recorder los ve si
// farms.recordersCanManageCatalog está prendido (interruptor único por
// farm, configurable desde Ajustes — ver lib/farmSettings.ts). "Mi equipo"
// es distinto: admin-only siempre, sin excepción del interruptor — expone
// datos de otras cuentas (email, rol) y ya tiene un control de acceso real
// del lado del server (RolesGuard), no solo esta ayuda de UX.
export default function DrawerLayout() {
  const role = useAuthStore((state) => state.claims.role);
  const isAdmin = role === 'admin';
  const recordersCanManageCatalog = useFarmSettingsStore(
    (state) => state.recordersCanManageCatalog,
  );
  const canManageCatalog = isAdmin || recordersCanManageCatalog;

  return (
    <Drawer
      initialRouteName="(tabs)"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerActiveTintColor: colors.primary,
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          title: strings.home.title,
          drawerLabel: strings.home.title,
          // Sin esto no hay forma de volver a Home desde Perfil/Ajustes/
          // catálogos — esas pantallas no tienen barra de tabs, así que el
          // drawer es el único camino de vuelta.
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="profile"
        options={{
          title: strings.profile.title,
          drawerLabel: strings.profile.title,
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="(admin)/fruits"
        options={{
          title: strings.admin.fruitsTitle,
          drawerLabel: strings.admin.fruitsTitle,
          drawerItemStyle: canManageCatalog ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="fruit-cherries"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="(admin)/measurement-units"
        options={{
          title: strings.admin.measurementUnitsTitle,
          drawerLabel: strings.admin.measurementUnitsTitle,
          drawerItemStyle: canManageCatalog ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="scale-balance"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="(admin)/harvesters"
        options={{
          title: strings.admin.harvestersTitle,
          drawerLabel: strings.admin.harvestersTitle,
          drawerItemStyle: canManageCatalog ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-group"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="(admin)/team"
        options={{
          title: strings.admin.teamTitle,
          drawerLabel: strings.admin.teamTitle,
          drawerItemStyle: isAdmin ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-multiple"
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          title: strings.settings.title,
          drawerLabel: strings.settings.title,
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="cog-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Drawer>
  );
}
