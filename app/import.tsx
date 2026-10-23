import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isDuplicate } from '../src/import/dedupe';
import { parseActivityFile } from '../src/import';
import type { ImportedActivity, ParseOutcome } from '../src/import/types';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  SectionTitle,
  Stat,
} from '../src/ui/components/ui';
import { dateLabel, kmLabel, secondsToClock } from '../src/ui/lib/dates';
import { useAppStore } from '../src/ui/store/useAppStore';
import { colors, radius, spacing, type } from '../src/ui/theme';

export default function ImportScreen() {
  const importActivities = useAppStore((state) => state.importActivities);
  const rows = useAppStore((state) => state.runs);

  const [fileName, setFileName] = useState<string | null>(null);
  const [activities, setActivities] = useState<ImportedActivity[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = activities.filter((activity) => !isDuplicate(activity, rows));

  async function pickFile() {
    setBusy(true);
    setNotice(null);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;

      setError(null);
      setWarnings([]);
      setActivities([]);
      setFileName(null);

      const asset = picked.assets[0];
      setFileName(asset.name);

      const file = new File(asset.uri);
      let outcome: ParseOutcome;
      if (asset.name.toLowerCase().endsWith('.fit')) {
        const buffer = await file.arrayBuffer();
        outcome = parseActivityFile({ name: asset.name, bytes: new Uint8Array(buffer) });
      } else {
        const text = await file.text();
        outcome = parseActivityFile({ name: asset.name, text });
      }

      setActivities(outcome.activities);
      setWarnings(outcome.warnings);
      if (outcome.activities.length === 0 && outcome.warnings.length === 0) {
        setError('No runs found in this file.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  async function addActivity(activity: ImportedActivity) {
    setError(null);
    setNotice(null);
    try {
      const result = await importActivities([activity]);
      if (result.added === 0) {
        setNotice('That run is already in your log.');
      } else {
        setNotice(`Added ${dateLabel(activity.date)} to your log.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that run.');
    }
  }

  async function addAll() {
    setError(null);
    setNotice(null);
    try {
      const result = await importActivities(pending);
      setNotice(
        `Added ${result.added} ${result.added === 1 ? 'run' : 'runs'}${
          result.skipped > 0 ? `, skipped ${result.skipped} already logged` : ''
        }.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save those runs.');
    }
  }

  return (
    <Screen>
      <PageHeader
        eyebrow="Add runs"
        title="Import"
        subtitle="Pick a TCX or FIT activity export from your watch or running app."
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close import"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/log'))}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        }
      />

      <Card>
        <SectionTitle title="Activity file" />
        <Button
          label={busy ? 'Reading file…' : fileName ? 'Choose another file' : 'Choose file'}
          icon="folder-open-outline"
          onPress={() => void pickFile()}
          disabled={busy}
        />
        {fileName ? (
          <View style={styles.fileRow}>
            <Ionicons name="document-text-outline" size={16} color={colors.muted} />
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
          </View>
        ) : (
          <Text style={type.body}>TCX and FIT files are supported. GPX is not supported yet.</Text>
        )}
      </Card>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {warnings.length > 0 ? (
        <Card style={styles.warningCard}>
          <SectionTitle title="Notes" />
          {warnings.map((warning, index) => (
            <Text key={`${index}-${warning}`} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </Card>
      ) : null}

      {activities.length > 0 ? (
        <SectionTitle
          title={`${activities.length} ${activities.length === 1 ? 'run' : 'runs'} found`}
          action={
            pending.length > 1 ? (
              <Button label="Add all new" compact onPress={() => void addAll()} />
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon="cloud-upload-outline"
          title={fileName ? 'Nothing to add' : 'No file selected'}
          body={
            fileName
              ? 'The file did not contain a run that can be logged. The notes above explain why.'
              : 'Export an activity from Garmin Connect, Coros, Polar, Suunto, or your watch, then choose the .tcx or .fit file here.'
          }
        />
      )}

      {activities.map((activity, index) => {
        const duplicate = isDuplicate(activity, rows);
        return (
          <Card key={`${activity.date}-${activity.externalId ?? index}`}>
            <View style={styles.activityHeader}>
              <View style={styles.activityTitle}>
                <Text style={type.section}>{activity.name ?? dateLabel(activity.date)}</Text>
                <Text style={type.body}>
                  {activity.name ? `${dateLabel(activity.date)} · ` : ''}
                  {activity.type === 'cross' ? 'Cross-training' : 'Run'}
                </Text>
              </View>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceLabel}>{activity.source.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.metrics}>
              <Stat label="Distance" value={kmLabel(activity.distanceM)} unit="km" />
              <Stat
                label="Time"
                value={activity.durationS != null ? secondsToClock(activity.durationS) : '—'}
              />
              <Stat
                label="Avg HR"
                value={activity.avgHr != null ? String(activity.avgHr) : '—'}
                unit={activity.avgHr != null ? 'bpm' : undefined}
              />
            </View>

            <Button
              label={
                duplicate
                  ? 'Already logged'
                  : activity.type === 'cross'
                    ? 'Add cross-training'
                    : 'Add run'
              }
              variant={duplicate ? 'secondary' : 'primary'}
              icon={duplicate ? 'checkmark' : 'add'}
              disabled={duplicate}
              onPress={() => void addActivity(activity)}
            />
          </Card>
        );
      })}

      <Card style={styles.helpCard}>
        <SectionTitle title="Where to find exports" />
        <Text style={type.body}>
          Garmin Connect: open an activity → menu → Export to TCX or FIT. Coros, Polar, and Suunto
          offer the same option in their apps or web dashboards.
        </Text>
        <Text style={type.body}>
          Huawei Health often exports a ZIP of health data. Unzip it and pick the .tcx or .fit file
          inside; ZIP files themselves cannot be imported.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileName: { ...type.body, color: colors.text, flex: 1 },
  errorCard: { borderColor: colors.danger },
  errorText: { ...type.body, color: colors.danger },
  warningCard: { borderColor: colors.warning },
  warningText: { ...type.body, color: colors.warning },
  notice: { ...type.body, color: colors.success },
  activityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  activityTitle: { flex: 1, gap: spacing.xs },
  sourceBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  sourceLabel: { ...type.label, color: colors.textDim, letterSpacing: 0.8 },
  metrics: { flexDirection: 'row', gap: spacing.md },
  helpCard: { backgroundColor: colors.surfaceAlt },
});
