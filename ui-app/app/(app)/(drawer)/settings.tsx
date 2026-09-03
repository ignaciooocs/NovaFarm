import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { strings } from '@/constants/strings';

export default function SettingsScreen() {
  return (
    <PlaceholderScreen
      title={strings.settings.title}
      edges={['bottom', 'left', 'right']}
    />
  );
}
