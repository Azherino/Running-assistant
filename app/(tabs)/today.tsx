import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildWeekReview, weekForDate } from '../../src/engine/adapt/review';
import { reviewWeek } from '../../src/engine/adapt/rules';
import { diffDays } from '../../src/engine/dates';
import { buildHrModel, easyHrCeiling, estimateMaxHr } from '../../src/engine/hr';
import { RACE_DISTANCE_LABELS } from '../../src/engine/paces';
import type { AdjustmentAction } from '../../src/engine/types';
import { Button, Card, Chip, PageHeader, PhaseBadge, Screen, SectionTitle } from '../../src/ui/components/ui';
import { PaceGrid } from '../../src/ui/components/PaceGrid';
import { WorkoutCard } from '../../src/ui/components/WorkoutCard';
import { dateLabel, todayISO } from '../../src/ui/lib/dates';
import { toEngineRuns, useAppStore } from '../../src/ui/store/useAppStore';
import { colors, font, radius, spacing, type } from '../../src/ui/theme';

function actionTone(action: AdjustmentAction): string {
  switch (action) {
    case 'medical':
      return colors.danger;
    case 'deload':
    case 'reduce':
      return colors.warning;
    case 'increase':
      return colors.success;
    case 'hold':
      return colors.base;
    default:
      return colors.accent;
  }
}

