import { localISODate, MIN_IMPORT_DISTANCE_M, workoutTypeForSport } from './common';
import type { ImportedActivity, ParseOutcome } from './types';

/**
 * Minimal FIT decoder. We only need session/record summaries, so this walks
 * the message stream and ignores most of the profile. No native dependency.
 */

const FIT_EPOCH_S = 631_065_600; // 1989-12-31T00:00:00Z, in Unix seconds.
const HEADER_SIGNATURE = '.FIT';

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}

interface MessageDef {
  global: number;
  littleEndian: boolean;
  fields: FieldDef[];
  developerFieldBytes: number;
}

interface FitRecord {
  time?: number;
  distanceM?: number;
  hr?: number;
}

interface FitSession {
  startTime?: number;
  timerS?: number;
  elapsedS?: number;
  distanceM?: number;
  avgHr?: number;
  sport?: number;
}

/** Reads one field value. Returns undefined for invalid/string values. */
function readField(
  view: DataView,
  offset: number,
  size: number,
  baseTypeByte: number,
  littleEndian: boolean,
  dataEnd: number,
): number | undefined {
  if (size <= 0 || offset + size > dataEnd) return undefined;

  const type = baseTypeByte & 0x1f;
  if (type === 7 || type === 13) return undefined; // string/byte: not useful here

  let allOnes = true;
  let allZeros = true;
  for (let i = 0; i < size; i += 1) {
    const byte = view.getUint8(offset + i);
    if (byte !== 0xff) allOnes = false;
    if (byte !== 0x00) allZeros = false;
  }

  // uint8z/uint16z/uint32z/uint64z use 0 as their invalid value.
  if ((type === 10 || type === 11 || type === 12 || type === 16) && allZeros) return undefined;
  if (type !== 10 && type !== 11 && type !== 12 && type !== 16 && allOnes) return undefined;

  switch (type) {
    case 0: // enum
    case 2: // uint8
    case 10: // uint8z
      return view.getUint8(offset);
    case 1: // sint8
      return view.getInt8(offset);
    case 3: // sint16
      return size >= 2 ? view.getInt16(offset, littleEndian) : undefined;
    case 4: // uint16
    case 11: // uint16z
      return size >= 2 ? view.getUint16(offset, littleEndian) : undefined;
    case 5: // sint32
      return size >= 4 ? view.getInt32(offset, littleEndian) : undefined;
    case 6: // uint32
    case 12: // uint32z
      return size >= 4 ? view.getUint32(offset, littleEndian) : undefined;
    case 8: // float32
      if (size < 4) return undefined;
      {
        const value = view.getFloat32(offset, littleEndian);
        return Number.isFinite(value) ? value : undefined;
      }
    case 9: // float64
      if (size < 8) return undefined;
      {
        const value = view.getFloat64(offset, littleEndian);
        return Number.isFinite(value) ? value : undefined;
      }
    case 14: // sint64
      return size >= 8 ? Number(view.getBigInt64(offset, littleEndian)) : undefined;
    case 15: // uint64
    case 16: // uint64z
      return size >= 8 ? Number(view.getBigUint64(offset, littleEndian)) : undefined;
    default:
      return undefined;
  }
}

