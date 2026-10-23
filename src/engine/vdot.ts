/**
 * Jack Daniels' running formulas.
 *
 * Reference points used in tests (Daniels' published tables):
 *   5K 20:00      -> VDOT 49.8
 *   5K 25:00      -> VDOT 38.3
 *   10K 40:00     -> VDOT 51.9
 *   Marathon 3:00 -> VDOT 53.5
 */

const VO2_INTERCEPT = -4.6;
const VO2_LINEAR = 0.182258;
const VO2_QUADRATIC = 0.000104;

/** Oxygen cost of running at `velocityMPerMin` (m/min). */
export function vo2AtVelocity(velocityMPerMin: number): number {
  return (
    VO2_INTERCEPT +
    VO2_LINEAR * velocityMPerMin +
    VO2_QUADRATIC * velocityMPerMin * velocityMPerMin
  );
}

/** Velocity (m/min) at which running costs `vo2` ml/kg/min. Positive root. */
export function velocityAtVo2(vo2: number): number {
  const discriminant =
    VO2_LINEAR * VO2_LINEAR - 4 * VO2_QUADRATIC * (VO2_INTERCEPT - vo2);
  if (discriminant < 0) {
    throw new Error(`VO2 ${vo2} is outside the model's range`);
  }
  return (-VO2_LINEAR + Math.sqrt(discriminant)) / (2 * VO2_QUADRATIC);
}

/** Fraction of VO2max sustainable for `durationMin` minutes. */
export function percentVo2Max(durationMin: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * durationMin) +
    0.2989558 * Math.exp(-0.1932605 * durationMin)
  );
}

export function assertPerformance(distanceM: number, timeS: number): void {
  if (!Number.isFinite(distanceM) || distanceM < 400) {
    throw new Error('Performance distance must be at least 400 m');
  }
  if (!Number.isFinite(timeS) || timeS < 60) {
    throw new Error('Performance time must be at least 60 s');
  }
}

/** VDOT from a race or time-trial result. */
export function vdotFromPerformance(distanceM: number, timeS: number): number {
  assertPerformance(distanceM, timeS);
  const minutes = timeS / 60;
  const velocity = distanceM / minutes;
  return vo2AtVelocity(velocity) / percentVo2Max(minutes);
}

/**
 * Time (s) a runner with `vdot` should be capable of over `distanceM`,
 * assuming training adequate for that distance. Bisection keeps the
 * inverse exact without an analytic approximation.
 */
export function equivalentTimeS(vdot: number, distanceM: number): number {
  if (!Number.isFinite(vdot) || vdot <= 0) throw new Error('VDOT must be positive');
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    throw new Error('Distance must be positive');
  }
  let low = 60;
  let high = 12 * 3600;
  // vdotFromPerformance decreases as time increases.
  for (let i = 0; i < 120; i += 1) {
    const mid = (low + high) / 2;
    if (vdotFromPerformance(distanceM, mid) > vdot) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** VDOT implied by a goal time, useful for "is this goal realistic?" checks. */
export function vdotRequiredFor(distanceM: number, timeS: number): number {
  return vdotFromPerformance(distanceM, timeS);
}
