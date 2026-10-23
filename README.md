# Running Assistant

A progressive running coach that lives on your phone. It turns a recent race result
into training paces, generates a periodized plan for a race or a general fitness
block, and adapts the plan week by week based on what you actually ran.

Offline-first: no account, no server, no AI in the coaching loop. Just deterministic
sports-science rules you can inspect and test.

## Status

- **Engine + app (v1):** 111 tests passing. Pure TypeScript engine, no React Native imports.
- **App:** Expo SDK 58 with onboarding, today, plan, log, progress, TCX/FIT import,
  weekly coach reviews, and pace recalibration. Local SQLite; no account or server.
- **Next:** readiness check-in (sleep, soreness, mood) and polish.

## Quick start

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # jest, 111 tests
npm run demo          # prints a 17-week half-marathon plan
npm start             # Expo dev server (Android/iOS)
```

The app is offline-only. Plans, runs, and settings live in a local SQLite database;
nothing leaves the device.

### Install on Android without the dev server

Expo Go always needs `npm start` running on your computer. For a standalone app,
build an installable APK with EAS Build (free Expo account):

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

The first build asks to create the EAS project and generate a keystore — accept both.
When it finishes, open the build link on your phone, download the APK, and allow
installing from that app. The APK contains the JavaScript bundle and runs fully
offline; no terminal or Metro server is involved.

Notes:

- The first standalone install starts with an empty database. Expo Go's data is separate.
- Rebuild and reinstall the same package/signing key to keep existing data.
- EAS free-tier builds can take 10–30 minutes in the queue.
- `eas.json` already defines the `preview` profile as an APK.

The demo is the fastest way to see what the coach produces:

```
Runner        : 10 km in 45 min → VDOT 45.3
Goal          : Half marathon in 1:40:00 on 2026-05-03
Block         : 17 weeks from 2026-01-05 to 2026-05-03
Peak volume   : 52 km/week

TRAINING PACES (per km)
  easy        5:25-5:57
  marathon    4:43-4:51
  threshold   4:34-4:40
  interval    4:12-4:18
  repetition  3:55-4:01
```

## How the coaching works

### Fitness: VDOT

Fitness is a single number, Jack Daniels' VDOT, computed from a recent race or time
trial:

1. Oxygen cost of running at velocity `v` (m/min):

   `VO2 = -4.6 + 0.182258·v + 0.000104·v²`

2. Fraction of VO2max sustainable for `t` minutes:

   `%VO2max = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)`

3. `VDOT = VO2 / %VO2max`

Inverses are solved by bisection, so goal-time ↔ VDOT ↔ race-pace conversions are
exact rather than table lookups. Reference checks in the tests: 5K 20:00 → 49.8,
5K 25:00 → 38.3, 10K 40:00 → 51.9, marathon 3:00 → 53.5.

### Paces

Pace zones are fractions of VDOT, converted back to velocity and then to min/km:

| Zone | Fraction of VDOT | Use |
| --- | --- | --- |
| Easy | 0.64–0.72 | all easy and long running |
| Marathon | 0.84 | steady blocks, long-run finishes |
| Threshold | 0.88 | tempo, cruise intervals |
| Interval | 0.975 | VO2max reps |
| Repetition | 1.06 | strides and short speed |

Heart rate is only a guardrail (heat, hills, fatigue), not the prescription. Zones
are %HRmax, or Karvonen (%HR reserve) when resting HR is known. Max HR defaults to
Tanaka: `208 − 0.7·age`.

### Plans

Race plans support 5K, 10K, half and marathon; fitness plans are rolling 8–12 week
blocks with no race. Both use the same week builder:

- **Phases:** base → build → peak → taper. Taper length depends on the race
  (1 week for 5K/10K, 2 for half, 3 for marathon).
- **Ramp:** about 8% per week (10% if experienced, capped at 5% with injury
  history), with a down week every fourth base/build week.
- **Volume ceiling:** `min(race cap, daysPerWeek × 13)` km/week. More running days,
  more room.
- **Long run:** 30% of weekly volume (40% for 3-day athletes), never more than 42%
  of the week, grown by at most 2.5 km per week.
- **Quality:** 1 session at 3 days/week, 2 at 4+. Work volume is capped by race
  distance, 15% of weekly volume, and a 22% weekly work budget.
- **Day layout:** quality sessions are separated by easy days or rest; the long run
  is on Sunday (or Saturday) and never directly after a quality day.
- **Race week:** a short easy run, a shakeout with strides, then the race. A 3-day
  athlete gets 3 runs, not 4.

Every generated plan is run through safety guards (`src/engine/plan/guards.ts`) and
any violation is surfaced in `plan.warnings` rather than silently ignored:

- weekly ramp ≤ 10% over the best of the previous three weeks
- long-run share 15–42%
- hard work ≤ 25% of weekly time; marathon-pace work ≤ 32% of volume
- no back-to-back hard days
- taper volume never increases
- seven dated days per week, no duplicate dates, volume matches the declared target

### Adaptation

After a week, the athlete's log becomes a `WeekReview`. The first matching rule
wins, ordered by risk:

| Rule | Trigger | Next week |
| --- | --- | --- |
| `injury` | pain flag or note | 0.6× volume, no quality |
| `acwr-spike` | ACWR > 1.5 | 0.7×, drop 1 quality |
| `missed-sessions` | <60% sessions or 2 missed quality | hold at 1.0× |
| `easy-too-hard` | easy RPE ≥ 8 or 2 easy runs above HR | 0.8×, drop 1 quality |
| `down-week-done` | completed a down week | 1.35× rebuild |
| `ready-to-progress` | ≥90% sessions, controlled easy runs, ACWR < 1.3 | 1.1× |
| `normal-progression` | everything else | 1.08× |

`volumeFactor` multiplies the **reviewed week's planned volume** to set the new
starting level. Applying a review scales the remaining non-race weeks from that
level, so down weeks and the taper keep their shape; the first adapted week also
drops the quality sessions the rule asks for. Weeks before the adjustment, completed
runs, and race day are never rewritten. Acute:chronic workload ratio uses EWMA
(7-day acute / 28-day chronic); 0.8–1.3 is the optimal band.

The Today screen shows the last completed week's review once a new week starts. On
Monday the adjustment can be applied to the current week; later in the week it
applies from the next week, so completed days never move. A week that has already
been adapted is marked *applied* and is not offered again. The review card also has
an opt-in **pain or injury** flag: selecting it switches the rule to `injury`, drops
all quality work, and cuts volume by 40%.

Readiness is a separate, explainable score (sleep, soreness, resting HR, mood,
yesterday's session). It never rewrites the plan by itself; it tells the athlete
whether to trust today's targets. The engine is implemented; the check-in UI is
still on the roadmap.

### Recalibration

A new race or time trial can update VDOT from the Progress screen. `recalibratePlan`
only touches sessions on or after the recalibration date — completed weeks are never
rewritten — and race day keeps its goal time. Changes are recorded in `plan.notes`.
Paces only move for a meaningful change (0.8 VDOT) and are locked in the last 10 days
before a race. Results are sanity-checked against plausible times for the distance.

### Importing runs

Manual logs and file imports feed the same run table. Imports support:

- **TCX** from Garmin Connect, Coros, Polar, Suunto, and most watch exports. Multiple
  laps are summed; missing lap totals fall back to trackpoints.
- **FIT** binary files, decoded without native code. Session totals are preferred,
  with the record stream as a fallback.

Non-running activities are imported as **cross-training**. They are kept in the
history but excluded from running volume, plan compliance, ACWR, and weekly review
metrics.

Dates use the phone's local calendar, matching manual logs. A run already logged on
the same date within 2% (or 200 m) of the same distance is treated as a duplicate
and is not inserted twice. GPX and ZIP containers are rejected with an explanation;
unzip Huawei exports first and pick the `.tcx` or `.fit` inside.

## Architecture

```
src/engine/
  types.ts            domain types (Plan, Workout, WeekReview, Adjustment)
  dates.ts            UTC date helpers, ISO strings throughout
  vdot.ts             Daniels formulas and inverses
  paces.ts            pace zones, formatting, race pace
  hr.ts               HR zones and max-HR estimate
  race-predictor.ts   equivalent performances, goal realism
  validation.ts       zod schemas for profile and goal input
  format.ts           human-readable step/workout text for the UI
  plan/
    generator.ts      phases, volumes, week structure, race/fitness plans
    sessions.ts       workout builders and quality templates
    guards.ts         safety checks
    recalibrate.ts    future-only pace updates
    adapt.ts          weekly adjustment applied to future weeks
  adapt/
    acwr.ts           load ratio
    readiness.ts      daily readiness score
    rules.ts          weekly review rules
    review.ts         turns a planned week + logs into a WeekReview
  __tests__/          jest suites against reference values
