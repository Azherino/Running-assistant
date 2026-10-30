import { XMLParser } from 'fast-xml-parser';
import { localISODate, MIN_IMPORT_DISTANCE_M, parseStartTime, workoutTypeForSport } from './common';
import type { ImportedActivity, ParseOutcome } from './types';

type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => ['Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function attr(node: unknown, name: string): string | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  const value = (node as XmlNode)[name];
  return typeof value === 'string' ? value : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function heartRate(node: unknown): number | undefined {
  if (node == null) return undefined;

  // Case 1: Node is already a number (some parsers do this)
  if (typeof node === 'number') return Number.isFinite(node) ? node : undefined;

  // Case 2: Node is a wrapper object
  if (typeof node === 'object') {
    // Standard TCX often wraps values in a 'Value' property
    // e.g., <AverageHeartRateBpm><Value>140</Value></AverageHeartRateBpm>
    const nodeAsObj = node as XmlNode;
    const value = nodeAsObj.Value;
    if (value != null) {
      const parsed = num(Array.isArray(value) ? value[0] : value);
      if (parsed != null) return parsed;
    }

    // Case 3: Node itself contains the value (simplified TCX)
    // e.g., <AverageHeartRateBpm>140</AverageHeartRateBpm>
    const directValue = num(node);
    if (directValue != null) return directValue;
  }

  return undefined;
}

interface TrackpointSummary {
  firstTime?: string;
  lastTime?: string;
  maxDistanceM?: number;
  heartRates: number[];
}

function summarizeTrackpoints(laps: XmlNode[]): TrackpointSummary {
  const summary: TrackpointSummary = { heartRates: [] };

  for (const lap of laps) {
    for (const track of asArray(lap.Track as XmlNode[] | undefined)) {
      for (const point of asArray((track as XmlNode).Trackpoint as XmlNode[] | undefined)) {
        const time = text(point.Time);
        if (time != null) {
          if (summary.firstTime == null) summary.firstTime = time;
          summary.lastTime = time;
        }

        const distance = num(point.DistanceMeters);
        if (distance != null) {
          summary.maxDistanceM = Math.max(summary.maxDistanceM ?? 0, distance);
        }

        const hr = heartRate(point.HeartRateBpm);
        if (hr != null) summary.heartRates.push(hr);
      }
    }
  }

  return summary;
}

function parseActivity(activity: XmlNode, warnings: string[]): ImportedActivity | null {
  const laps = asArray(activity.Lap as XmlNode[] | undefined);
  
  // Handle case where activity might be wrapped or have different property names
  const sport = attr(activity, '@_Sport') ?? (activity as any).Sport;
  const sportInfo = workoutTypeForSport(sport);

  let distanceM = 0;
  let durationS = 0;
  let hrWeighted = 0;
  let hrWeight = 0;

  for (const lap of laps) {
    const lapDist = num(lap.DistanceMeters);
    distanceM += lapDist ?? 0;

    const lapTime = num(lap.TotalTimeSeconds) ?? 0;
    durationS += lapTime;

    const lapHr = heartRate(lap.AverageHeartRateBpm);
    if (lapHr != null) {
      const weight = lapTime > 0 ? lapTime : 1;
      hrWeighted += lapHr * weight;
      hrWeight += weight;
    }
  }

  const track = summarizeTrackpoints(laps);
  if (distanceM <= 0) distanceM = track.maxDistanceM ?? 0;

  if (durationS <= 0 && track.firstTime != null && track.lastTime != null) {
    const first = parseStartTime(track.firstTime);
    const last = parseStartTime(track.lastTime);
    if (first != null && last != null) {
      durationS = Math.max(0, (last.getTime() - first.getTime()) / 1000);
    }
  }

  let avgHr: number | undefined;
  if (hrWeight > 0) {
    avgHr = hrWeighted / hrWeight;
  } else if (track.heartRates.length > 0) {
    avgHr = track.heartRates.reduce((sum, hr) => sum + hr, 0) / track.heartRates.length;
  }

  if (distanceM < MIN_IMPORT_DISTANCE_M) {
    warnings.push(
      `Skipped an activity with only ${Math.round(distanceM)} m of distance. ` +
        'It looks like an empty or test file.',
    );
    return null;
  }

  const startValue =
    text(activity.Id) ?? attr(laps[0], '@_StartTime') ?? track.firstTime ?? undefined;
  const start = parseStartTime(startValue);
  if (start == null) {
    warnings.push('Skipped an activity with no readable start time.');
    return null;
  }

  if (!sportInfo.running) {
    warnings.push(
      `${sport ?? 'Non-running activity'} on ${localISODate(start)} was imported as cross-training.`,
    );
  }

  const name = text(activity.Notes);
  const externalId = text(activity.Id);

  const result: ImportedActivity = {
    date: localISODate(start),
    startTime: start.toISOString(),
    distanceM,
    source: 'tcx',
    type: sportInfo.type,
  };
  if (durationS > 0) result.durationS = durationS;
  if (avgHr != null) result.avgHr = Math.round(avgHr);
  if (name != null && name.length > 0) result.name = name;
  if (externalId != null) result.externalId = externalId;
  return result;
}

/** Parses a TCX file. Export one or more activities, or a helpful warning. */
export function parseTcx(xml: string): ParseOutcome {
  let document: XmlNode | undefined;
  try {
    document = parser.parse(xml) as XmlNode;
  } catch {
    throw new Error('This file is not readable XML. Pick a TCX export from your watch or app.');
  }

  const root = (document?.TrainingCenterDatabase ?? document) as XmlNode | undefined;
  
  // Try to find Activities node regardless of root structure
  let activitiesNode = root?.Activities as XmlNode | undefined;
  if (activitiesNode == null && root != null) {
    // Some TCX files might have Activities directly under the root or nested differently
    const keys = Object.keys(root);
    const actKey = keys.find(k => k.toLowerCase() === 'activities');
    if (actKey) {
      activitiesNode = root[actKey] as XmlNode | undefined;
    }
  }

  if (activitiesNode == null) {
    throw new Error('No activities found. This looks like a TCX course, not an activity file.');
  }

  const rawActivities = asArray(activitiesNode.Activity as XmlNode[] | undefined);
  const activities: ImportedActivity[] = [];
  const warnings: string[] = [];

  for (const raw of rawActivities) {
    const activity = parseActivity(raw, warnings);
    if (activity != null) activities.push(activity);
  }

  if (activities.length === 0 && warnings.length === 0) {
    warnings.push('No runs found in this file.');
  }

  return { activities, warnings };
}
