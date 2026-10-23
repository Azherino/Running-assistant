import { z } from 'zod';
import type { AthleteProfile, PlanGoal, RaceDistance } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const raceDistance = z.union([z.literal(5), z.literal(10), z.literal(21.0975), z.literal(42.195)]);

export const athleteProfileSchema = z.object({
  weeklyVolumeKm: z.number().min(0).max(400),
  longestRecentKm: z.number().min(0).max(100),
  daysPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  preferredLongDay: z.union([z.literal(6), z.literal(7)]).optional(),
  age: z.number().min(10).max(100).optional(),
  maxHr: z.number().min(100).max(230).optional(),
  restingHr: z.number().min(30).max(110).optional(),
  experienced: z.boolean().optional(),
  injuryFlags: z.array(z.string()).optional(),
});

export const planGoalSchema = z
  .object({
    type: z.union([z.literal('race'), z.literal('fitness')]),
    distanceKm: raceDistance.optional(),
    date: isoDate.optional(),
    targetTimeS: z.number().min(600).max(60 * 3600).optional(),
  })
  .superRefine((goal, ctx) => {
    if (goal.type === 'race') {
      if (goal.distanceKm == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Race goal needs a distance' });
      }
      if (goal.date == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Race goal needs a date' });
      }
    }
  });

export function parseAthleteProfile(input: unknown): AthleteProfile {
  return athleteProfileSchema.parse(input) as AthleteProfile;
}

export function parsePlanGoal(input: unknown): PlanGoal {
  return planGoalSchema.parse(input) as PlanGoal;
}

export function isRaceDistance(value: number): value is RaceDistance {
  return value === 5 || value === 10 || value === 21.0975 || value === 42.195;
}
