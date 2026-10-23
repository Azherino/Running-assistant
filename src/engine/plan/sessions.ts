import { bandMidpoint, formatDuration, formatPace, RACE_DISTANCE_LABELS, zoneBand } from '../paces';
import type {
  PaceZoneName,
  PaceZones,
  Phase,
  RaceDistance,
  Workout,
  WorkoutStep,
  WorkoutType,
} from '../types';

export function stepDistanceM(step: WorkoutStep, paces: PaceZones): number {
  const reps = step.reps ?? 1;
  if (step.distanceM != null) return step.distanceM * reps;
  if (step.durationS != null) {
    const pace =
      step.paceMinSPerKm != null && step.paceMaxSPerKm != null
        ? (step.paceMinSPerKm + step.paceMaxSPerKm) / 2
        : bandMidpoint(paces.easy);
    // duration (s) / pace (s/km) * 1000 -> m
    return ((step.durationS * reps) / pace) * 1000;
  }
  return 0;
}

export function stepDurationS(step: WorkoutStep, paces: PaceZones): number {
  const reps = step.reps ?? 1;
  if (step.durationS != null) return step.durationS * reps;
  if (step.distanceM != null) {
    const pace =
      step.paceMinSPerKm != null && step.paceMaxSPerKm != null
        ? (step.paceMinSPerKm + step.paceMaxSPerKm) / 2
        : bandMidpoint(paces.easy);
    return (step.distanceM * reps * pace) / 1000;
  }
  return 0;
}

function paceBandFor(zone: PaceZoneName, paces: PaceZones) {
  const band = zoneBand(paces, zone);
  return { paceMinSPerKm: band.minSPerKm, paceMaxSPerKm: band.maxSPerKm };
}

function finalize(
  base: Omit<Workout, 'targetDistanceM' | 'targetDurationS'>,
  paces: PaceZones,
): Workout {
  const targetDistanceM = base.steps.reduce((sum, s) => sum + stepDistanceM(s, paces), 0);
  const targetDurationS = base.steps.reduce((sum, s) => sum + stepDurationS(s, paces), 0);
  return {
    ...base,
    targetDistanceM: Math.round(targetDistanceM),
    targetDurationS: Math.round(targetDurationS),
  };
}

/** Recomputes totals after steps have been edited (used by pace recalibration). */
export const withTotals = finalize;

/** Seconds spent at running effort (the 80/20 numerator). */
export function workSeconds(workout: Workout, paces: PaceZones): number {
  return workout.steps
    .filter((step) => step.kind === 'work' || step.kind === 'strides')
    .reduce((sum, step) => sum + stepDurationS(step, paces), 0);
}

/**
 * Hard work excludes easy running (including the easy part of a quality session
 * or a long run) and marathon-pace blocks, which are moderate rather than hard.
 */
export function hardWorkSeconds(workout: Workout, paces: PaceZones): number {
  return workout.steps
    .filter(
      (step) =>
        (step.kind === 'work' || step.kind === 'strides') &&
        (step.zone === 'threshold' || step.zone === 'interval' || step.zone === 'repetition'),
    )
    .reduce((sum, step) => sum + stepDurationS(step, paces), 0);
}

export function workDistanceKm(workout: Workout, paces: PaceZones): number {
  return (
    workout.steps
      .filter((step) => step.kind === 'work' || step.kind === 'strides')
      .reduce((sum, step) => sum + stepDistanceM(step, paces), 0) / 1000
  );
}

export function marathonWorkKm(workout: Workout, paces: PaceZones): number {
  return (
    workout.steps
      .filter((step) => step.zone === 'marathon')
      .reduce((sum, step) => sum + stepDistanceM(step, paces), 0) / 1000
  );
}

