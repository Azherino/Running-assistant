import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Workout, WorkoutStep } from '../../engine/types';
import { describeStep } from '../../engine/format';
import { formatMinutes } from '../../engine/format';import { colors, font, radius, spacing, type } from '../theme';
import { kmLabel } from '../lib/dates';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const TYPE_ICON: Record<Workout['type'], IoniconName> = {
  easy: 'walk-outline',
  long: 'trail-sign-outline',
  threshold: 'speedometer-outline',
  interval: 'flash-outline',
  repetition: 'flash',
  fartlek: 'pulse-outline',
  hills: 'trending-up-outline',
  race: 'trophy-outline',
  rest: 'moon-outline',
  cross: 'bicycle-outline',
};

const TYPE_COLOR: Record<Workout['type'], string> = {
  easy: colors.muted,
  long: colors.base,
  threshold: colors.build,
  interval: colors.peak,
  repetition: colors.peak,
  fartlek: colors.build,
  hills: colors.build,
  race: colors.accent,
  rest: colors.rest,
  cross: colors.taper,
};

function stepTone(step: WorkoutStep): string {
  if (step.kind === 'work') return colors.text;
  if (step.kind === 'strides') return colors.accent;
  return colors.textDim;
}

export function WorkoutCard({
  workout,
  showSteps = true,
  showPurpose = true,
  onPress,
}: {
  workout: Workout;
  showSteps?: boolean;
  showPurpose?: boolean;
  onPress?: () => void;
}) {
  const color = TYPE_COLOR[workout.type];
  const isRest = workout.type === 'rest';

  if (isRest) {
    return (
      <View style={[styles.card, styles.restCard]}>
        <View style={styles.headRow}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={TYPE_ICON.rest} size={18} color={colors.rest} />
          </View>
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.muted }]}>Rest</Text>
            {showPurpose ? <Text style={styles.purpose}>{workout.purpose}</Text> : null}
          </View>
        </View>
      </View>
    );
  }

  const body = (
    <View
      style={[
        styles.card,
        workout.type === 'race' && { borderColor: colors.accent },
        workout.hard && { borderColor: colors.borderStrong },
      ]}
    >
      <View style={styles.headRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
          <Ionicons name={TYPE_ICON[workout.type]} size={18} color={color} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>{workout.title}</Text>
          <Text style={styles.meta}>
            {kmLabel(workout.targetDistanceM)} km · {formatMinutes(workout.targetDurationS)}
            {workout.hard ? ' · key session' : ''}
          </Text>
        </View>
        {onPress ? <Ionicons name="chevron-down" size={16} color={colors.muted} /> : null}
      </View>

      {showPurpose ? <Text style={styles.purpose}>{workout.purpose}</Text> : null}

      {showSteps ? (
        <View style={styles.steps}>
          {workout.steps.map((step, index) => (
            <View key={`${step.kind}-${index}`} style={styles.stepRow}>
              <View style={[styles.stepDot, { backgroundColor: stepTone(step) }]} />
              <Text style={[styles.stepLabel, { color: stepTone(step) }]}>{step.label}</Text>
              <Text style={styles.stepValue}>{describeStep(step)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {workout.note ? <Text style={styles.note}>{workout.note}</Text> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  restCard: { backgroundColor: 'transparent' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 3 },
  title: { ...type.section },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  purpose: { ...type.body, fontSize: 14, lineHeight: 21 },
  steps: { gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepDot: { width: 4, height: 4, borderRadius: 2 },
  stepLabel: { fontSize: 13, fontWeight: '600', minWidth: 92, flexShrink: 1 },
  stepValue: {
    marginLeft: 'auto',
    fontSize: 13,
    color: colors.textDim,
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
  },
  note: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
