import { Text } from 'react-native-paper';
import { Screen } from './Screen';

interface PlaceholderScreenProps {
  title: string;
}

// Contenido temporal para rutas todavía sin lógica real — se reemplaza
// pantalla por pantalla en las tareas siguientes (ver
// docs/diagrams/ui-arquitectura.md). Confirma que la navegación completa
// existe y es recorrible desde el día uno.
export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  return (
    <Screen>
      <Text variant="headlineMedium">{title}</Text>
    </Screen>
  );
}
