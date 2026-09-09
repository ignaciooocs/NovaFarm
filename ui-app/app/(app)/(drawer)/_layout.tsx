import { useState } from 'react';
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
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { strings } from '@/constants/strings';
import { clearLocalData, hasUnsyncedData } from '@/db/queries';
import { auth } from '@/lib/firebase';
import { useCapabilities } from '@/lib/permissions';
import { useAuthStore, useFarmSettingsStore, usePalette } from '@/stores';
import { colors } from '@/theme';

type LogoutDialog = 'none' | 'confirm' | 'blocked-unsynced';

// "Cerrar sesión" es una acción directa acá, no una pantalla propia — se
// agrega a mano después de la lista de pantallas que arma DrawerItemList.
// Pide confirmación antes de ejecutarla (pedido del usuario, 2026-09-03) —
// es la única acción destructiva de un toque en todo el drawer, a
// diferencia de activar/desactivar catálogo (reversible, sin diálogo a
// propósito).
//
// Limpia toda la base local al confirmar (2026-09-04) — nada la vaciaba
// nunca antes, así que datos de una cuenta/farm vieja se quedaban para
// siempre en el dispositivo. Bloquea el cierre de sesión (no solo pregunta)
// si queda algo sin sincronizar — mismo criterio que ya usa el cierre de
// jornada (RF-01.2), perder cosecha real no es aceptable.
//
// Ya NO bloquea por tener una jornada abierta (sí lo hizo brevemente,
// revertido el mismo día): una jornada abierta pero ya sincronizada es
// segura de perder localmente porque getActiveWorkdayWithRecovery()
// (ver lib/recoverActiveWorkday.ts) la reconstruye sola al volver a entrar
// con la misma cuenta, leyendo el clientEntryId que el server ya le
// devuelve. Bloquear ahí no protegía nada que no se pudiera recuperar, solo
// molestaba — sobre todo pensando en el sistema multirol (ver
// ui-arquitectura.md), donde cambiar de rol nunca debería depender de
// cerrar sesión para empezar.
function DrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const [logoutDialog, setLogoutDialog] = useState<LogoutDialog>('none');

  async function handleLogoutPress() {
    const blocked = await hasUnsyncedData();
    setLogoutDialog(blocked ? 'blocked-unsynced' : 'confirm');
  }

  async function handleConfirmLogout() {
    setLogoutDialog('none');
    await clearLocalData();
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
        onPress={handleLogoutPress}
      />

      <Portal>
        <Dialog
          visible={logoutDialog === 'confirm'}
          onDismiss={() => setLogoutDialog('none')}
        >
          <Dialog.Title>{strings.settings.logout}</Dialog.Title>
          <Dialog.Content>
            <Text>{strings.settings.logoutConfirm}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialog('none')}>
              {strings.common.cancel}
            </Button>
            <Button onPress={handleConfirmLogout}>
              {strings.settings.logout}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog
          visible={logoutDialog === 'blocked-unsynced'}
          onDismiss={() => setLogoutDialog('none')}
        >
          <Dialog.Title>{strings.settings.logoutBlockedTitle}</Dialog.Title>
          <Dialog.Content>
            <Text>{strings.settings.logoutBlockedMessage}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLogoutDialog('none')}>
              {strings.common.close}
            </Button>
            <Button
              onPress={() => {
                setLogoutDialog('none');
                router.push('/sync');
              }}
            >
              {strings.settings.goToSync}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </DrawerContentScrollView>
  );
}

// Envuelve las tabs (Inicio/Historial, ver (tabs)/_layout.tsx) más las
// pantallas ocasionales/administrativas. El ítem "(tabs)" queda listado en
// el drawer (como "Inicio") a propósito, aunque Inicio también viva en la
// barra de tabs: Perfil/Ajustes/catálogos no tienen barra de tabs, así que
// sin este ítem no había forma de volver desde ahí (bug real, encontrado
// probando). Catálogos: quien puede administrarlos por rol siempre los ve,
// y un recorder los ve si farms.recordersCanManageCatalog está prendido
// (interruptor único por farm, configurable desde Ajustes — ver
// lib/farmSettings.ts). "Mi equipo" es distinto: admin y supervisor siempre
// (2026-09-04: el rol supervisor es de solo lectura, ver progreso del
// equipo es justo su propósito), sin excepción del interruptor de catálogo
// — expone datos de otras cuentas (email, roles) y ya tiene un control de
// acceso real del lado del server (RolesGuard: GET /users acepta
// 'admin'/'supervisor'), no solo esta ayuda de UX. Un recorder puro nunca
// lo ve, tenga o no prendido el interruptor. "Cambiar modo" (sistema
// multirol, ui-arquitectura.md §5) solo aparece si la cuenta tiene más de
// un rol asignado — con uno solo no hay entre qué elegir.
export default function DrawerLayout() {
  const roles = useAuthStore((state) => state.claims.roles);
  const hasMultipleRoles = roles.length > 1;
  const capabilities = useCapabilities();
  const recordersCanManageCatalog = useFarmSettingsStore(
    (state) => state.recordersCanManageCatalog,
  );
  const canManageCatalog =
    capabilities.canManageCatalog || recordersCanManageCatalog;
  const palette = usePalette();

  return (
    <Drawer
      initialRouteName="(tabs)"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        drawerActiveTintColor: palette.primary,
        // Sin esto, el botón hamburguesa que este Drawer genera solo para
        // sus pantallas (Perfil, Ajustes, catálogos, Mi equipo — (tabs)
        // tiene el suyo propio, ver headerLeft en (tabs)/_layout.tsx) queda
        // con el azul por defecto de React Navigation en vez del tema
        // elegido. Bug real reportado por el usuario (2026-09-03): el
        // hamburgués cambiaba de color en Inicio/Historial pero no en el
        // resto de las pantallas del drawer, justo por esto.
        headerTintColor: palette.primary,
        // headerTintColor también tiñe el texto del título por defecto —
        // se fija acá aparte para que títulos como "Perfil"/"Ajustes"
        // sigan neutros y solo el hamburgués use el color de marca.
        headerTitleStyle: { color: colors.textPrimary },
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
        name="(admin)/products"
        options={{
          title: strings.admin.productsTitle,
          drawerLabel: strings.admin.productsTitle,
          drawerItemStyle: canManageCatalog ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="sprout-outline"
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
          drawerItemStyle: capabilities.canViewTeam
            ? undefined
            : { display: 'none' },
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
        name="switch-role"
        options={{
          title: strings.switchRole.title,
          drawerLabel: strings.switchRole.title,
          drawerItemStyle: hasMultipleRoles ? undefined : { display: 'none' },
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-switch"
              color={color}
              size={size}
            />
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
