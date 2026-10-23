import { isDuplicate } from '../dedupe';
import { parseFit } from '../fit';
import { parseActivityFile } from '../index';
import { localISODate } from '../common';
import { parseTcx } from '../tcx';
import type { ImportedActivity } from '../types';

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-05-03T07:00:00</Id>
      <Lap StartTime="2026-05-03T07:00:00">
        <TotalTimeSeconds>600</TotalTimeSeconds>
        <DistanceMeters>2000</DistanceMeters>
        <AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm>
        <Track>
          <Trackpoint>
            <Time>2026-05-03T07:00:00</Time>
            <DistanceMeters>0</DistanceMeters>
            <HeartRateBpm><Value>140</Value></HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-05-03T07:10:00</Time>
            <DistanceMeters>2000</DistanceMeters>
            <HeartRateBpm><Value>160</Value></HeartRateBpm>
          </Trackpoint>
        </Track>
      </Lap>
      <Lap StartTime="2026-05-03T07:10:00">
        <TotalTimeSeconds>600</TotalTimeSeconds>
        <DistanceMeters>2000</DistanceMeters>
        <AverageHeartRateBpm><Value>160</Value></AverageHeartRateBpm>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

const TCX_NO_LAPS = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-05-03T07:00:00Z</Id>
      <Lap StartTime="2026-05-03T07:00:00Z">
        <Track>
          <Trackpoint>
            <Time>2026-05-03T07:00:00Z</Time>
            <DistanceMeters>0</DistanceMeters>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-05-03T07:30:00Z</Time>
            <DistanceMeters>6000</DistanceMeters>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function definition(local: number, global: number, fields: Array<[number, number, number]>): number[] {
  return [
    0x40 | local,
    0, // reserved
    0, // little endian
    ...u16(global),
    fields.length,
    ...fields.flat(),
  ];
}

function fitFile(data: number[]): Uint8Array {
  const header = [
    14, // header size
    0x10, // protocol version
    0x00,
    0x00, // profile version
    ...u32(data.length),
    0x2e,
    0x46,
    0x49,
    0x54, // ".FIT"
    0x00,
    0x00, // file CRC (not checked)
  ];
  return new Uint8Array([...header, ...data]);
}

/** A Garmin-style run: three record messages plus one session summary. */
function buildFitFixture(): Uint8Array {
  const fitStart = Math.floor(Date.UTC(2026, 4, 3, 7, 0, 0) / 1000) - 631_065_600;

  const data: number[] = [
    ...definition(0, 20, [
      [253, 4, 0x86],
      [5, 4, 0x86],
      [3, 1, 0x02],
    ]),
    0x00,
    ...u32(fitStart),
    ...u32(0),
    140,
    0x00,
    ...u32(fitStart + 600),
    ...u32(200_000),
    150,
    0x00,
    ...u32(fitStart + 1200),
    ...u32(400_000),
    160,
    ...definition(1, 18, [
      [2, 4, 0x86],
      [7, 4, 0x86],
      [8, 4, 0x86],
      [9, 4, 0x86],
      [16, 1, 0x02],
      [5, 1, 0x00],
    ]),
    0x01,
    ...u32(fitStart),
    ...u32(1_210_000),
    ...u32(1_200_000),
    ...u32(400_000),
    155,
    1, // running
  ];

  return fitFile(data);
}

/** No session message: the parser has to fall back to the record stream. */
function buildRecordOnlyFit(): Uint8Array {
  const fitStart = Math.floor(Date.UTC(2026, 4, 4, 6, 30, 0) / 1000) - 631_065_600;

  const data: number[] = [
    ...definition(0, 20, [
      [253, 4, 0x86],
      [5, 4, 0x86],
      [3, 1, 0x02],
    ]),
    0x00,
    ...u32(fitStart),
    ...u32(0),
    130,
    0x00,
    ...u32(fitStart + 900),
    ...u32(300_000),
    140,
  ];

  return fitFile(data);
}

