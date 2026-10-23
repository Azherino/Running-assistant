import {
  dateLabel,
  isoIsValid,
  kmLabel,
  parseNumber,
  parseTimeToSeconds,
  rangeLabel,
  secondsToClock,
  shiftISO,
} from '../dates';

describe('date and input formatting', () => {
  it('parses race times written the way runners write them', () => {
    expect(parseTimeToSeconds('45:00')).toBe(45 * 60);
    expect(parseTimeToSeconds('1:40:00')).toBe(100 * 60);
    expect(parseTimeToSeconds('20')).toBe(20 * 60);
    expect(parseTimeToSeconds(' 52:30 ')).toBe(52 * 60 + 30);
  });

  it('rejects impossible or malformed times', () => {
    expect(parseTimeToSeconds('1:75')).toBeNull();
    expect(parseTimeToSeconds('1:00:75')).toBeNull();
    expect(parseTimeToSeconds('abc')).toBeNull();
    expect(parseTimeToSeconds('')).toBeNull();
    expect(parseTimeToSeconds('0')).toBeNull();
    expect(parseTimeToSeconds('1:2:3:4')).toBeNull();
  });

  it('accepts comma decimals for distance and HR fields', () => {
    expect(parseNumber('5,4')).toBe(5.4);
    expect(parseNumber(' 10.2 ')).toBe(10.2);
    expect(parseNumber('0')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
    expect(parseNumber('fast')).toBeNull();
  });

  it('validates calendar dates rather than just their shape', () => {
    expect(isoIsValid('2026-05-03')).toBe(true);
    expect(isoIsValid('2026-02-29')).toBe(false);
    expect(isoIsValid('2024-02-29')).toBe(true);
    expect(isoIsValid('2026-13-01')).toBe(false);
    expect(isoIsValid('03-05-2026')).toBe(false);
  });

  it('shifts dates across month boundaries', () => {
    expect(shiftISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('keeps race-distance decimals but drops pointless ones', () => {
    expect(kmLabel(21097.5)).toBe('21.1');
    expect(kmLabel(42195)).toBe('42.2');
    expect(kmLabel(10000)).toBe('10');
    expect(kmLabel(5000)).toBe('5');
    expect(kmLabel(5750)).toBe('5.8');
  });

  it('labels ranges compactly within a month and fully across months', () => {
    expect(dateLabel('2026-01-12')).toBe('Mon 12 Jan');
    expect(rangeLabel('2026-01-05', '2026-01-11')).toBe('5–11 Jan');
    expect(rangeLabel('2026-01-26', '2026-02-01')).toBe('26 Jan – 1 Feb');
  });

  it('formats stored durations for the run list', () => {
    expect(secondsToClock(52 * 60)).toBe('52:00');
    expect(secondsToClock(100 * 60)).toBe('1:40:00');
  });
});
