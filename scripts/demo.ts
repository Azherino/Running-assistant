import { weekdayName } from '../src/engine/dates';
import { describeStep } from '../src/engine/format';
import { buildPaceZones, formatPace, RACE_DISTANCE_LABELS } from '../src/engine/paces';
import { generateRacePlan } from '../src/engine/plan/generator';
import { checkPlan } from '../src/engine/plan/guards';
import { vdotFromPerformance } from '../src/engine/vdot';
import type { Workout } from '../src/engine/types';

const START = '2026-01-05';
const RACE_DATE = '2026-05-03';
const PERFORMANCE = { distanceM: 10000, timeS: 45 * 60 };

const vdot = vdotFromPerformance(PERFORMANCE.distanceM, PERFORMANCE.timeS);
const paces = buildPaceZones(vdot);

const plan = generateRacePlan(
  {
    weeklyVolumeKm: 30,
    longestRecentKm: 10,
    daysPerWeek: 4,
    experienced: false,
    preferredLongDay: 7,
  },
  {
    type: 'race',
    distanceKm: 21.0975,
    date: RACE_DATE,
    targetTimeS: 100 * 60,
  },
  vdot,
  START,
);

const rule = '─'.repeat(74);

console.log('');
console.log('RUNNING ASSISTANT — plan preview');
console.log(rule);
console.log(
  `Runner        : ${PERFORMANCE.distanceM / 1000} km in ${PERFORMANCE.timeS / 60} min ` +
    `→ VDOT ${vdot.toFixed(1)}`,
);
console.log(
  `Goal          : ${RACE_DISTANCE_LABELS[21.0975]} in 1:40:00 on ${RACE_DATE}`,
);
console.log(`Block         : ${plan.weeks.length} weeks from ${plan.startDate} to ${plan.endDate}`);
console.log(`Peak volume   : ${Math.max(...plan.weeks.map((week) => week.targetVolumeKm))} km/week`);
console.log('');

console.log('TRAINING PACES (per km)');
for (const zone of ['easy', 'marathon', 'threshold', 'interval', 'repetition'] as const) {
  const band = paces[zone];
  const name = zone.padEnd(11);
  const range =
    band.minSPerKm === band.maxSPerKm
      ? formatPace(band.minSPerKm)
      : `${formatPace(band.minSPerKm)}-${formatPace(band.maxSPerKm)}`;
  console.log(`  ${name} ${range}`);
}
console.log('');

if (plan.warnings.length > 0) {
  console.log('COACH NOTES');
  for (const warning of plan.warnings) console.log(`  ! ${warning}`);
  console.log('');
}

const violations = checkPlan(plan);
console.log(
  `SAFETY CHECKS  ${violations.length === 0 ? 'all passed' : `${violations.length} failed`}`,
);
console.log('');

console.log('BLOCK OVERVIEW');
for (const week of plan.weeks) {
  const tag = week.isDownWeek ? ' (down)' : '';
  console.log(
    `  W${String(week.index + 1).padStart(2)}  ${week.startDate}  ` +
      `${week.phase.padEnd(5)}  ${String(week.targetVolumeKm).padStart(5)} km${tag}`,
  );
}
console.log('');

function printWeek(index: number): void {
  const week = plan.weeks[index];
  if (!week) return;
  console.log(`WEEK ${week.index + 1} — ${week.phase}${week.isDownWeek ? ' (down week)' : ''}`);
  console.log(
    `Starts ${week.startDate} · ${week.targetVolumeKm} km · ` +
      `${Math.round(week.workouts.reduce((sum, workout) => sum + workout.targetDurationS, 0) / 60)} min`,
  );
  for (const workout of week.workouts) {
    printWorkout(workout);
  }
  console.log('');
}

function printWorkout(workout: Workout): void {
  if (workout.type === 'rest') {
    console.log(`  ${weekdayName(workout.date)}  rest`);
    return;
  }
  const km = (workout.targetDistanceM / 1000).toFixed(1);
  const minutes = Math.round(workout.targetDurationS / 60);
  console.log(`  ${weekdayName(workout.date)}  ${workout.title} — ${km} km / ${minutes} min`);
  console.log(`        ${workout.purpose}`);
  for (const step of workout.steps) {
    console.log(`        · ${step.label}: ${describeStep(step)}`);
  }
}

printWeek(0);
printWeek(plan.weeks.length - 3);
printWeek(plan.weeks.length - 1);

console.log(rule);
console.log('Next block would recalibrate paces automatically from any new race result.');
console.log('');