export function easyRun(km: number, paces: PaceZones, withStrides = false): Workout {
  const strideSteps: WorkoutStep[] = withStrides
    ? [
        {
          kind: 'strides',
          label: 'Strides',
          reps: 4,
          durationS: 20,
          zone: 'repetition',
          ...paceBandFor('repetition', paces),
        },
        {
          kind: 'recovery',
          label: 'Jog back',
          reps: 4,
          durationS: 40,
          zone: 'easy',
          ...paceBandFor('easy', paces),
        },
      ]
    : [];

  const strideDistanceM = strideSteps.reduce((sum, step) => sum + stepDistanceM(step, paces), 0);
  const mainDistanceM = Math.max(500, Math.round(km * 1000 - strideDistanceM));

  const steps: WorkoutStep[] = [
    {
      kind: 'work',
      label: 'Easy running',
      distanceM: mainDistanceM,
      zone: 'easy',
      ...paceBandFor('easy', paces),
    },
    ...strideSteps,
  ];

  return finalize(
    {
      date: '',
      type: 'easy',
      title: withStrides ? 'Easy run + strides' : 'Easy run',
      purpose: 'Aerobic base. Conversational the whole way.',
      steps,
      hard: false,
      note: withStrides ? 'Finish with 4 relaxed 20 s strides, full recovery between.' : undefined,
    },
    paces,
  );
}

export interface LongRunOptions {
  /** Finish the last N km at marathon pace (half/marathon peak weeks). */
  marathonFinishKm?: number;
}

export function longRun(km: number, paces: PaceZones, options: LongRunOptions = {}): Workout {
  const finishKm = Math.min(options.marathonFinishKm ?? 0, km * 0.4);
  const easyKm = Math.max(0, km - finishKm);
  const steps: WorkoutStep[] = [
    {
      kind: 'work',
      label: 'Easy long run',
      distanceM: Math.round(easyKm * 1000),
      zone: 'easy',
      ...paceBandFor('easy', paces),
    },
  ];

  if (finishKm >= 1) {
    steps.push({
      kind: 'work',
      label: `${finishKm.toFixed(1)} km at marathon pace`,
      distanceM: Math.round(finishKm * 1000),
      zone: 'marathon',
      ...paceBandFor('marathon', paces),
    });
  }

  return finalize(
    {
      date: '',
      type: 'long',
      title: 'Long run',
      purpose: 'Endurance and fat oxidation. Keep it easy; the last part is the only work.',
      steps,
      hard: finishKm >= 1,
    },
    paces,
  );
}

export function restDay(): Workout {
  return {
    date: '',
    type: 'rest',
    title: 'Rest',
    purpose: 'Rest is training. Walk, stretch, sleep.',
    steps: [],
    targetDistanceM: 0,
    targetDurationS: 0,
    hard: false,
  };
}

export function raceDay(
  distanceKm: RaceDistance,
  paces: PaceZones,
  targetTimeS?: number,
): Workout {
  const targetPace = targetTimeS != null ? targetTimeS / distanceKm : paces.threshold.maxSPerKm;
  const span = targetTimeS != null ? 3 : 15;

  const steps: WorkoutStep[] = [
    {
      kind: 'work',
      label: `${RACE_DISTANCE_LABELS[distanceKm]} race`,
      distanceM: Math.round(distanceKm * 1000),
      zone: 'threshold',
      paceMinSPerKm: Math.round(targetPace - span),
      paceMaxSPerKm: Math.round(targetPace + span),
    },
  ];

  return finalize(
    {
      date: '',
      type: 'race',
      title: `Race day: ${RACE_DISTANCE_LABELS[distanceKm]}`,
      purpose: 'Execute the plan. Start controlled, close hard.',
      steps,
      hard: true,
      note:
        targetTimeS != null
          ? `Goal ${formatDuration(targetTimeS)} (${formatPace(targetPace)}/km).`
          : 'No goal time set: run by feel, first half controlled.',
    },
    paces,
  );
}

export function shakeout(paces: PaceZones): Workout {
  return easyRun(3, paces, true);
}

export interface QualityTemplate {
  id: string;
  type: WorkoutType;
  title: string;
  purpose: string;
  zone: PaceZoneName;
  reps: number;
  repM?: number;
  repS?: number;
  recoveryS: number;
  phases: Phase[];
  races?: RaceDistance[];
  maxExtraReps?: number;
}

