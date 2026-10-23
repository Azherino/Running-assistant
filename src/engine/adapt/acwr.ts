import { addDays, diffDays, type ISODate } from '../dates';

/** Exponentially weighted moving average, the standard ACWR smoothing. */
export function ewma(values: number[], span: number): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (span + 1);
  let result = values[0] as number;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i] as number;
    result = value * alpha + result * (1 - alpha);
  }
  return result;
}

/**
 * Acute:chronic workload ratio from daily kilometres, oldest first.
 * 0.8-1.3 is the usual sweet spot; above 1.5 is a meaningful spike.
 */
export function acwrFromDailyKm(dailyKm: number[]): number {
  if (dailyKm.length === 0) return 0;
  const acute = ewma(dailyKm.slice(-7), 7);
  const chronic = ewma(dailyKm.slice(-28), 28);
  if (chronic < 0.01) return acute > 0 ? 3 : 0;
  return acute / chronic;
}

export interface DatedLoad {
  date: ISODate;
  km: number;
}

/** Builds a contiguous daily load series ending on `endDate`. */
export function dailyLoads(activities: DatedLoad[], endDate: ISODate, days = 28): number[] {
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    series.push(0);
  }
  for (const activity of activities) {
    const offset = diffDays(activity.date, endDate);
    if (offset < 0 || offset >= days) continue;
    const index = days - 1 - offset;
    series[index] = (series[index] ?? 0) + activity.km;
  }
  return series;
}

export function acwrFor(activities: DatedLoad[], endDate: ISODate): number {
  return acwrFromDailyKm(dailyLoads(activities, endDate));
}

export function acwrBand(value: number): 'low' | 'optimal' | 'high' | 'danger' {
  if (value < 0.8) return 'low';
  if (value <= 1.3) return 'optimal';
  if (value <= 1.5) return 'high';
  return 'danger';
}

/** Convenience for callers that keep a rolling window. */
export function summarizeAcwr(activities: DatedLoad[], endDate: ISODate) {
  const value = acwrFor(activities, endDate);
  return { value, band: acwrBand(value) };
}

export function nextDay(date: ISODate): ISODate {
  return addDays(date, 1);
}