src/import/
  tcx.ts              XML activity parser (laps, trackpoint fallback)
  fit.ts              minimal binary FIT decoder
  dedupe.ts           same-day/same-run matching against the log
  index.ts            format dispatcher
  __tests__/          synthetic TCX and FIT fixtures
src/ui/
  db/                 SQLite schema, Drizzle client, run/state repository
  store/              Zustand store (hydrate, log, import, plan blocks)
  components/         theme components, workout card, pace grid, volume chart
  lib/                UI date/format helpers
app/                  Expo Router routes
  onboarding.tsx      profile, recent performance, goal, plan generation
  import.tsx          document picker, parsed activity list, dedupe feedback
  (tabs)/today.tsx    current session, week progress, coach review, paces
  (tabs)/plan.tsx     full block with phases and warnings
  (tabs)/log.tsx      manual quick-log and recent runs
  (tabs)/progress.tsx volume chart, load ratio, race predictions, recalibration
scripts/demo.ts       printable plan preview
```

The engine remains framework-free: plain TypeScript in, plain objects out. The app
calls `generatePlan`, `reviewWeek`, `applyWeekAdjustment`, and `recalibratePlan`,
stores plans and runs in SQLite, and renders the result.

## Design rules

- **Deterministic.** Same inputs, same plan. No randomness, no hidden state.
- **Explainable.** Every adjustment carries a `ruleId` and a human-readable reason.
- **Conservative.** When in doubt, less volume and fewer hard sessions. Guards are
  hard limits, not suggestions.
- **Past is immutable.** Adaptation and recalibration never rewrite completed weeks.
- **No medical advice.** Pain flags stop quality work and point to a professional.

## Roadmap

- **M0 — App shell:** done. Expo Router, dark theme, onboarding, local SQLite.
- **M1 — Engine:** done. VDOT paces, periodized plans, guards, review rules.
- **M2 — Core screens:** done. Today, plan, quick log, progress.
- **M3 — Import:** done. TCX and FIT parsing, local date mapping, dedupe.
- **M4 — Adaptation loop:** done. Weekly review card, future-only volume adjustments,
  pain override, and recalibration from a race or time trial.
- **M5 — Readiness and polish:** daily check-in, reminders, export/backup,
  accessibility pass.

## Disclaimer

This is a training tool, not medical advice. If pain changes how you run, stop and
see a physiotherapist or doctor.
