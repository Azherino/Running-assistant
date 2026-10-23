import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { acwrBand, acwrFor } from '../../src/engine/adapt/acwr';
import { shouldRecalibrate } from '../../src/engine/adapt/rules';
import { diffDays } from '../../src/engine/dates';
import { formatDuration, formatPace } from '../../src/engine/paces';
import { predictRaces } from '../../src/engine/race-predictor';
import type { RaceDistance } from '../../src/engine/types';
import { vdotFromPerformance } from '../../src/engine/vdot';
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  PageHeader,
  Screen,
  SectionTitle,
} from '../../src/ui/components/ui';
import { PaceGrid } from '../../src/ui/components/PaceGrid';
import { VolumeChart } from '../../src/ui/components/VolumeChart';
import { dateLabel, parseTimeToSeconds, todayISO } from '../../src/ui/lib/dates';
import { toEngineRuns, useAppStore } from '../../src/ui/store/useAppStore';
import { colors, font, radius, spacing, type } from '../../src/ui/theme';

const RESULT_DISTANCES: Array<{ value: RaceDistance; label: string }> = [
  { value: 5, label: '5K' },
  { value: 10, label: '10K' },
  { value: 21.0975, label: 'Half' },
  { value: 42.195, label: 'Marathon' },
];

const RESULT_TIME_BOUNDS: Record<RaceDistance, [number, number]> = {
  5: [720, 3600],
  10: [1500, 7200],
  21.0975: [3600, 14400],
  42.195: [7200, 25200],
};

const BAND_COLOR: Record<string, string> = {
  low: colors.base,
  optimal: colors.success,
  high: colors.warning,
  danger: colors.danger,
};

const BAND_ADVICE: Record<string, string> = {
  low: 'Load is below your recent normal. Good time to build gradually.',
  optimal: 'Load is in the sweet spot. Keep the plan steady.',
  high: 'Load is climbing quickly. Be strict about easy days.',
  danger: 'Sharp spike. Back off before it becomes an injury.',
};