export const QUALITY_TEMPLATES: QualityTemplate[] = [
  // ---- Base: introduce structure without much cost ----
  {
    id: 'base-fartlek',
    type: 'fartlek',
    title: 'Fartlek',
    purpose: 'Surges raise aerobic power without the cost of track work.',
    zone: 'interval',
    reps: 6,
    repS: 120,
    recoveryS: 60,
    phases: ['base'],
  },
  {
    id: 'base-hills',
    type: 'hills',
    title: 'Hill repeats',
    purpose: 'Strength and form at low impact. Jog down between reps.',
    zone: 'interval',
    reps: 8,
    repS: 60,
    recoveryS: 90,
    phases: ['base'],
  },
  {
    id: 'base-tempo',
    type: 'threshold',
    title: 'Light tempo',
    purpose: 'First taste of threshold. Controlled, never racing.',
    zone: 'threshold',
    reps: 2,
    repS: 600,
    recoveryS: 120,
    phases: ['base'],
  },
  // ---- Build: real threshold and VO2 work ----
  {
    id: 'build-cruise',
    type: 'threshold',
    title: 'Cruise intervals',
    purpose: 'Threshold volume in digestible chunks.',
    zone: 'threshold',
    reps: 4,
    repS: 480,
    recoveryS: 120,
    phases: ['build'],
    maxExtraReps: 1,
  },
  {
    id: 'build-tempo',
    type: 'threshold',
    title: 'Continuous tempo',
    purpose: 'Sustained threshold. Even effort, no surges.',
    zone: 'threshold',
    reps: 1,
    repS: 1500,
    recoveryS: 0,
    phases: ['build'],
  },
  {
    id: 'build-intervals',
    type: 'interval',
    title: 'VO2 intervals',
    purpose: 'Time near VO2max. Reps are hard but controlled.',
    zone: 'interval',
    reps: 5,
    repS: 180,
    recoveryS: 120,
    phases: ['build'],
    maxExtraReps: 1,
  },
  {
    id: 'build-progression',
    type: 'threshold',
    title: 'Progression run',
    purpose: 'Learn to lift the pace on tired legs.',
    zone: 'marathon',
    reps: 1,
    repS: 1200,
    recoveryS: 0,
    phases: ['build'],
  },
  // ---- Peak: race specific ----
  {
    id: 'peak-5k-800',
    type: 'interval',
    title: '5K: race-pace reps',
    purpose: 'Race pace support. Full control, no sprinting.',
    zone: 'interval',
    reps: 6,
    repM: 800,
    recoveryS: 120,
    phases: ['peak'],
    races: [5],
    maxExtraReps: 2,
  },
  {
    id: 'peak-5k-1k',
    type: 'interval',
    title: '5K: race-effort intervals',
    purpose: 'Extend time at goal 5K effort.',
    zone: 'interval',
    reps: 5,
    repM: 1000,
    recoveryS: 150,
    phases: ['peak'],
    races: [5],
  },
  {
    id: 'peak-5k-tempo',
    type: 'threshold',
    title: '5K: threshold reps',
    purpose: 'Hold pace while mildly fatigued.',
    zone: 'threshold',
    reps: 3,
    repM: 1600,
    recoveryS: 90,
    phases: ['peak'],
    races: [5],
  },
  {
    id: 'peak-10k-2k',
    type: 'threshold',
    title: '10K: threshold reps',
    purpose: 'Goal 10K effort with short recoveries.',
    zone: 'threshold',
    reps: 4,
    repM: 2000,
    recoveryS: 120,
    phases: ['peak'],
    races: [10],
  },
  {
    id: 'peak-10k-1k',
    type: 'interval',
    title: '10K: speed reps',
    purpose: 'Speed support for the last third of the race.',
    zone: 'interval',
    reps: 6,
    repM: 1000,
    recoveryS: 120,
    phases: ['peak'],
    races: [10],
  },
  {
    id: 'peak-10k-3k',
    type: 'threshold',
    title: '10K: threshold endurance',
    purpose: 'Race-specific endurance at threshold.',
    zone: 'threshold',
    reps: 3,
    repM: 3000,
    recoveryS: 180,
    phases: ['peak'],
    races: [10],
  },
  {
    id: 'peak-hm-3k',
    type: 'threshold',
    title: 'Half: threshold reps',
    purpose: 'Extend threshold blocks toward race duration.',
    zone: 'threshold',
    reps: 3,
    repM: 3000,
    recoveryS: 180,
    phases: ['peak'],
    races: [21.0975],
  },
  {
    id: 'peak-hm-5k',
    type: 'threshold',
    title: 'Half: long threshold',
    purpose: 'Long threshold blocks. This is the race in miniature.',
    zone: 'threshold',
    reps: 2,
    repM: 5000,
    recoveryS: 240,
    phases: ['peak'],
    races: [21.0975],
  },
  {
    id: 'peak-hm-m',
    type: 'threshold',
    title: 'Half: steady endurance',
    purpose: 'Controlled steady running just under goal effort.',
    zone: 'marathon',
    reps: 2,
    repM: 4000,
    recoveryS: 180,
    phases: ['peak'],
    races: [21.0975],
  },
  {
    id: 'peak-m-8k',
    type: 'threshold',
    title: 'Marathon: race-pace blocks',
    purpose: 'Race-pace volume. Fuel and pace discipline.',
    zone: 'marathon',
    reps: 2,
    repM: 8000,
    recoveryS: 300,
    phases: ['peak'],
    races: [42.195],
  },
  {
    id: 'peak-m-5k',
    type: 'threshold',
    title: 'Marathon: race-pace repeats',
    purpose: 'Controlled race-pace repeats.',
    zone: 'marathon',
    reps: 3,
    repM: 5000,
    recoveryS: 240,
    phases: ['peak'],
    races: [42.195],
  },
  {
    id: 'peak-m-tempo',
    type: 'threshold',
    title: 'Marathon: threshold support',
    purpose: 'Raises the ceiling that marathon pace sits under.',
    zone: 'threshold',
    reps: 4,
    repM: 3000,
    recoveryS: 120,
    phases: ['peak'],
    races: [42.195],
  },
  // ---- Taper: keep the feel, cut the volume ----
  {
    id: 'taper-sharpen',
    type: 'threshold',
    title: 'Taper sharpener',
    purpose: 'Remind the legs what fast feels like. Never fatiguing.',
    zone: 'threshold',
    reps: 4,
    repS: 120,
    recoveryS: 120,
    phases: ['taper'],
  },
  {
    id: 'taper-racepace',
    type: 'threshold',
    title: 'Race-pace touches',
    purpose: 'Short blocks at goal effort, full recovery.',
    zone: 'threshold',
    reps: 3,
    repM: 1000,
    recoveryS: 150,
    phases: ['taper'],
    races: [10, 21.0975, 42.195],
  },
  {
    id: 'taper-5k-400',
    type: 'interval',
    title: 'Taper: speed touches',
    purpose: 'Neuromuscular pop without accumulating fatigue.',
    zone: 'interval',
    reps: 5,
    repM: 400,
    recoveryS: 120,
    phases: ['taper'],
    races: [5, 10],
  },
];

