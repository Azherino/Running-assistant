import type { PaceBand, PaceZoneName, PaceZones, RaceDistance } from './types';
import { equivalentTimeS } from './vdot';
import { velocityAtVo2 } from './vdot';

/**
 * Fractions of VDOT used for each training zone. These sit inside Daniels'
 * published bands; the easy band is deliberately narrower than 59-74% so
 * "easy" never drifts into steady.
 */
const FRACTIONS = {
  easySlow: 0.64,
  easyFast: 0.72,
  marathon: 0.84,
  threshold: 0.88,
  interval: 0.975,
  repetition: 1.06,
} as const;

const BAND_HALF_WIDTH_S: Record<Exclude<PaceZoneName, 'easy'>, number> = {
  marathon: 4,
  threshold: 3,
  interval: 3,
  repetition: 3,
};

/** Pace in seconds per km for a given fraction of VDOT. */
export function paceSPerKm(vdot: number, fraction: number): number {
  if (!Number.isFinite(vdot) || vdot <= 0) throw new Error('VDOT must be positive');
  const velocity = velocityAtVo2(fraction * vdot);
  return 60_000 / velocity;
}

function band(target: number, halfWidthS: number): PaceBand {
  return {
    minSPerKm: Math.round(target - halfWidthS),
    maxSPerKm: Math.round(target + halfWidthS),
  };
}

export function buildPaceZones(vdot: number): PaceZones {
  const easyFast = paceSPerKm(vdot, FRACTIONS.easyFast);
  const easySlow = paceSPerKm(vdot, FRACTIONS.easySlow);

  return {
    vdot,
    // easy min = fastest end of the range, max = slowest end.
    easy: {
      minSPerKm: Math.round(easyFast),
      maxSPerKm: Math.round(easySlow),
    },
    marathon: band(paceSPerKm(vdot, FRACTIONS.marathon), BAND_HALF_WIDTH_S.marathon),
    threshold: band(paceSPerKm(vdot, FRACTIONS.threshold), BAND_HALF_WIDTH_S.threshold),
    interval: band(paceSPerKm(vdot, FRACTIONS.interval), BAND_HALF_WIDTH_S.interval),
    repetition: band(paceSPerKm(vdot, FRACTIONS.repetition), BAND_HALF_WIDTH_S.repetition),
  };
}

export function zoneBand(paces: PaceZones, zone: PaceZoneName): PaceBand {
  return paces[zone];
}

export function bandMidpoint(pace: PaceBand): number {
  return (pace.minSPerKm + pace.maxSPerKm) / 2;
}

/** "4:32" style pace. */
export function formatPace(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "1:42:30" or "42:10" style duration. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Predicted race pace for a distance, in seconds per km. */
export function racePaceForVdot(vdot: number, distanceKm: RaceDistance): number {
  return equivalentTimeS(vdot, distanceKm * 1000) / distanceKm;
}

export const RACE_DISTANCE_LABELS: Record<RaceDistance, string> = {
  5: '5K',
  10: '10K',
  21.0975: 'Half marathon',
  42.195: 'Marathon',
};