export default function ProgressScreen() {
  const data = useAppStore((state) => state.data);
  const rows = useAppStore((state) => state.runs);
  const reset = useAppStore((state) => state.reset);
  const buildNextBlock = useAppStore((state) => state.buildNextBlock);
  const recalibratePaces = useAppStore((state) => state.recalibratePaces);
  const [resultDistance, setResultDistance] = useState<RaceDistance>(10);
  const [resultTime, setResultTime] = useState('');
  const [recalibration, setRecalibration] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayISO();
  const engineRuns = useMemo(
    () => toEngineRuns(rows).filter((run) => run.type !== 'cross'),
    [rows],
  );
  const acwr = useMemo(
    () =>
      acwrFor(
        engineRuns.map((run) => ({ date: run.date, km: run.distanceM / 1000 })),
        today,
      ),
    [engineRuns, today],
  );

  if (!data) {
    return (
      <Screen>
        <PageHeader eyebrow="Progress" title="No data yet" />
      </Screen>
    );
  }

  const { plan } = data;
  const runningRows = rows.filter((row) => row.type !== 'cross');
  const band = acwrBand(acwr);
  const predictions = predictRaces(plan.vdot);
  const totals = runningRows.reduce(
    (acc, row) => {
      const age = diffDays(row.date, today);
      acc.total += row.distanceM / 1000;
      if (age >= 0 && age < 7) acc.week += row.distanceM / 1000;
      if (age >= 0 && age < 28) acc.month += row.distanceM / 1000;
      return acc;
    },
    { total: 0, week: 0, month: 0 },
  );

  async function submitRecalibration() {
    const timeS = parseTimeToSeconds(resultTime);
    if (timeS == null || timeS < 240) {
      setRecalibration({
        tone: 'error',
        message: 'Add a result. Use mm:ss for 5K/10K or h:mm:ss for longer races.',
      });
      return;
    }

    const [minTime, maxTime] = RESULT_TIME_BOUNDS[resultDistance];
    if (timeS < minTime || timeS > maxTime) {
      setRecalibration({
        tone: 'error',
        message: 'That time does not look like a realistic result for the distance. Check it and try again.',
      });
      return;
    }

    const vdot = vdotFromPerformance(resultDistance * 1000, timeS);
    const daysUntilRace = plan.goal.date ? diffDays(today, plan.goal.date) : -1;
    if (!shouldRecalibrate(vdot, plan.vdot, daysUntilRace)) {
      setRecalibration({
        tone: 'error',
        message:
          Math.abs(vdot - plan.vdot) < 0.8
            ? 'That result is within 0.8 VDOT of your current fitness. Paces only move for a meaningful change.'
            : 'Paces are locked in the last 10 days before a race. Recalibrate after race day.',
      });
      return;
    }

    setSaving(true);
    try {
      await recalibratePaces(vdot, today);
      setRecalibration({
        tone: 'success',
        message: `Updated to VDOT ${vdot.toFixed(1)}. Future pace targets now use this result.`,
      });
      setResultTime('');
    } catch (error) {
      setRecalibration({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not update paces.',
      });
    } finally {
      setSaving(false);
    }
  }

  function confirmReset() {
    Alert.alert(
      'Start over?',
      'This deletes your plan and all logged runs from this device. There is no cloud backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void reset().then(() => router.replace('/onboarding'));
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Progress"
        title="Fitness & load"
        subtitle={`${runningRows.length} runs · ${Math.round(totals.total)} km logged`}
      />

      <Card style={styles.fitnessCard}>
        <View style={styles.fitnessHead}>
          <View>
            <Text style={type.label}>Current fitness</Text>
            <View style={styles.vdotRow}>
              <Text style={styles.vdot}>{plan.vdot.toFixed(1)}</Text>
              <Text style={styles.vdotLabel}>VDOT</Text>
            </View>
          </View>
          <View style={styles.fitnessIcon}>
            <Ionicons name="pulse" size={24} color={colors.accent} />
          </View>
        </View>
        <Text style={styles.note}>
          Derived from your recent race or time trial. A new result can recalibrate every future
          session.
        </Text>
      </Card>

      <SectionTitle title="New result" />
      <Card style={styles.recalibrateCard}>
        <Text style={styles.note}>
          A race or time trial updates VDOT and the pace targets of future sessions. Completed
          runs and race day stay fixed.
        </Text>
        <Field label="Distance">
          <View style={styles.chipWrap}>
            {RESULT_DISTANCES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={resultDistance === option.value}
                onPress={() => setResultDistance(option.value)}
              />
            ))}
          </View>
        </Field>
        <Field label="Time" hint={resultDistance >= 21 ? 'h:mm:ss' : 'mm:ss'}>
          <Input
            value={resultTime}
            onChangeText={setResultTime}
            placeholder={resultDistance >= 21 ? '1:35:00' : '42:30'}
            keyboardType="numbers-and-punctuation"
          />
        </Field>
        {recalibration ? (
          <Text
            style={[
              styles.recalibrationText,
              { color: recalibration.tone === 'success' ? colors.success : colors.danger },
            ]}
          >
            {recalibration.message}
          </Text>
        ) : null}
        <Button
          label={saving ? 'Updating…' : 'Update paces'}
          icon="speedometer-outline"
          disabled={saving}
          onPress={() => void submitRecalibration()}
        />
      </Card>

      <SectionTitle title="Equivalent races" />
      <Card style={styles.predictions}>
        {predictions.map((prediction) => (
          <View key={prediction.distanceKm} style={styles.predictionRow}>
            <Text style={styles.predictionLabel}>
              {prediction.label}
              {prediction.optimistic ? '*' : ''}
            </Text>
            <Text style={styles.predictionTime}>{formatDuration(prediction.timeS)}</Text>
            <Text style={styles.predictionPace}>{formatPace(prediction.paceSPerKm)}/km</Text>
          </View>
        ))}
        <Text style={styles.footnote}>
          * Marathon equivalents assume training for the distance and a small fade allowance.
        </Text>
      </Card>

      <VolumeChart plan={plan} runs={runningRows} currentDate={today} />

      <SectionTitle title="Training load" />
      <Card style={styles.loadCard}>
        <View style={styles.loadHead}>
          <View>
            <Text style={type.label}>Acute : chronic</Text>
            <Text style={[styles.loadValue, { color: BAND_COLOR[band] }]}>
              {runningRows.length === 0 ? '—' : acwr.toFixed(2)}
            </Text>
          </View>
          <View style={[styles.bandPill, { borderColor: BAND_COLOR[band] }]}>
            <Text style={[styles.bandText, { color: BAND_COLOR[band] }]}>{band}</Text>
          </View>
        </View>
        <Text style={styles.note}>
          {runningRows.length === 0
            ? 'Log a few weeks of running and this becomes the guardrail for load spikes.'
            : BAND_ADVICE[band]}
        </Text>
        <View style={styles.loadStats}>
          <View style={styles.loadStat}>
            <Text style={styles.loadStatValue}>{totals.week.toFixed(1)}</Text>
            <Text style={styles.loadStatLabel}>km last 7 d</Text>
          </View>
          <View style={styles.loadStat}>
            <Text style={styles.loadStatValue}>{(totals.month / 4).toFixed(1)}</Text>
            <Text style={styles.loadStatLabel}>km/wk last 4 wk</Text>
          </View>
          <View style={styles.loadStat}>
            <Text style={styles.loadStatValue}>
              {runningRows[0] ? dateLabel(runningRows[0].date).slice(4) : '—'}
            </Text>
            <Text style={styles.loadStatLabel}>last run</Text>
          </View>
        </View>
      </Card>

      <SectionTitle title="Paces" />
      <PaceGrid paces={plan.paces} />

      <SectionTitle title="Plan" />
      <Card style={styles.planCard}>
        <Text style={styles.planTitle}>
          {plan.mode === 'race' && plan.goal.date
            ? `Race on ${dateLabel(plan.goal.date)}`
            : `${plan.weeks.length} week fitness block`}
        </Text>
        <Text style={styles.note}>
          {plan.mode === 'race'
            ? 'Paces only move forward. Completed weeks are never rewritten.'
            : 'Build another block whenever this one ends. Your fitness carries over.'}
        </Text>
        {plan.mode === 'fitness' ? (
          <Button
            label="Build next 8 weeks"
            variant="secondary"
            onPress={() => void buildNextBlock()}
          />
        ) : null}
        <Button label="Start over" variant="danger" onPress={confirmReset} />
      </Card>

      <Text style={styles.version}>Running Assistant · offline · v0.1.0</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fitnessCard: { gap: spacing.md },
  fitnessHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  vdotRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: 4 },
  vdot: { fontSize: 52, fontWeight: '800', letterSpacing: -2, color: colors.text, fontFamily: font.mono },
  vdotLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  fitnessIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: `${colors.accent}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  recalibrateCard: { gap: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recalibrationText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  predictions: { gap: spacing.sm },
  predictionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  predictionLabel: { flex: 1, color: colors.textDim, fontSize: 13, fontWeight: '600' },
  predictionTime: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: font.mono,
    minWidth: 64,
    textAlign: 'right',
  },
  predictionPace: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: font.mono,
    minWidth: 58,
    textAlign: 'right',
  },
  footnote: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: spacing.xs },
  loadCard: { gap: spacing.md },
  loadHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  loadValue: { fontSize: 34, fontWeight: '800', fontFamily: font.mono, letterSpacing: -1 },
  bandPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  bandText: { fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  loadStats: { flexDirection: 'row', gap: spacing.md },
  loadStat: { flex: 1, gap: 2 },
  loadStatValue: { color: colors.text, fontSize: 15, fontWeight: '800', fontFamily: font.mono },
  loadStatLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  planCard: { gap: spacing.md },
  planTitle: { ...type.section, fontSize: 16 },
  version: {
    color: colors.rest,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.md,
    letterSpacing: 0.6,
  },
});
