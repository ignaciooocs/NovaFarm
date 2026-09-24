import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useAuthStore } from '@/stores';

// Nadie que ya inició sesión debería poder llegar a login/signup (por
// ejemplo con el botón atrás) — si hay usuario, el índice raíz decide si
// corresponde onboarding o home.
export default function AuthLayout() {
  const { user, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Animación de entrada por pantalla, no por acción de navegación —
          expo-router usa @react-navigation/native-stack, que anima según
          la pantalla de DESTINO. AuthForm.tsx navega con router.replace()
          (nunca push) entre estas dos, así que la pila nunca crece por
          alternar de ida y vuelta. Direcciones pedidas por el usuario
          (2026-09-03): registro entra desde la derecha, login desde la
          izquierda — como avanzar/retroceder en un flujo. */}
      <Stack.Screen name="login" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen
        name="signup"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
