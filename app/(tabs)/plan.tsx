import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { weekdayName } from '../../src/engine/dates';import { formatDuration, RACE_DISTANCE_LABELS } from '../../src/engine/paces';
import { weekForDate } from '../../src/engine/adapt/review';
import { Card, PageHeader, PhaseBadge, Screen, SectionTitle, Stat } from '../../src/ui/components/ui';
import { WorkoutCard } from '../../src/ui/components/WorkoutCard';
import { dateLabel, kmLabel, longDateLabel, rangeLabel, todayISO } from '../../src/ui/lib/dates';
import { useAppStore } from '../../src/ui/store/useAppStore';
import { colors, font, phaseColors, radius, spacing, type } from '../../src/ui/theme';

export default function PlanScreen() {
  const data = useAppStore((state) => state.data);
  const today = todayISO();
  const currentWeek = data ? (weekForDate(data.plan.weeks, today)?.index ?? 0) : 0;
  const [openWeek, setOpenWeek] = useState<number | null>(currentWeek);
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);

  if (!data) {
    return (
      <Screen>
        <PageHeader eyebrow="Plan" title="No plan yet" />
      </Screen>
    );
  }

  const { plan } = data;
  const peak = Math.max(...plan.weeks.map((week) => week.targetVolumeKm));
  const goalLabel =
    plan.mode === 'race' && plan.goal.distanceKm
      ? RACE_DISTANCE_LABELS[plan.goal.distanceKm]
      : 'General fitness';
  const goalTime =
    plan.goal.targetTimeS != null ? ` · goal ${formatDuration(plan.goal.targetTimeS)}` : '';
  const subtitle =
    plan.mode === 'race' && plan.goal.date
      ? `${longDateLabel(plan.goal.date)}${goalTime}`
      : `${plan.weeks.length} week rolling block`;

  return (
    <Screen>
      <PageHeader eyebrow="Plan" title={goalLabel} subtitle={subtitle} />

      <Card>
        <View style={styles.statsRow}>
          <Stat label="Weeks" value={String(plan.weeks.length)} />
          <Stat label="Peak" value={String(Math.round(peak))} unit="km/wk" />
          <Stat label="VDOT" value={plan.vdot.toFixed(1)} accent={colors.accent} />
        </View>
        <View style={styles.dateRow}>
          <Ionicons name="flag-outline" size={14} color={colors.muted} />
          <Text style={styles.dateText}>
            {rangeLabel(plan.startDate, plan.endDate)}
          </Text>
        </View>
      </Card>

      {plan.warnings.length > 0 ? (
        <Card style={styles.warningCard}>
          <View style={styles.warningHead}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <Text style={[type.label, { color: colors.warning }]}>Coach notes</Text>
          </View>
          {plan.warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </Card>
      ) : null}

      {plan.notes && plan.notes.length > 0 ? (
        <Card style={styles.notesCard}>
          <Text style={[type.label, { color: colors.taper }]}>Changes</Text>
          {plan.notes.map((note) => (
            <Text key={note} style={styles.warningText}>
              {note}
            </Text>
          ))}
        </Card>
      ) : null}

      <SectionTitle title="Weeks" />

      {plan.weeks.map((week) => {
        const open = openWeek === week.index;
        const isCurrent = week.index === currentWeek;
        return (
          <View
            key={week.index}
            style={[
              styles.weekCard,
              isCurrent && { borderColor: colors.accent },
            ]}
          >
            <Pressable
              onPress={() => {
                setOpenWeek(open ? null : week.index);
                setOpenWorkout(null);
              }}
              style={({ pressed }) => [styles.weekHead, { opacity: pressed ? 0.8 : 1 }]}
            >
              <View
                style={[styles.phaseBar, { backgroundColor: phaseColors[week.phase] ?? colors.muted }]}
              />
              <View style={styles.weekHeadText}>
                <View style={styles.weekTitleRow}>
                  <Text style={styles.weekTitle}>Week {week.index + 1}</Text>
                  {isCurrent ? <Text style={styles.currentTag}>current</Text> : null}
                </View>
                <Text style={styles.weekMeta}>
                  {dateLabel(week.startDate)}
                  {week.isDownWeek ? ' · down week' : ''}
                </Text>
              </View>
              <View style={styles.weekRight}>
                <PhaseBadge phase={week.phase} />
                <Text style={styles.weekVolume}>{week.targetVolumeKm} km</Text>
              </View>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.muted}
              />
            </Pressable>

            {open ? (
              <View style={styles.weekBody}>
                {week.workouts.map((workout) => {
                  const isRest = workout.type === 'rest';
                  const expanded = openWorkout === workout.date;
                  return (
                    <View key={workout.date}>
                      <Pressable
                        disabled={isRest}
                        onPress={() => setOpenWorkout(expanded ? null : workout.date)}
                        style={({ pressed }) => [
                          styles.dayRow,
                          pressed && !isRest && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={styles.dayName}>{weekdayName(workout.date)}</Text>
                        <View style={styles.dayText}>
                          <Text style={[styles.dayTitle, isRest && { color: colors.muted }]}>
                            {isRest ? 'Rest' : workout.title}
                          </Text>
                          {!isRest ? (
                            <Text style={styles.dayMeta}>
                              {kmLabel(workout.targetDistanceM)} km
                              {workout.hard ? ' · key' : ''}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.dayDate}>{dateLabel(workout.date).slice(4)}</Text>
                        {!isRest ? (
                          <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={colors.muted}
                          />
                        ) : null}
                      </Pressable>
                      {expanded ? (
                        <View style={styles.workoutDetail}>
                          <WorkoutCard workout={workout} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: spacing.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  warningCard: { borderColor: `${colors.warning}55`, gap: spacing.sm },
  warningHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  warningText: { color: colors.textDim, fontSize: 13, lineHeight: 20 },
  notesCard: { borderColor: `${colors.taper}55`, gap: spacing.sm },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  phaseBar: { width: 3, height: 34, borderRadius: 2 },
  weekHeadText: { flex: 1, gap: 3 },
  weekTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weekTitle: { ...type.section, fontSize: 16 },
  currentTag: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  weekMeta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  weekRight: { alignItems: 'flex-end', gap: 4 },
  weekVolume: { color: colors.textDim, fontSize: 11, fontWeight: '700', fontFamily: font.mono },
  weekBody: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayName: {
    width: 30,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dayText: { flex: 1, gap: 2 },
  dayTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dayMeta: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  dayDate: { color: colors.muted, fontSize: 10, fontFamily: font.mono },
  workoutDetail: { paddingVertical: spacing.md },
});