describe('TCX import', () => {
  it('sums laps and weights heart rate by lap time', () => {
    const result = parseTcx(TCX);
    expect(result.warnings).toEqual([]);
    expect(result.activities).toHaveLength(1);

    const activity = result.activities[0];
    expect(activity.date).toBe('2026-05-03');
    expect(activity.distanceM).toBe(4000);
    expect(activity.durationS).toBe(1200);
    expect(activity.avgHr).toBe(155);
    expect(activity.type).toBe('easy');
    expect(activity.source).toBe('tcx');
  });

  it('falls back to trackpoints when lap totals are missing', () => {
    const result = parseTcx(TCX_NO_LAPS);
    expect(result.activities).toHaveLength(1);

    const activity = result.activities[0];
    expect(activity.distanceM).toBe(6000);
    expect(activity.durationS).toBe(1800);
    expect(activity.date).toBe(localISODate(new Date('2026-05-03T07:00:00Z')));
  });

  it('skips empty activities with an explanation', () => {
    const empty = TCX.replaceAll('2000', '0');
    const result = parseTcx(empty);
    expect(result.activities).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('Skipped an activity');
  });

  it('rejects files that are not activity exports', () => {
    expect(() => parseTcx('<TrainingCenterDatabase><Courses /></TrainingCenterDatabase>')).toThrow(
      /No activities found/,
    );
  });
});

describe('FIT import', () => {
  it('reads distance, timer time, heart rate, and sport from the session', () => {
    const result = parseFit(buildFitFixture());
    expect(result.warnings).toEqual([]);
    expect(result.activities).toHaveLength(1);

    const activity = result.activities[0];
    expect(activity.distanceM).toBe(4000);
    expect(activity.durationS).toBe(1200);
    expect(activity.avgHr).toBe(155);
    expect(activity.type).toBe('easy');
    expect(activity.source).toBe('fit');
    expect(activity.date).toBe(localISODate(new Date('2026-05-03T07:00:00Z')));
  });

  it('builds a run from records when there is no session message', () => {
    const result = parseFit(buildRecordOnlyFit());
    expect(result.activities).toHaveLength(1);

    const activity = result.activities[0];
    expect(activity.distanceM).toBe(3000);
    expect(activity.durationS).toBe(900);
    expect(activity.avgHr).toBe(135);
    expect(activity.type).toBeUndefined();
  });

  it('rejects files without a FIT header', () => {
    expect(() => parseFit(new Uint8Array([1, 2, 3]))).toThrow(/empty or truncated/);
    expect(() => parseFit(new Uint8Array(14))).toThrow(/FIT activity file/);
  });
});

describe('activity file dispatcher', () => {
  it('detects TCX text', () => {
    const result = parseActivityFile({ name: 'run.tcx', text: TCX });
    expect(result.activities[0].source).toBe('tcx');
  });

  it('detects FIT by extension and by magic bytes', () => {
    const bytes = buildFitFixture();
    expect(parseActivityFile({ name: 'run.fit', bytes }).activities).toHaveLength(1);
    expect(parseActivityFile({ name: 'run.bin', bytes }).activities).toHaveLength(1);
  });

  it('explains unsupported containers', () => {
    expect(() => parseActivityFile({ name: 'export.zip', bytes: new Uint8Array() })).toThrow(
      /ZIP files are not supported/,
    );
    expect(() => parseActivityFile({ name: 'run.gpx', text: '<gpx />' })).toThrow(
      /GPX files are not supported/,
    );
    expect(() => parseActivityFile({ name: 'notes.txt', text: 'hello' })).toThrow(
      /Unrecognized file format/,
    );
  });
});

describe('duplicate detection', () => {
  const imported: ImportedActivity = {
    date: '2026-05-03',
    distanceM: 10_050,
    durationS: 3000,
    source: 'tcx',
  };

  it('matches the same run within distance and duration tolerance', () => {
    expect(
      isDuplicate(imported, [{ date: '2026-05-03', distanceM: 10_000, durationS: 2990 }]),
    ).toBe(true);
    expect(
      isDuplicate(imported, [{ date: '2026-05-03', distanceM: 10_000, durationS: null }]),
    ).toBe(true);
  });

  it('keeps genuinely different runs on the same day', () => {
    expect(
      isDuplicate(imported, [{ date: '2026-05-03', distanceM: 5000, durationS: 1500 }]),
    ).toBe(false);
    expect(
      isDuplicate(imported, [{ date: '2026-05-03', distanceM: 10_000, durationS: 2400 }]),
    ).toBe(false);
    expect(
      isDuplicate(imported, [{ date: '2026-05-04', distanceM: 10_000, durationS: 3000 }]),
    ).toBe(false);
  });
});
