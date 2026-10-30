/**
 * The *intended* type of a run. Garmin's planned workout name is the best signal of intent; Garmin's
 * training-effect label describes what the run actually did to you and is the fallback.
 * What actually happened (intensity split) is measured separately in activity.ts, so the two can be compared:
 * a "Base" run that spent half its time above LT1 is exactly the kind of thing worth noticing.
 */
export type Category = 'easy' | 'long' | 'recovery' | 'tempo' | 'threshold' | 'intervals' | 'sprint' | 'test' | 'other';
export type CategorySource = 'workout' | 'training_effect' | 'duration' | 'sport';

export interface ClassifyInput {
  typeKey: string;
  workoutName: string | null;
  teLabel: string | null;
  durationS: number | null;
}

/** A run of this length or longer counts as a long run, whatever it was planned as. */
const LONG_RUN_S = 75 * 60;

const WORKOUT_CATEGORIES: Array<[RegExp, Category]> = [
  [/long/i, 'long'],
  [/recovery/i, 'recovery'],
  // Word boundaries: "Anaerobic" contains "aerobic".
  [/\b(base|easy|aerobic)\b/i, 'easy'],
  [/threshold|goal pace/i, 'threshold'],
  [/tempo/i, 'tempo'],
  [/vo2|anaerobic|interval/i, 'intervals'],
  [/sprint|stride|speed/i, 'sprint'],
  [/benchmark|test|race/i, 'test'],
];

const TRAINING_EFFECT_CATEGORIES: Record<string, Category> = {
  RECOVERY: 'recovery',
  AEROBIC_BASE: 'easy',
  TEMPO: 'tempo',
  LACTATE_THRESHOLD: 'threshold',
  VO2MAX: 'intervals',
  ANAEROBIC_CAPACITY: 'intervals',
  SPEED: 'sprint',
};

export function classifyRun(input: ClassifyInput): { category: Category; source: CategorySource } {
  if (!input.typeKey.includes('running')) return { category: 'other', source: 'sport' };

  const isLong = (input.durationS ?? 0) >= LONG_RUN_S;
  const easyOrLong = (category: Category): Category => (category === 'easy' && isLong ? 'long' : category);

  if (input.workoutName) {
    const match = WORKOUT_CATEGORIES.find(([pattern]) => pattern.test(input.workoutName!));
    if (match) return { category: easyOrLong(match[1]), source: 'workout' };
  }

  const fromEffect = input.teLabel ? TRAINING_EFFECT_CATEGORIES[input.teLabel] : undefined;
  if (fromEffect) return { category: easyOrLong(fromEffect), source: 'training_effect' };

  return { category: isLong ? 'long' : 'easy', source: 'duration' };
}

/** Run types whose effort is meant to be steady and easy: the ones where efficiency trends are meaningful. */
export const STEADY_CATEGORIES: ReadonlySet<Category> = new Set(['easy', 'long', 'recovery']);