export function pickQualityTemplate(
  phase: Phase,
  distance: RaceDistance,
  weekIndex: number,
): QualityTemplate {
  const candidates = QUALITY_TEMPLATES.filter(
    (template) =>
      template.phases.includes(phase) &&
      (template.races == null || template.races.includes(distance)),
  ).sort((a, b) => a.id.localeCompare(b.id));

  if (candidates.length === 0) {
    throw new Error(`No quality template for phase=${phase} distance=${distance}`);
  }
  return candidates[weekIndex % candidates.length] as QualityTemplate;
}

export interface QualitySession {
  workout: Workout;
  totalKm: number;
}

/**
 * Fit a quality template into a total distance budget (warmup, work, recovery,
 * cooldown). Returns null when the budget cannot support a real session.
 */
export function buildQualitySession(
  template: QualityTemplate,
  budgetKm: number,
  paces: PaceZones,
  maxWorkKm = Number.POSITIVE_INFINITY,
): QualitySession | null {
  const easyMid = bandMidpoint(paces.easy);
  const easySlow = paces.easy.maxSPerKm;
  const zoneMid = bandMidpoint(zoneBand(paces, template.zone));

  const warmupS = 600;
  const cooldownS = 480;
  const stridesKm = template.zone === 'interval' || template.zone === 'repetition' ? 0.5 : 0;
  const overheadKm = (warmupS + cooldownS) / easyMid + stridesKm;

  let reps = template.reps;
  const recoveryKm = (count: number) =>
    template.recoveryS > 0 ? ((count - 1) * template.recoveryS) / easySlow : 0;

  const availableFor = (count: number) =>
    Math.min(budgetKm - overheadKm - recoveryKm(count), maxWorkKm);

  let availableKm = availableFor(reps);

  if (availableKm < 1) {
    // Try fewer reps before giving up.
    while (reps > 2 && availableKm < 1) {
      reps -= 1;
      availableKm = availableFor(reps);
    }
    if (availableKm < 1) return null;
  }

  let repM = template.repM;
  let repS = template.repS;

  const workKm = () => {
    if (repM != null) return (reps * repM) / 1000;
    if (repS != null) return (reps * repS) / zoneMid;
    return 0;
  };

  // Shrink reps (to a floor of 2), then shrink the rep itself.
  while (workKm() > availableKm && reps > 2) {
    reps -= 1;
    availableKm = availableFor(reps);
  }

  if (workKm() > availableKm) {
    if (repM != null) {
      repM = Math.max(200, Math.floor((availableKm * 1000) / reps / 100) * 100);
    } else if (repS != null) {
      repS = Math.max(60, Math.floor(availableKm * zoneMid) / reps);
      repS = Math.round(repS / 15) * 15;
    }
  }

  if (workKm() < 1) return null;

  // Add reps when there is comfortable room, never more than +2.
  const cap = template.reps + (template.maxExtraReps ?? 0);
  while (reps < cap) {
    const nextWork = repM != null ? ((reps + 1) * repM) / 1000 : ((reps + 1) * (repS ?? 0)) / zoneMid;
    if (nextWork > availableKm) break;
    reps += 1;
  }

  const steps: WorkoutStep[] = [
    {
      kind: 'warmup',
      label: 'Warm up',
      durationS: warmupS,
      zone: 'easy',
      ...paceBandFor('easy', paces),
    },
  ];

  if (stridesKm > 0) {
    steps.push(
      {
        kind: 'warmup',
        label: 'Strides',
        reps: 4,
        durationS: 20,
        zone: 'repetition',
        ...paceBandFor('repetition', paces),
      },
      {
        kind: 'warmup',
        label: 'Jog between strides',
        reps: 4,
        durationS: 40,
        zone: 'easy',
        ...paceBandFor('easy', paces),
      },
    );
  }

  const workLabels: Partial<Record<WorkoutType, string>> = {
    fartlek: 'Fartlek surges',
    hills: 'Hill reps',
    threshold: 'Threshold work',
    interval: 'Interval work',
    repetition: 'Speed work',
  };
  const workLabel = workLabels[template.type] ?? 'Work';

  steps.push({
    kind: 'work',
    label: workLabel,
    reps,
    ...(repM != null ? { distanceM: repM } : { durationS: repS }),
    zone: template.zone,
    ...paceBandFor(template.zone, paces),
  });

  if (template.recoveryS > 0 && reps > 1) {
    steps.push({
      kind: 'recovery',
      label: 'Recovery jog',
      reps: reps - 1,
      durationS: template.recoveryS,
      zone: 'easy',
      ...paceBandFor('easy', paces),
    });
  }

  steps.push({
    kind: 'cooldown',
    label: 'Cool down',
    durationS: cooldownS,
    zone: 'easy',
    ...paceBandFor('easy', paces),
  });

  const workout = finalize(
    {
      date: '',
      type: template.type,
      title: template.title,
      purpose: template.purpose,
      steps,
      hard: true,
    },
    paces,
  );

  return { workout, totalKm: workout.targetDistanceM / 1000 };
}