export default function TodayScreen() {
  const data = useAppStore((state) => state.data);
  const rows = useAppStore((state) => state.runs);
  const buildNextBlock = useAppStore((state) => state.buildNextBlock);
  const applyAdjustment = useAppStore((state) => state.applyAdjustment);
  const [applying, setApplying] = useState(false);
  const [painFlag, setPainFlag] = useState(false);

  const today = todayISO();
  const engineRuns = useMemo(() => toEngineRuns(rows), [rows]);

  if (!data) {
    return (
      <Screen>
        <PageHeader eyebrow="Today" title="No plan yet" />
        <Button label="Set up your plan" onPress={() => router.replace('/onboarding')} />
      </Screen>
    );
  }

  const { plan } = data;
  const raceDate = plan.goal.date;
  const daysToRace = raceDate ? diffDays(today, raceDate) : null;
  // A race block ends on race day, even if the calendar week runs a few days longer.
  const blockOver =
    diffDays(plan.endDate, today) > 0 || (daysToRace != null && daysToRace < 0);
  const week = weekForDate(plan.weeks, today) ?? plan.weeks[plan.weeks.length - 1];
  const workout = week?.workouts.find((candidate) => candidate.date === today);

  const hrModel = useMemo(() => {
    const profile = data.profile;
    if (profile.maxHr != null && profile.maxHr >= 100) {
      return buildHrModel(profile.maxHr, profile.restingHr);
    }
    if (profile.age != null) {
      return buildHrModel(estimateMaxHr(profile.age), profile.restingHr);
    }
    return null;
  }, [data.profile]);
  const easyHrCeilingValue = hrModel ? easyHrCeiling(hrModel) : undefined;
  const reviewOptions = { easyHrCeiling: easyHrCeilingValue };

  const review = week ? buildWeekReview(week, engineRuns, reviewOptions) : null;

  const upcoming = plan.weeks
    .flatMap((candidate) => candidate.workouts)
    .filter((candidate) => candidate.type !== 'rest' && diffDays(today, candidate.date) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const loggedToday = rows.filter((row) => row.date === today && row.type !== 'cross');

  // Weekly review: last completed week, and the first week the coach may
  // rewrite. Mid-week changes wait for next week so completed days never move.
  const currentWeekIndex = week?.index ?? -1;
  const lastWeek = currentWeekIndex > 0 ? plan.weeks[currentWeekIndex - 1] : null;
  const lastReview = lastWeek
    ? buildWeekReview(lastWeek, engineRuns, { injuryFlag: painFlag, easyHrCeiling: easyHrCeilingValue })
    : null;
  const adjustment = lastReview ? reviewWeek(lastReview) : null;
  const applied = lastWeek
    ? (plan.notes ?? []).some((note) => note.startsWith(lastWeek.startDate))
    : false;
  const weekHasRuns =
    week != null &&
    engineRuns.some(
      (run) =>
        run.type !== 'cross' &&
        diffDays(week.startDate, run.date) >= 0 &&
        diffDays(week.startDate, run.date) <= 6,
    );
  const canAffectCurrentWeek =
    week != null && diffDays(week.startDate, today) === 0 && !weekHasRuns;
  const targetWeekIndex =
    currentWeekIndex >= 0 ? (canAffectCurrentWeek ? currentWeekIndex : currentWeekIndex + 1) : -1;
  const targetWeek = targetWeekIndex >= 0 ? plan.weeks[targetWeekIndex] : undefined;
  const targetIsRace = targetWeek?.workouts.some((candidate) => candidate.type === 'race') ?? false;
  const canApply = !applied && targetWeek != null && !targetIsRace;

  async function handleApply() {
    if (!lastReview || !adjustment || !targetWeek || targetIsRace || applying) return;
    setApplying(true);
    try {
      await applyAdjustment(targetWeekIndex, adjustment, lastReview);
    } finally {
      setApplying(false);
    }
  }

  const subtitle = blockOver
    ? 'This block is finished.'
    : plan.mode === 'race' && plan.goal.distanceKm && daysToRace != null
      ? daysToRace === 0
        ? `${RACE_DISTANCE_LABELS[plan.goal.distanceKm]} — race day.`
        : `${RACE_DISTANCE_LABELS[plan.goal.distanceKm]} in ${daysToRace} days.`
      : `General fitness · week ${(week?.index ?? 0) + 1} of ${plan.weeks.length}`;

  const doneKm = review?.completedKm ?? 0;
  const plannedKm = week?.targetVolumeKm ?? 0;
  const progress = plannedKm > 0 ? Math.min(1, doneKm / plannedKm) : 0;

  return (
    <Screen>
      <PageHeader
        eyebrow="Today"
        title={dateLabel(today)}
        subtitle={subtitle}
        right={week ? <PhaseBadge phase={week.phase} /> : undefined}
      />

      {blockOver ? (
        <Card style={styles.blockOver}>
          <Text style={type.section}>Block complete</Text>
          <Text style={type.body}>
            {plan.mode === 'fitness'
              ? 'Build the next block with the same fitness and schedule.'
              : 'Set a new race and the coach will build a fresh plan from this week.'}
          </Text>
          {plan.mode === 'fitness' ? (
            <Button label="Build next 8 weeks" onPress={() => void buildNextBlock()} />
          ) : (
            <Button label="Start a new plan" onPress={() => router.replace('/onboarding')} />
          )}
        </Card>
      ) : (
        <>
          <SectionTitle
            title="Session"
            action={
              loggedToday.length > 0 ? (
                <View style={styles.loggedPill}>
                  <Text style={styles.loggedText}>Logged</Text>
                </View>
              ) : undefined
            }
          />
          {workout ? (
            <WorkoutCard workout={workout} />
          ) : (
            <Card>
              <Text style={type.body}>Nothing scheduled today.</Text>
            </Card>
          )}

          {workout?.type === 'rest' && upcoming ? (
            <>
              <SectionTitle title="Next session" />
              <WorkoutCard
                workout={upcoming}
                showSteps={false}
                showPurpose={false}
                onPress={() => router.push('/plan')}
              />
              <Text style={styles.upcomingDate}>{dateLabel(upcoming.date)}</Text>
            </>
          ) : null}

          {week && review ? (
            <Card style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <Text style={type.label}>Week {week.index + 1}</Text>
                <Text style={styles.weekRange}>{dateLabel(week.startDate)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <View style={styles.weekStats}>
                <Text style={styles.weekStat}>
                  <Text style={styles.weekStatValue}>{doneKm.toFixed(1)}</Text> / {plannedKm} km
                </Text>
                <Text style={styles.weekStat}>
                  <Text style={styles.weekStatValue}>{review.completedSessions}</Text> /{' '}
                  {review.plannedSessions} sessions
                </Text>
              </View>
            </Card>
          ) : null}

          {lastWeek && lastReview && adjustment ? (
            <>
              <SectionTitle
                title="Coach review"
                action={
                  <Text style={styles.weekRange}>
                    Week {lastWeek.index + 1} · {dateLabel(lastWeek.startDate)}
                  </Text>
                }
              />
              <Card style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <View
                    style={[
                      styles.actionPill,
                      { backgroundColor: `${actionTone(adjustment.action)}1F` },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: actionTone(adjustment.action) }]}>
                      {adjustment.action.toUpperCase()}
                    </Text>
                  </View>
                  {applied ? (
                    <View style={styles.appliedPill}>
                      <Text style={styles.appliedText}>APPLIED</Text>
                    </View>
                  ) : null}
                </View>

                {!applied ? (
                  <View style={styles.painRow}>
                    <Chip
                      label="Pain or injury"
                      selected={painFlag}
                      onPress={() => setPainFlag((value) => !value)}
                    />
                    <Text style={styles.painHint}>
                      {painFlag
                        ? 'All quality work is removed and volume is cut. See a physio if pain changes how you run.'
                        : 'Flag this if pain is affecting your running.'}
                    </Text>
                  </View>
                ) : null}

                <Text style={type.body}>{adjustment.reason}</Text>

                <View style={styles.weekStats}>
                  <Text style={styles.weekStat}>
                    <Text style={styles.weekStatValue}>
                      {lastReview.completedKm.toFixed(1)}
                    </Text>{' '}
                    / {lastReview.plannedKm.toFixed(1)} km
                  </Text>
                  <Text style={styles.weekStat}>
                    <Text style={styles.weekStatValue}>{lastReview.completedSessions}</Text> /{' '}
                    {lastReview.plannedSessions} sessions
                  </Text>
                  <Text style={styles.weekStat}>
                    ACWR <Text style={styles.weekStatValue}>{lastReview.acwr.toFixed(2)}</Text>
                  </Text>
                </View>

                {!applied ? (
                  <>
                    <Button
                      label={
                        applying
                          ? 'Applying…'
                          : !targetWeek
                            ? 'No weeks left'
                            : targetIsRace
                              ? 'Race week is fixed'
                              : canAffectCurrentWeek
                                ? 'Apply to this week'
                                : 'Apply from next week'
                      }
                      disabled={!canApply || applying}
                      onPress={() => void handleApply()}
                    />
                    <Text style={styles.reviewHint}>
                      {!targetWeek
                        ? 'There are no future training weeks left to adjust.'
                        : targetIsRace
                          ? 'The race week stays exactly as planned; review the taper in the full plan.'
                          : canAffectCurrentWeek
                            ? 'Only this week and the weeks after it change. Completed runs and race day stay put.'
                            : 'This week is already underway, so the change starts next week.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.appliedHint}>
                    Applied to the plan. Completed weeks and race day were left untouched.
                  </Text>
                )}
              </Card>
            </>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.action}>
              <Button label="Log a run" icon="add" onPress={() => router.push('/log')} />
            </View>
            <View style={styles.action}>
              <Button
                label="Full plan"
                variant="secondary"
                icon="calendar-outline"
                onPress={() => router.push('/plan')}
              />
            </View>
          </View>
        </>
      )}

      <SectionTitle title="Paces" />
      <PaceGrid paces={plan.paces} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loggedPill: {
    backgroundColor: `${colors.success}1F`,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  loggedText: { color: colors.success, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  weekCard: { gap: spacing.md },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekRange: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  weekStats: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  weekStat: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  weekStatValue: { color: colors.text, fontFamily: font.mono, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  upcomingDate: { color: colors.muted, fontSize: 12, marginTop: -spacing.sm },
  blockOver: { gap: spacing.lg },
  reviewCard: { gap: spacing.md },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  painRow: { gap: spacing.xs, alignItems: 'flex-start' },
  painHint: { ...type.body, color: colors.muted, fontSize: 11, lineHeight: 16 },
  actionPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  actionText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  appliedPill: {
    backgroundColor: `${colors.success}1F`,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  appliedText: { color: colors.success, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  reviewHint: { ...type.body, color: colors.muted, fontSize: 12 },
  appliedHint: { color: colors.success, fontSize: 12, fontWeight: '600' },
});
