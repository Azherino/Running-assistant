import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../src/ui/store/useAppStore';
import { colors, spacing, type } from '../src/ui/theme';

export default function RootLayout() {
  const ready = useAppStore((state) => state.ready);
  const error = useAppStore((state) => state.error);
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.splash}>
        <Text style={type.title}>Local data problem</Text>
        <Text style={[type.body, styles.errorBody]}>{error}</Text>
        <Text style={styles.retry} onPress={() => void hydrate()}>
          Try again
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorBody: { textAlign: 'center' },
  retry: { color: colors.accent, fontWeight: '700', fontSize: 15, padding: spacing.md },
});
