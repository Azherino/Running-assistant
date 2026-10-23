import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { diffDays, startOfWeek } from '../../src/engine/dates';
import type { WorkoutType } from '../../src/engine/types';
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
import type { RunRow } from '../../src/ui/db/repository';
import {
  dateLabel,
  isoIsValid,
  kmLabel,
  parseNumber,
  parseTimeToSeconds,
  secondsToClock,
  todayISO,
} from '../../src/ui/lib/dates';
import { useAppStore } from '../../src/ui/store/useAppStore';
import { colors, font, radius, spacing, type } from '../../src/ui/theme';

const RUN_TYPES: Array<{ label: string; value: WorkoutType }> = [
  { label: 'Easy', value: 'easy' },
  { label: 'Long', value: 'long' },
  { label: 'Quality', value: 'threshold' },
  { label: 'Intervals', value: 'interval' },
  { label: 'Race', value: 'race' },
];

const TYPE_LABEL: Record<string, string> = {
  easy: 'Easy',
  long: 'Long',
  threshold: 'Quality',
  interval: 'Intervals',
  repetition: 'Speed',
  fartlek: 'Fartlek',
  hills: 'Hills',
  race: 'Race',
  rest: 'Rest',
  cross: 'Cross',
};

export default function LogScreen() {
  const rows = useAppStore((state) => state.runs);
  const logRun = useAppStore((state) => state.logRun);
  const removeRun = useAppStore((state) => state.removeRun);

  const [date, setDate] = useState(todayISO());
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [runType, setRunType] = useState<WorkoutType>('easy');
  const [rpe, setRpe] = useState<number | null>(null);
  const [hr, setHr] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const today = todayISO();
  const weekStart = startOfWeek(today);
  const weekRows = rows.filter(
    (row) =>
      row.type !== 'cross' &&
      diffDays(weekStart, row.date) >= 0 &&
      diffDays(row.date, today) >= 0,
  );
  const weekKm = weekRows.reduce((sum, row) => sum + row.distanceM / 1000, 0);

  async function submit() {
    setSaved(false);
    const cleanDate = date.trim();
    if (!isoIsValid(cleanDate)) {
      setError('Date must look like 2026-05-03.');
      return;
    }
    if (diffDays(today, cleanDate) > 0) {
      setError('You cannot log a run in the future.');
      return;
    }

    const distanceKm = parseNumber(distance);
    if (distanceKm == null || distanceKm <= 0 || distanceKm > 200) {
      setError('Distance should be between 0 and 200 km.');
      return;
    }

    const parsedDuration =
      duration.trim().length === 0 ? undefined : parseTimeToSeconds(duration);
    if (duration.trim().length > 0 && parsedDuration == null) {
      setError('Duration should look like 45:00 or 1:30:00.');
      return;
    }
    const durationS = parsedDuration ?? undefined;

    let avgHr: number | undefined;
    if (hr.trim().length > 0) {
      const parsed = parseNumber(hr);
      if (parsed == null || parsed < 40 || parsed > 230) {
        setError('Average HR should be between 40 and 230 bpm.');
        return;
      }
      avgHr = Math.round(parsed);
    }

    setError(null);
    await logRun({
      date: cleanDate,
      distanceM: Math.round(distanceKm * 1000),
      durationS,
      avgHr,
      rpe: rpe ?? undefined,
      type: runType,
      note: note.trim() || undefined,
    });

    setDistance('');
    setDuration('');
    setRpe(null);
    setHr('');
    setNote('');
    setSaved(true);
  }

  function confirmDelete(row: RunRow) {
    Alert.alert('Delete run?', `${kmLabel(row.distanceM)} km on ${dateLabel(row.date)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeRun(row.id) },
    ]);
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Log"
        title="Add a run"
        subtitle={`${weekKm.toFixed(1)} km this week · ${weekRows.length} ${
          weekRows.length === 1 ? 'run' : 'runs'
        }`}
        right={
          <Button
            label="Import"
            icon="cloud-upload-outline"
            variant="secondary"
            compact
            onPress={() => router.push('/import')}
          />
        }
      />

      <Card style={styles.formCard}>
        <Field label="Date" hint="YYYY-MM-DD">
          <Input
            value={date}
            onChangeText={setDate}
            placeholder="2026-05-03"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        </Field>

        <View style={styles.twoUp}>
          <View style={styles.twoUpItem}>
            <Field label="Distance" hint="km">
              <Input
                value={distance}
                onChangeText={setDistance}
                placeholder="10.0"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={styles.twoUpItem}>
            <Field label="Duration" hint="optional">
              <Input
                value={duration}
                onChangeText={setDuration}
                placeholder="52:00"
                keyboardType="numbers-and-punctuation"
              />
            </Field>
          </View>
        </View>

        <Field label="Type">
          <View style={styles.chipWrap}>
            {RUN_TYPES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={runType === option.value}
                onPress={() => setRunType(option.value)}
              />
            ))}
          </View>
        </Field>
      </Card>

      <Card style={styles.formCard}>
        <Field label="Effort (RPE)" hint="1 easy · 10 all out">
          <View style={styles.rpeWrap}>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <Pressable
                key={value}
                onPress={() => setRpe(rpe === value ? null : value)}
                style={[
                  styles.rpeChip,
                  rpe === value && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.rpeText,
                    rpe === value && { color: colors.accentInk, fontWeight: '800' },
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Average HR" hint="optional, bpm">
          <Input
            value={hr}
            onChangeText={setHr}
            placeholder="148"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="Note" hint="optional">
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Felt strong, windy, sore left shin..."
            multiline
            style={styles.noteInput}
          />
        </Field>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? (
        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.savedText}>Run saved.</Text>
        </View>
      ) : null}

      <Button label="Save run" icon="checkmark" onPress={() => void submit()} />

      <SectionTitle title="Recent runs" />
      {rows.length === 0 ? (
        <Card>
          <Text style={type.body}>No runs logged yet. The plan adapts once it has data.</Text>
        </Card>
      ) : (
        rows.slice(0, 12).map((row) => (
          <View key={row.id} style={styles.runRow}>
            <View style={styles.runIcon}>
              <Ionicons name="footsteps-outline" size={16} color={colors.accent} />
            </View>
            <View style={styles.runText}>
              <Text style={styles.runTitle}>
                {kmLabel(row.distanceM)} km · {TYPE_LABEL[row.type ?? 'easy'] ?? row.type}
              </Text>
              <Text style={styles.runMeta}>
                {dateLabel(row.date)}
                {row.durationS != null ? ` · ${secondsToClock(row.durationS)}` : ''}
                {row.rpe != null ? ` · RPE ${row.rpe}` : ''}
                {row.avgHr != null ? ` · ${row.avgHr} bpm` : ''}
              </Text>
              {row.note ? <Text style={styles.runNote}>{row.note}</Text> : null}
            </View>
            <Pressable onPress={() => confirmDelete(row)} hitSlop={10}>
              <Ionicons name="trash-outline" size={16} color={colors.muted} />
            </Pressable>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: { gap: spacing.lg },
  twoUp: { flexDirection: 'row', gap: spacing.md },
  twoUpItem: { flex: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rpeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rpeChip: {
    width: 40,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rpeText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  noteInput: { height: 88, paddingTop: spacing.md, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedText: { color: colors.success, fontSize: 13, fontWeight: '600' },
  runRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  runIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.accent}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runText: { flex: 1, gap: 3 },
  runTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  runMeta: { color: colors.muted, fontSize: 11, fontWeight: '600', fontFamily: font.mono },
  runNote: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
});
