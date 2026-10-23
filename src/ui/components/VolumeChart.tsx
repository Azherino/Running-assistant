import { StyleSheet, Text, View } from 'react-native';
import { addDays, diffDays } from '../../engine/dates';
import type { Plan } from '../../engine/types';
import type { RunRow } from '../db/repository';
import { colors, font, spacing, type } from '../theme';
import { Card } from './ui';

const CHART_HEIGHT = 84;
const WINDOW = 8;

export function VolumeChart({
  plan,
  runs,
  currentDate,
}: {
  plan: Plan;
  runs: RunRow[];
  currentDate: string;
}) {
  const currentIndex = plan.weeks.findIndex(
    (week) =>
      diffDays(week.startDate, currentDate) >= 0 &&
      diffDays(currentDate, addDays(week.startDate, 6)) >= 0,
  );
  // Before the block starts, show the beginning; after it ends, show the end.
  const lastIndex = currentIndex < 0 ? plan.weeks.length - 1 : currentIndex;
  const weeks = plan.weeks.slice(Math.max(0, lastIndex - (WINDOW - 1)), lastIndex + 1);

  const data = weeks.map((week) => {
    const weekEnd = addDays(week.startDate, 6);
    const completed = runs
      .filter(
        (run) => diffDays(week.startDate, run.date) >= 0 && diffDays(run.date, weekEnd) >= 0,
      )
      .reduce((sum, run) => sum + run.distanceM / 1000, 0);
    return { week, completed };
  });

  const max = Math.max(1, ...data.map((entry) => Math.max(entry.week.targetVolumeKm, entry.completed)));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={type.label}>Weekly volume</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.surfaceAlt }]} />
            <Text style={styles.legendText}>plan</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.legendText}>done</Text>
          </View>
        </View>
      </View>

      <View style={styles.chart}>
        {data.map(({ week, completed }) => {
          const isCurrent = week.index === currentIndex;
          const plannedHeight = Math.max(2, (week.targetVolumeKm / max) * CHART_HEIGHT);
          const completedHeight = completed > 0 ? Math.max(2, (completed / max) * CHART_HEIGHT) : 0;
          return (
            <View key={week.index} style={styles.group}>
              <Text style={[styles.value, isCurrent && { color: colors.accent }]}>
                {completed > 0 ? Math.round(completed) : ''}
              </Text>
              <View style={styles.bars}>
                <View
                  style={[
                    styles.bar,
                    { height: plannedHeight, backgroundColor: colors.surfaceAlt },
                  ]}
                />
                <View
                  style={[
                    styles.bar,
                    {
                      height: completedHeight,
                      backgroundColor: isCurrent ? colors.accent : colors.success,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.weekLabel, isCurrent && { color: colors.accent }]}>
                W{week.index + 1}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.footnote}>
        Peak {Math.round(Math.max(...plan.weeks.map((week) => week.targetVolumeKm)))} km/week ·{' '}
        {plan.weeks.length} week block
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  group: { flex: 1, alignItems: 'center', gap: 4 },
  value: { fontSize: 9, color: colors.muted, fontFamily: font.mono },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: CHART_HEIGHT },
  bar: { width: 7, borderRadius: 3 },
  weekLabel: { fontSize: 9, color: colors.muted, fontWeight: '700' },
  footnote: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
