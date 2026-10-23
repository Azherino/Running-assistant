import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, font, phaseColors, phaseLabels, radius, spacing, type } from '../theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const content = <View style={styles.pageContent}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {eyebrow ? <Text style={type.label}>{eyebrow}</Text> : null}
        <Text style={[type.hero, styles.headerTitle]}>{title}</Text>
        {subtitle ? <Text style={[type.body, styles.headerSubtitle]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={type.label}>{title}</Text>
      {action}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IoniconName;
  disabled?: boolean;
  compact?: boolean;
}) {
  const backgroundColor =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? 'transparent'
        : variant === 'secondary'
          ? colors.surfaceAlt
          : 'transparent';
  const textColor =
    variant === 'primary'
      ? colors.accentInk
      : variant === 'danger'
        ? colors.danger
        : colors.text;
  const borderColor = variant === 'secondary' ? colors.borderStrong : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor, borderColor, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        variant === 'danger' && styles.buttonDanger,
      ]}
    >
      {icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={textColor} /> : null}
      <Text style={[styles.buttonLabel, { color: textColor }, compact && styles.buttonLabelCompact]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={type.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={type.label}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  const color = phaseColors[phase] ?? colors.muted;
  return (
    <View style={[styles.phaseBadge, { borderColor: color }]}>
      <View style={[styles.phaseDot, { backgroundColor: color }]} />
      <Text style={[styles.phaseLabel, { color }]}>{phaseLabels[phase] ?? phase}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IoniconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card style={styles.empty}>
      <Ionicons name={icon} size={28} color={colors.muted} />
      <Text style={[type.section, styles.emptyTitle]}>{title}</Text>
      <Text style={[type.body, styles.emptyBody]}>{body}</Text>
      {action}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 120 },
  pageContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xs },
  headerTitle: { marginTop: 2 },
  headerSubtitle: { marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  buttonCompact: { height: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonDanger: { borderColor: colors.danger },
  buttonLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  buttonLabelCompact: { fontSize: 14 },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipLabel: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  chipLabelSelected: { color: colors.accentInk, fontWeight: '800' },
  field: { gap: spacing.sm },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
    fontFamily: font.display,
  },
  fieldHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  fieldError: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.border },
  stat: { flex: 1, gap: spacing.xs },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statValue: { ...type.number, fontFamily: font.mono },
  statUnit: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  phaseDot: { width: 6, height: 6, borderRadius: 3 },
  phaseLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center', lineHeight: 21 },
});
