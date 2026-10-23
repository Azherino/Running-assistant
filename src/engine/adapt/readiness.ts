import type { ISODate } from '../dates';

export interface CheckIn {
  date: ISODate;
  /** Hours slept last night. */
  sleepHours?: number;
  /** 0 (fresh) to 10 (very sore). */
  soreness?: number;
  /** 1 (flat) to 5 (great). */
  mood?: number;
  restingHr?: number;
}

export type ReadinessLabel = 'green' | 'amber' | 'red';

export interface Readiness {
  score: number;
  label: ReadinessLabel;
  reasons: string[];
  advice: string;
}

export interface ReadinessContext {
  baselineRestingHr?: number;
  yesterdayHard?: boolean;
}

/**
 * A deliberately simple, explainable readiness score. It never changes the
 * plan by itself; it tells the athlete whether to trust today's targets.
 */
export function computeReadiness(checkIn: CheckIn, context: ReadinessContext = {}): Readiness {
  let score = 100;
  const reasons: string[] = [];

  if (checkIn.sleepHours != null) {
    if (checkIn.sleepHours < 7) {
      const penalty = Math.min(25, Math.round((7 - checkIn.sleepHours) * 8));
      score -= penalty;
      reasons.push(`Short sleep (${checkIn.sleepHours} h)`);
    } else if (checkIn.sleepHours >= 8) {
      score += 3;
    }
  }

  if (checkIn.soreness != null) {
    const penalty = Math.min(40, Math.round(checkIn.soreness * 4));
    score -= penalty;
    if (checkIn.soreness >= 5) reasons.push(`High soreness (${checkIn.soreness}/10)`);
  }

  if (checkIn.restingHr != null && context.baselineRestingHr != null) {
    const delta = checkIn.restingHr - context.baselineRestingHr;
    if (delta > 5) {
      score -= Math.min(20, (delta - 5) * 3);
      reasons.push(`Resting HR ${delta > 0 ? '+' : ''}${delta} bpm above baseline`);
    }
  }

  if (checkIn.mood != null) {
    const penalty = (3 - checkIn.mood) * 4;
    if (penalty > 0) {
      score -= penalty;
      if (checkIn.mood <= 2) reasons.push('Low mood / motivation');
    }
  }

  if (context.yesterdayHard) {
    score -= 8;
    reasons.push('Hard session yesterday');
  }

  score = Math.max(5, Math.min(100, Math.round(score)));

  const label: ReadinessLabel = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
  const advice =
    label === 'green'
      ? 'Green light: run the session as written.'
      : label === 'amber'
        ? 'Amber: keep the session, but cap the quality at the prescribed pace and cut a rep if form drops.'
        : 'Red: make it easy or take the day off. Fitness is built over weeks, not today.';

  return { score, label, reasons, advice };
}
