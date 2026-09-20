import { useState } from 'react';
import { useRouter } from 'expo-router';
import { IconButton, Menu } from 'react-native-paper';
import { strings } from '@/constants/strings';
import { usePalette } from '@/stores';

/**
 * Los tres puntitos del header del Historial.
 *
 * Vive acá y no en la pantalla porque el header lo arma el navegador de
 * tabs (ver (tabs)/_layout.tsx), no la pantalla.
 *
 * Hoy lleva una sola opción, el historial local. Es a propósito que no sea
 * una tab ni una fila más de la lista: es una vista de respaldo, para cuando
 * algo no cuadra con el server, no algo que se mire todos los días.
 */
export function HistoryMenu() {
  const router = useRouter();
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <IconButton
          icon="dots-vertical"
          iconColor={palette.primary}
          onPress={() => setOpen(true)}
          accessibilityLabel={strings.common.more}
        />
      }
    >
      <Menu.Item
        leadingIcon="cellphone-check"
        title={strings.localHistory.menuItem}
        onPress={() => {
          setOpen(false);
          router.push('/local-history');
        }}
      />
    </Menu>
  );
}
