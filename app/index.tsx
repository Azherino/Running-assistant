import { Redirect } from 'expo-router';
import { useAppStore } from '../src/ui/store/useAppStore';

export default function Index() {
  const data = useAppStore((state) => state.data);
  return <Redirect href={data ? '/today' : '/onboarding'} />;
}
