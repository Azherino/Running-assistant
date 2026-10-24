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
Runner        : 10 km in 45 min — VDOT 45.3
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

   `VO2 = -4.6 + 0.182258*v + 0.000104*v²`

2. Fraction of VO2max sustainable for `t` minutes:

   `PercentVO2max = 0.8 + 0.1894393*e^(-0.012778*t) + 0.2989558*e^(-0.1932605*t)`

3. Equivalence velocity gives VDOT from race time (solved iteratively).

### Paces

From VDOT we derive training paces (Easy, Marathon, Threshold, Interval, Repetition)
with standard Daniels tables, then clamp to sane ranges for the athlete level.

### Plan generation

- **Periodization:** Base/Build/Peak/Taper phases sized to the block length.
- **Weekly structure:** alternates quality (threshold/intervals) with easy days, long
  run placed for recovery/availability, rest days where needed.
- **Volume:** starts conservative, ramps gradually, tapers before goal day.
- **Guards:** per-week +10% max ramp (and down-ramp rules), hard caps by experience,
  minimum easy volume, long-run/volume ratio, and quality load limits.

### Adaptation loop

After each week, `reviewWeek` compares planned vs actual (distance/time/completion):
- **Missed volume:** small future-only cuts if consistently behind, with guardrails.
- **Too much intensity/load:** dial back quality if fatigue signals appear.
- **Struggled sessions:** reduce next week's load for affected days.
- **Race/time-trial:** `recalibratePlan` fits a new VDOT from a recent effort and shifts
  future paces/volume while keeping completed weeks unchanged.
- **Pain:** if flagged, quality is suppressed and adjustments are conservative.

Every adjustment includes `ruleId` and a reason — inspectable in code and surfaced
in the app.

## Project structure

```text
app/                  Expo Router routes
  onboarding.tsx      profile, recent performance, goal, plan generation
  import.tsx          document picker, parsed activity list, dedupe feedback
  (tabs)/today.tsx    current session, week progress, coach review, paces
  (tabs)/plan.tsx     full block with phases and warnings
  (tabs)/log.tsx      manual quick-log and recent runs
  (tabs)/progress.tsx volume chart, load ratio, race predictions, recalibration
src/
  engine/             pure TS: vdot, paces, plan, guards, review, calibrate
  data/               schema, migrations, db client (Drizzle + expo-sqlite)
  store/              Zustand store with selectors/actions
  utils/             parsing (TCX/FIT), dates, formatters
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