function toDate(seconds: number | undefined): Date | null {
  if (seconds === undefined || seconds <= 0) return null;
  const date = new Date((FIT_EPOCH_S + seconds) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Parses the binary FIT export produced by watches and cycling computers. */
export function parseFit(bytes: Uint8Array): ParseOutcome {
  if (bytes.length < 12) {
    throw new Error('This FIT file is empty or truncated.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = view.getUint8(0);
  if (headerSize !== 12 && headerSize !== 14) {
    throw new Error('This does not look like a FIT activity file.');
  }

  let signature = '';
  for (let i = 0; i < HEADER_SIGNATURE.length; i += 1) {
    signature += String.fromCharCode(view.getUint8(8 + i));
  }
  if (signature !== HEADER_SIGNATURE) {
    throw new Error('This does not look like a FIT activity file.');
  }

  const dataSize = view.getUint32(4, true);
  let dataEnd = Math.min(bytes.length, headerSize + dataSize);
  if (dataEnd <= headerSize) {
    throw new Error('This FIT file is empty or truncated.');
  }
  // Some exporters write a slightly short data size. Prefer the real end when
  // there are still complete records after it.
  if (headerSize + dataSize > bytes.length) {
    dataEnd = bytes.length;
  }

  const definitions: Array<MessageDef | undefined> = [];
  const records: FitRecord[] = [];
  const sessions: FitSession[] = [];
  const warnings: string[] = [];

  let pos = headerSize;
  let lastTimestamp: number | undefined;
  let truncated = false;

  while (pos < dataEnd) {
    const header = view.getUint8(pos);
    pos += 1;

    const compressed = (header & 0x80) === 0x80;
    const isDefinition = !compressed && (header & 0x40) === 0x40;
    const localType = compressed ? (header & 0x60) >> 5 : header & 0x0f;

    if (isDefinition) {
      if (pos + 5 > dataEnd) {
        truncated = true;
        break;
      }
      pos += 1; // reserved
      const architecture = view.getUint8(pos);
      pos += 1;
      if (architecture !== 0 && architecture !== 1) {
        throw new Error('This FIT file uses an unknown byte order.');
      }
      const littleEndian = architecture === 0;
      const global = view.getUint16(pos, littleEndian);
      pos += 2;
      const fieldCount = view.getUint8(pos);
      pos += 1;

      const fields: FieldDef[] = [];
      for (let i = 0; i < fieldCount; i += 1) {
        if (pos + 3 > dataEnd) {
          truncated = true;
          break;
        }
        fields.push({
          num: view.getUint8(pos),
          size: view.getUint8(pos + 1),
          baseType: view.getUint8(pos + 2),
        });
        pos += 3;
      }
      if (truncated) break;

      let developerFieldBytes = 0;
      const hasDeveloperData = (header & 0x20) === 0x20;
      if (hasDeveloperData) {
        if (pos + 1 > dataEnd) {
          truncated = true;
          break;
        }
        const developerFieldCount = view.getUint8(pos);
        pos += 1;
        for (let i = 0; i < developerFieldCount; i += 1) {
          if (pos + 3 > dataEnd) {
            truncated = true;
            break;
          }
          developerFieldBytes += view.getUint8(pos + 1);
          pos += 3;
        }
        if (truncated) break;
      }

      definitions[localType] = { global, littleEndian, fields, developerFieldBytes };
      continue;
    }

    const definition = definitions[localType];
    if (definition === undefined) {
      warnings.push('Stopped at a record with no matching definition; the FIT file may be damaged.');
      break;
    }

    const values = new Map<number, number>();
    for (const field of definition.fields) {
      if (pos + field.size > dataEnd) {
        truncated = true;
        break;
      }
      const value = readField(
        view,
        pos,
        field.size,
        field.baseType,
        definition.littleEndian,
        dataEnd,
      );
      if (value !== undefined) values.set(field.num, value);
      pos += field.size;
    }
    if (truncated) break;

    if (pos + definition.developerFieldBytes > dataEnd) {
      truncated = true;
      break;
    }
    pos += definition.developerFieldBytes;

    // Compressed headers omit the timestamp field; rebuild it from the offset.
    if (compressed && !values.has(253)) {
      const offset = header & 0x1f;
      if (lastTimestamp !== undefined) {
        let timestamp = (lastTimestamp & ~0x1f) | offset;
        if (timestamp < lastTimestamp) timestamp += 32;
        values.set(253, timestamp);
      }
    }
    if (values.has(253)) {
      lastTimestamp = values.get(253);
    }

    if (definition.global === 20) {
      const distance = values.get(5);
      records.push({
        time: values.get(253),
        distanceM: distance !== undefined ? distance / 100 : undefined,
        hr: values.get(3),
      });
      continue;
    }

    if (definition.global === 18) {
      const timer = values.get(8);
      const elapsed = values.get(7);
      const distance = values.get(9);
      sessions.push({
        startTime: values.get(2) ?? values.get(253),
        timerS: timer !== undefined ? timer / 1000 : undefined,
        elapsedS: elapsed !== undefined ? elapsed / 1000 : undefined,
        distanceM: distance !== undefined ? distance / 100 : undefined,
        avgHr: values.get(16),
        sport: values.get(5),
      });
    }
  }

  if (truncated) {
    warnings.push('The FIT file ended in the middle of a record; some data may be missing.');
  }

  const activities: ImportedActivity[] = [];

  if (sessions.length > 0) {
    const firstRecordTime = records.find((record) => record.time !== undefined)?.time;
    const lastRecord = [...records].reverse().find((record) => record.time !== undefined);
    const fallbackDistance = [...records]
      .reverse()
      .find((record) => record.distanceM !== undefined)?.distanceM;
    const fallbackHr = mean(
      records.map((record) => record.hr).filter((hr): hr is number => hr !== undefined),
    );

    sessions.forEach((session, index) => {
      const start = toDate(session.startTime ?? (sessions.length === 1 ? firstRecordTime : undefined));
      if (start == null) {
        warnings.push(`Skipped a FIT session with no start time (session ${index + 1}).`);
        return;
      }

      let durationS =
        session.timerS != null && session.timerS > 0
          ? session.timerS
          : session.elapsedS != null && session.elapsedS > 0
            ? session.elapsedS
            : undefined;
      if (
        durationS === undefined &&
        sessions.length === 1 &&
        firstRecordTime !== undefined &&
        lastRecord?.time !== undefined
      ) {
        durationS = Math.max(0, lastRecord.time - firstRecordTime);
      }

      const distanceM =
        session.distanceM != null && session.distanceM > 0
          ? session.distanceM
          : ((sessions.length === 1 ? fallbackDistance : undefined) ?? 0);
      if (distanceM < MIN_IMPORT_DISTANCE_M) {
        warnings.push(
          `Skipped a session on ${localISODate(start)} with only ${Math.round(distanceM)} m of distance.`,
        );
        return;
      }

      const avgHr =
        session.avgHr != null && session.avgHr > 0
          ? session.avgHr
          : sessions.length === 1
            ? fallbackHr
            : undefined;
      const sport = workoutTypeForSport(session.sport);
      if (!sport.running) {
        warnings.push(
          `${localISODate(start)} was imported as cross-training (FIT sport ${session.sport ?? 'unknown'}).`,
        );
      }

      const activity: ImportedActivity = {
        date: localISODate(start),
        startTime: start.toISOString(),
        distanceM,
        source: 'fit',
        type: sport.type,
        externalId: `fit:${start.toISOString()}`,
      };
      if (durationS !== undefined && durationS > 0) activity.durationS = durationS;
      if (avgHr !== undefined) activity.avgHr = Math.round(avgHr);
      activities.push(activity);
    });
  } else {
    const timed = records.filter(
      (record): record is FitRecord & { time: number } => record.time !== undefined,
    );
    if (timed.length === 0) {
      warnings.push('No session or track data found in this FIT file.');
    } else {
      const start = toDate(timed[0].time);
      const last = timed[timed.length - 1];
      const durationS = Math.max(0, last.time - timed[0].time);
      const distanceM =
        [...records].reverse().find((record) => record.distanceM !== undefined)?.distanceM ?? 0;
      const avgHr = mean(
        records.map((record) => record.hr).filter((hr): hr is number => hr !== undefined),
      );

      if (start == null) {
        warnings.push('Skipped a FIT activity with an unreadable start time.');
      } else if (distanceM < MIN_IMPORT_DISTANCE_M) {
        warnings.push(
          `Skipped a FIT activity on ${localISODate(start)} with only ${Math.round(distanceM)} m of distance.`,
        );
      } else {
        const activity: ImportedActivity = {
          date: localISODate(start),
          startTime: start.toISOString(),
          distanceM,
          source: 'fit',
          externalId: `fit:${start.toISOString()}`,
        };
        if (durationS > 0) activity.durationS = durationS;
        if (avgHr !== undefined) activity.avgHr = Math.round(avgHr);
        activities.push(activity);
      }
    }
  }

  if (activities.length === 0 && warnings.length === 0) {
    warnings.push('No runs found in this FIT file.');
  }

  return { activities, warnings };
}
