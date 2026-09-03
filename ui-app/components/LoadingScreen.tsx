import { View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

// Pantalla de espera mínima, usada mientras se resuelve el estado de sesión
// (bootstrap de auth, guardas de navegación) — evita un flash en blanco.
export function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
