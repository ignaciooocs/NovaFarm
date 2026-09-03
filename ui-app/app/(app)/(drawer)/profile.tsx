import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { strings } from '@/constants/strings';

export default function ProfileScreen() {
  return (
    <PlaceholderScreen
      title={strings.profile.title}
      edges={['bottom', 'left', 'right']}
    />
  );
}
