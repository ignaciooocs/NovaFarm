import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Screen } from '@/components/Screen';
import { strings } from '@/constants/strings';
import { getErrorMessage } from '@/lib/errors';
import { auth } from '@/lib/firebase';
import { spacing } from '@/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Todavía no tiene farmId/role (eso lo asigna el onboarding) — el
      // redirect de app/index.tsx lo manda a /role automáticamente.
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text variant="headlineMedium" style={styles.title}>
        {strings.auth.signupTitle}
      </Text>

      <TextInput
        label={strings.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        label={strings.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />

      {error ? <HelperText type="error">{error}</HelperText> : null}

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        disabled={!canSubmit}
        style={styles.button}
      >
        {strings.auth.signupButton}
      </Button>

      <Link href="/login" style={styles.link}>
        <Text>{strings.auth.hasAccount}</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  input: { marginBottom: spacing.sm },
  button: { marginTop: spacing.md },
  link: { marginTop: spacing.lg, alignSelf: 'center' },
});
