/**
 * Heart-rate zones. Pace drives prescriptions; HR is the guardrail for heat,
 * hills and fatigue, so zones are deliberately simple and %HRmax based.
 */

export interface HrZone {
  name: string;
  minBpm: number;
  maxBpm: number;
  purpose: string;
}

export interface HrModel {
  maxHr: number;
  restingHr?: number;
  zones: HrZone[];
}

/** Tanaka et al. (2001), more accurate than 220-age across adult ages. */
export function estimateMaxHr(age: number): number {
  if (!Number.isFinite(age) || age < 10 || age > 100) {
    throw new Error('Age must be between 10 and 100');
  }
  return Math.round(208 - 0.7 * age);
}

export function buildHrModel(maxHr: number, restingHr?: number): HrModel {
  if (!Number.isFinite(maxHr) || maxHr < 100 || maxHr > 230) {
    throw new Error('Max HR must be between 100 and 230');
  }
  const definitions: Array<[string, number, number, string]> = [
    ['Z1', 0.5, 0.6, 'Recovery'],
    ['Z2', 0.6, 0.7, 'Easy aerobic'],
    ['Z3', 0.7, 0.8, 'Steady / marathon'],
    ['Z4', 0.8, 0.9, 'Threshold'],
    ['Z5', 0.9, 1.0, 'VO2max'],
  ];

  const zones = definitions.map(([name, low, high, purpose]) => {
    if (restingHr == null) {
      return {
        name,
        minBpm: Math.round(maxHr * low),
        maxBpm: Math.round(maxHr * high),
        purpose,
      };
    }
    // Karvonen: reserve-based zones when resting HR is known.
    const reserve = maxHr - restingHr;
    return {
      name,
      minBpm: Math.round(restingHr + reserve * low),
      maxBpm: Math.round(restingHr + reserve * high),
      purpose,
    };
  });

  return { maxHr, restingHr, zones };
}

/** Easy running should sit in Z1-Z2; Z3 on an easy day means "back off". */
export function easyHrCeiling(model: HrModel): number {
  return model.zones[1]?.maxBpm ?? Math.round(model.maxHr * 0.7);
}
