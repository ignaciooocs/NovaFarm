import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { showErrorToast } from '@/stores';
import { auth } from '@/lib/firebase';
import { colors, palettes, spacing } from '@/theme';

type AuthMode = 'login' | 'signup';

interface AuthFormProps {
  initialMode: AuthMode;
}

// Marca fija en morado para el gate de autenticación (pedido explícito del
// usuario, 2026-09-03) — deliberadamente NO usa usePalette(). El tema
// seleccionable (Ajustes) es una preferencia de la sesión ya logueada;
// login/registro es la puerta de entrada y tiene su propio color de marca
// fijo, sin importar qué tema haya quedado elegido en ese dispositivo la
// vez anterior (o el default de fábrica en una instalación nueva).
const BRAND = palettes.morado;

// Login y registro comparten este componente, pero cada uno vive en su
// propia ruta (`/login`, `/signup`) — `mode` es simplemente cuál de las dos
// es esta instancia, no estado que cambie en el lugar. Pasó por tres
// vueltas de diseño el 2026-09-03: primero un solo componente con `mode`
// como estado local (cambiar de tab no navegaba, para que se sintiera
// instantáneo); el usuario después pidió una transición notoria al cambiar
// — "que llegue desde la derecha al registro, desde la izquierda al
// login" — y eso es exactamente lo que ya hace `@react-navigation/
// native-stack` al navegar entre pantallas, así que el cambio de modo
// volvió a ser navegación real (`router.replace`, nunca `push`, para que
// la pila no crezca alternando de un lado a otro — ver `(auth)/_layout.tsx`
// para las animaciones declaradas por pantalla). El correo tipeado se pasa
// como param a la otra ruta para no perderlo si alguien cambia de opinión
// a mitad de tipear; la contraseña deliberadamente no viaja.
export function AuthForm({ initialMode }: AuthFormProps) {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

  const isSignup = initialMode === 'signup';
  const [email, setEmail] = useState(emailParam ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Confirmar contraseña (pedido del usuario, para evitar errores de tipeo
  // al registrarse) solo aplica en modo registro. El ojo para mostrar/
  // ocultar en ambos campos sirve al mismo objetivo: revisar visualmente lo
  // tipeado en vez de confiar a ciegas en que dos campos calzan.
  const passwordsMatch = !isSignup || password === confirmPassword;
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignup || confirmPassword.length > 0) &&
    passwordsMatch &&
    !loading;

  function handleSwitchMode() {
    router.replace({
      pathname: isSignup ? '/login' : '/signup',
      params: email.trim() ? { email: email.trim() } : {},
    });
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // app/index.tsx decide a dónde ir según el estado de sesión/claims que
      // onIdTokenChanged ya actualizó para este momento (home si ya tiene
      // farmId, onboarding si no).
      router.replace('/');
    } catch (err) {
      showErrorToast(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.brand, { color: BRAND.primary }]}>
              {strings.auth.brand}
            </Text>
            <Text style={styles.subtitle}>
              {isSignup ? strings.auth.signupSubtitle : strings.auth.loginSubtitle}
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              mode="outlined"
              label={strings.auth.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              left={<TextInput.Icon icon="email-outline" />}
              outlineColor={colors.border}
              activeOutlineColor={BRAND.primary}
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label={strings.auth.password}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock-outline" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onPress={() => setShowPassword((prev) => !prev)}
                />
              }
              outlineColor={colors.border}
              activeOutlineColor={BRAND.primary}
              style={styles.input}
            />

            {isSignup ? (
              <>
                <TextInput
                  mode="outlined"
                  label={strings.auth.confirmPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  left={<TextInput.Icon icon="lock-check-outline" />}
                  right={
                    <TextInput.Icon
                      icon={
                        showConfirmPassword ? 'eye-off-outline' : 'eye-outline'
                      }
                      onPress={() =>
                        setShowConfirmPassword((prev) => !prev)
                      }
                    />
                  }
                  outlineColor={colors.border}
                  activeOutlineColor={BRAND.primary}
                  style={styles.input}
                />
                {confirmPassword.length > 0 && !passwordsMatch ? (
                  <HelperText type="error">
                    {strings.auth.passwordMismatch}
                  </HelperText>
                ) : null}
              </>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              buttonColor={BRAND.primary}
              contentStyle={styles.buttonContent}
              style={styles.button}
            >
              {isSignup ? strings.auth.signupButton : strings.auth.loginButton}
            </Button>

            <Pressable onPress={handleSwitchMode} style={styles.switchLink}>
              <Text style={[styles.switchText, { color: BRAND.primary }]}>
                {isSignup ? strings.auth.hasAccount : strings.auth.noAccount}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: spacing.xl },
  header: { marginTop: spacing.xl, marginBottom: spacing.xl },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  subtitle: { color: colors.textSecondary, fontSize: 16 },
  form: { marginBottom: spacing.lg },
  input: { marginBottom: spacing.md },
  // marginTop: 'auto' dentro de un contenedor flex (scrollContent tiene
  // flexGrow:1) empuja el footer al fondo de la pantalla, sin importar qué
  // tan corto sea el formulario arriba — es lo que separa header/form/
  // footer en vez de dejarlos todos amontonados al medio.
  footer: { marginTop: 'auto' },
  buttonContent: { paddingVertical: spacing.xs },
  button: { borderRadius: 12 },
  switchLink: { marginTop: spacing.lg, alignItems: 'center' },
  switchText: { fontWeight: '600' },
});
