import { Text } from 'react-native-paper';
import type { Edge } from 'react-native-safe-area-context';
import { Screen } from './Screen';

interface PlaceholderScreenProps {
  title: string;
  subtitle?: string;
  edges?: Edge[];
}

// Contenido temporal para rutas todavía sin lógica real — se reemplaza
// pantalla por pantalla en las tareas siguientes (ver
// docs/diagrams/ui-arquitectura.md). Confirma que la navegación completa
// existe y es recorrible desde el día uno. `subtitle` es opcional, para
// confirmar que los params de ruta (ej. el id de una jornada) llegan bien
// antes de construir la lógica real de la pantalla. `edges` se reenvía tal
// cual a Screen (ver ese componente) para las pantallas que ya tienen
// header propio (Tabs/Drawer).
export function PlaceholderScreen({
  title,
  subtitle,
  edges,
}: PlaceholderScreenProps) {
  return (
    <Screen edges={edges}>
      <Text variant="headlineMedium">{title}</Text>
      {subtitle ? <Text>{subtitle}</Text> : null}
    </Screen>
  );
}
