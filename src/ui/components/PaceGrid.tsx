import { StyleSheet, Text, View } from 'react-native';
import { formatPace } from '../../engine/paces';
import type { PaceZoneName, PaceZones } from '../../engine/types';
import { colors, font, spacing, type } from '../theme';
import { Card } from './ui';

const ZONES: Array<{ key: PaceZoneName; short: string; name: string; color: string }> = [
  { key: 'easy', short: 'E', name: 'Easy', color: colors.muted },
  { key: 'marathon', short: 'M', name: 'Marathon', color: colors.base },
  { key: 'threshold', short: 'T', name: 'Threshold', color: colors.build },
  { key: 'interval', short: 'I', name: 'Interval', color: colors.peak },
  { key: 'repetition', short: 'R', name: 'Repetition', color: colors.accent },
];

export function PaceGrid({ paces }: { paces: PaceZones }) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={type.label}>Training paces</Text>
        <Text style={styles.unit}>per km</Text>
      </View>
      {ZONES.map((zone) => {
        const band = paces[zone.key];
        return (
          <View key={zone.key} style={styles.row}>
            <View style={[styles.badge, { borderColor: zone.color }]}>
              <Text style={[styles.badgeText, { color: zone.color }]}>{zone.short}</Text>
            </View>
            <Text style={styles.name}>{zone.name}</Text>
            <Text style={styles.pace}>
              {formatPace(band.minSPerKm)}–{formatPace(band.maxSPerKm)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unit: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  name: { color: colors.textDim, fontSize: 14, fontWeight: '600', flex: 1 },
  pace: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
  },
});
