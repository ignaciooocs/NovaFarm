import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { strings } from '@/constants/strings';

// Depende de un controller de `users` que todavía no existe en server-app
// (hoy UsersService no tiene rutas HTTP propias) — queda como placeholder
// hasta que ese endpoint se construya.
export default function TeamScreen() {
  return <PlaceholderScreen title={strings.admin.teamTitle} />;
}
