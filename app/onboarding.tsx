import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDuration } from '../src/engine/paces';
import type { RaceDistance } from '../src/engine/types';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  PageHeader,
  Screen,
  SectionTitle,
} from '../src/ui/components/ui';
import {
  isoIsValid,
  parseNumber,
  parseTimeToSeconds,
  todayISO,
} from '../src/ui/lib/dates';
import { useAppStore } from '../src/ui/store/useAppStore';
import { colors, spacing } from '../src/ui/theme';

const RACE_DISTANCES: Array<{ value: RaceDistance; label: string }> = [
  { value: 5, label: '5K' },
  { value: 10, label: '10K' },
  { value: 21.0975, label: 'Half' },
  { value: 42.195, label: 'Marathon' },
];

const PERFORMANCE_BOUNDS: Record<RaceDistance, [number, number]> = {
  5: [720, 3600],
  10: [1500, 7200],
  21.0975: [3600, 14400],
  42.195: [7200, 25200],
};

function defaultRaceDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 16 * 7);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function OnboardingScreen() {
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const existing = useAppStore((state) => state.data);
  const existingRaceDate =
    existing?.goal.type === 'race' && existing.goal.date && existing.goal.date > todayISO()
      ? existing.goal.date
      : defaultRaceDate();

  const [performanceDistance, setPerformanceDistance] = useState<RaceDistance>(10);
  const [performanceTime, setPerformanceTime] = useState('');
  const [weeklyVolume, setWeeklyVolume] = useState(
    existing ? String(existing.profile.weeklyVolumeKm) : '25',
  );
  const [longestRun, setLongestRun] = useState(
    existing ? String(existing.profile.longestRecentKm) : '8',
  );
  const [daysPerWeek, setDaysPerWeek] = useState<3 | 4 | 5 | 6>(
    existing?.profile.daysPerWeek ?? 4,
  );
  const [longDay, setLongDay] = useState<6 | 7>(existing?.profile.preferredLongDay ?? 7);
  const [experienced, setExperienced] = useState(existing?.profile.experienced ?? false);
  const [painNote, setPainNote] = useState(existing?.profile.injuryFlags?.[0] ?? '');
  const [goalType, setGoalType] = useState<'race' | 'fitness'>(existing?.goal.type ?? 'race');
  const [goalDistance, setGoalDistance] = useState<RaceDistance>(
    existing?.goal.distanceKm ?? 21.0975,
  );
  const [raceDate, setRaceDate] = useState(existingRaceDate);
  const [goalTime, setGoalTime] = useState(
    existing?.goal.targetTimeS != null ? formatDuration(existing.goal.targetTimeS) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);

    const performanceS = parseTimeToSeconds(performanceTime);
    if (performanceS == null || performanceS < 240) {
      setError('Add a recent result. Use mm:ss for 5K/10K, or h:mm:ss for longer races.');
      return;
    }
    const [minPerformance, maxPerformance] = PERFORMANCE_BOUNDS[performanceDistance];
    if (performanceS < minPerformance || performanceS > maxPerformance) {
      setError('That time does not look like a realistic result for the distance. Check it and try again.');
      return;
    }

    const weekly = parseNumber(weeklyVolume);
    if (weekly == null || weekly > 400) {
      setError('Weekly volume should be between 1 and 400 km.');
      return;
    }

    const longest = parseNumber(longestRun);
    if (longest == null || longest > 100) {
      setError('Longest recent run should be between 1 and 100 km.');
      return;
    }

    const today = todayISO();
    const cleanDate = raceDate.trim();
    let targetTimeS: number | undefined;

    if (goalType === 'race') {
      if (!isoIsValid(cleanDate)) {
        setError('Race date must look like 2026-05-03.');
        return;
      }
      if (cleanDate <= today) {
        setError('Race date needs to be in the future.');
        return;
      }
      if (goalTime.trim().length > 0) {
        const parsed = parseTimeToSeconds(goalTime);
        if (parsed == null) {
          setError('Goal time should look like 1:40:00 or 45:00.');
          return;
        }
        if (parsed < 600) {
          setError('Goal time looks too fast. Use at least 10 minutes.');
          return;
        }
        if (parsed > 60 * 3600) {
          setError('Goal time looks too long. Use a time under 60 hours.');
          return;
        }
        targetTimeS = parsed;
      }
    }

    setBusy(true);
    try {
      await completeOnboarding({
        performance: { distanceKm: performanceDistance, timeS: performanceS },
        weeklyVolumeKm: weekly,
        longestRecentKm: longest,
        daysPerWeek,
        preferredLongDay: longDay,
        experienced,
        goal:
          goalType === 'race'
            ? {
                type: 'race',
                distanceKm: goalDistance,
                date: cleanDate,
                targetTimeS,
              }
            : { type: 'fitness' },
        painNote: painNote.trim() || undefined,
      });
      router.replace('/today');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build the plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader
        eyebrow={existing ? 'New plan' : 'Set up'}
        title="Build your plan"
        subtitle="A recent result sets your paces. Everything stays on this phone."
      />

      <SectionTitle title="01 · Recent result" />
      <Card style={styles.card}>
        <Field label="Distance">
          <View style={styles.chipWrap}>
            {RACE_DISTANCES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={performanceDistance === option.value}
                onPress={() => setPerformanceDistance(option.value)}
              />
            ))}
          </View>
        </Field>
        <Field label="Time" hint="45:00 for a 10K · 1:40:00 for a half">
          <Input
            value={performanceTime}
            onChangeText={setPerformanceTime}
            placeholder={performanceDistance >= 21 ? '1:45:00' : '45:00'}
            keyboardType="numbers-and-punctuation"
          />
        </Field>
        <Text style={styles.tiny}>
          A race or hard time trial from the last few months works best.
        </Text>
      </Card>

      <SectionTitle title="02 · Training now" />
      <Card style={styles.card}>
        <View style={styles.twoUp}>
          <View style={styles.twoUpItem}>
            <Field label="Weekly volume" hint="km / week">
              <Input
                value={weeklyVolume}
                onChangeText={setWeeklyVolume}
                keyboardType="decimal-pad"
                placeholder="25"
              />
            </Field>
          </View>
          <View style={styles.twoUpItem}>
            <Field label="Longest run" hint="km, last 6 weeks">
              <Input
                value={longestRun}
                onChangeText={setLongestRun}
                keyboardType="decimal-pad"
                placeholder="8"
              />
            </Field>
          </View>
        </View>

        <Field label="Run days per week">
          <View style={styles.chipWrap}>
            {([3, 4, 5, 6] as const).map((days) => (
              <Chip
                key={days}
                label={String(days)}
                selected={daysPerWeek === days}
                onPress={() => setDaysPerWeek(days)}
              />
            ))}
          </View>
        </Field>

        <Field label="Long run day">
          <View style={styles.chipWrap}>
            <Chip label="Saturday" selected={longDay === 6} onPress={() => setLongDay(6)} />
            <Chip label="Sunday" selected={longDay === 7} onPress={() => setLongDay(7)} />
          </View>
        </Field>

        <Field label="Running background">
          <View style={styles.chipWrap}>
            <Chip label="Newer" selected={!experienced} onPress={() => setExperienced(false)} />
            <Chip
              label="2+ years consistent"
              selected={experienced}
              onPress={() => setExperienced(true)}
            />
          </View>
        </Field>

        <Field label="Injury note" hint="Optional. Any niggle caps the weekly ramp at 5%.">
          <Input
            value={painNote}
            onChangeText={setPainNote}
            placeholder="Left knee, shin..."
          />
        </Field>
      </Card>

      <SectionTitle title="03 · Goal" />
      <Card style={styles.card}>
        <Field label="Block type">
          <View style={styles.chipWrap}>
            <Chip label="Race" selected={goalType === 'race'} onPress={() => setGoalType('race')} />
            <Chip
              label="General fitness"
              selected={goalType === 'fitness'}
              onPress={() => setGoalType('fitness')}
            />
          </View>
        </Field>

        {goalType === 'race' ? (
          <>
            <Field label="Race distance">
              <View style={styles.chipWrap}>
                {RACE_DISTANCES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={goalDistance === option.value}
                    onPress={() => setGoalDistance(option.value)}
                  />
                ))}
              </View>
            </Field>
            <Field label="Race date" hint="YYYY-MM-DD · a Sunday works best">
              <Input
                value={raceDate}
                onChangeText={setRaceDate}
                placeholder="2026-05-03"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </Field>
            <Field label="Goal time" hint="Optional. Leave empty to use your predicted time.">
              <Input
                value={goalTime}
                onChangeText={setGoalTime}
                placeholder={goalDistance >= 21 ? '1:40:00' : '45:00'}
                keyboardType="numbers-and-punctuation"
              />
            </Field>
          </>
        ) : (
          <Text style={styles.tiny}>
            An 8-week rolling block with one or two quality sessions a week. Rebuild it whenever
            you want.
          </Text>
        )}
      </Card>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <Button
        label={busy ? 'Building...' : 'Build my plan'}
        icon="arrow-forward"
        disabled={busy}
        onPress={() => void submit()}
      />
      <Text style={styles.disclaimer}>
        Training guidance, not medical advice. If pain changes how you run, stop and get it looked
        at.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  twoUp: { flexDirection: 'row', gap: spacing.md },
  twoUpItem: { flex: 1 },
  tiny: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  errorCard: { borderColor: colors.danger, backgroundColor: `${colors.danger}12` },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  disclaimer: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
