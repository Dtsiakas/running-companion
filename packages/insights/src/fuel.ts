/**
 * Sports-nutrition guidance from the published position stands, scaled to body weight. Pure functions with no
 * dependencies: the web app runs the fuel planner on the phone, Claude's tool runs the same code on the server.
 *
 * Sources: American College of Sports Medicine, Academy of Nutrition and Dietetics and Dietitians of Canada,
 * "Nutrition and Athletic Performance" (joint position statement, 2016); International Society of Sports Nutrition
 * position stands on protein (2017) and nutrient timing (2017). These are ranges for healthy adults in training,
 * not a diet: a sports dietitian can personalise them.
 */

import { ENGLISH, type I18n } from '@companion/i18n';

export const GUIDANCE_SOURCE =
  'ACSM, Academy of Nutrition and Dietetics and Dietitians of Canada joint position (2016); ISSN position stands on protein and nutrient timing (2017).';

export type Range = [number, number];

export interface DailyRanges {
  /** Grams per day. 1.4–2.0 g/kg keeps muscle while training, more when losing weight. */
  protein_g: Range;
  /** Protein per meal (about 0.3 g/kg), spread over 3–5 meals. */
  protein_per_meal_g: Range;
  /** Grams of carbohydrate per day, by the kind of training day. */
  carbs_g: { rest: Range; moderate: Range; hard: Range };
}

export function dailyRanges(weightKg: number): DailyRanges {
  const g = (low: number, high: number): Range => [Math.round((low * weightKg) / 5) * 5, Math.round((high * weightKg) / 5) * 5];
  return {
    protein_g: g(1.4, 2.0),
    protein_per_meal_g: g(0.25, 0.4),
    carbs_g: {
      // Rest or light skill day: 3–5 g/kg. About an hour of moderate running: 5–7 g/kg. Hard or long days: 6–10 g/kg.
      rest: g(3, 5),
      moderate: g(5, 7),
      hard: g(6, 10),
    },
  };
}

export interface FuelPlan {
  minutes: number;
  before: string[];
  during: string[];
  after: string[];
  /** Fluid to drink per hour during the run, when it's long enough to matter. */
  fluid_ml_per_hour: Range | null;
  /** Estimated fluid lost over the run, from your own sweat rate. */
  expected_loss_ml: number | null;
}

/**
 * What to eat and drink around one run. `sweatMlPerHour` comes from Garmin's own estimates on your past runs
 * (in similar temperatures when known), so the fluid advice is yours, not a population average.
 */
export function fuelPlan(
  { weightKg, minutes, sweatMlPerHour, hard = false }: { weightKg: number; minutes: number; sweatMlPerHour: number | null; hard?: boolean },
  { m, f }: I18n = ENGLISH,
): FuelPlan {
  const t = m.fuel;
  const ml = (value: number) => f.volume(value);
  const g = (perKg: number) => Math.round((perKg * weightKg) / 5) * 5;
  const hours = minutes / 60;
  const before: string[] = [];
  const during: string[] = [];
  const after: string[] = [];

  if (minutes >= 90) {
    before.push(t.long(g(1), g(2)));
    before.push(t.early);
  } else if (minutes >= 60 || hard) {
    before.push(t.normal(g(0.5)));
  } else {
    before.push(t.short);
  }

  if (minutes < 60) {
    during.push(t.noFood);
  } else if (minutes < 90) {
    during.push(hard ? t.optionalHard : t.optional);
  } else if (minutes <= 150) {
    during.push(t.carbs30(Math.round(30 * hours), Math.round(60 * hours)));
    during.push(t.practise);
  } else {
    during.push(t.carbs60(Math.round(60 * hours), Math.round(90 * hours)));
  }

  const expectedLoss = sweatMlPerHour ? Math.round((sweatMlPerHour * hours) / 50) * 50 : null;
  let fluid: Range | null = null;
  if (minutes >= 75 && sweatMlPerHour) {
    // Replace part of what you lose: the aim is to stay within about 2% of body weight, not to replace it all.
    fluid = [Math.round((sweatMlPerHour * 0.4) / 50) * 50, Math.round((sweatMlPerHour * 0.7) / 50) * 50];
    during.push(t.drink(ml(fluid[0]).replace(/ (ml|fl oz)$/, ''), ml(fluid[1])));
    if (minutes >= 120) during.push(t.salt);
  }

  if (minutes >= 75 || hard) {
    after.push(t.recover(g(1), g(0.3)));
  } else {
    after.push(t.nextMeal);
  }
  // What's still missing after drinking on the way (the middle of the advised range), not the whole loss.
  const stillMissing = expectedLoss === null ? null : Math.max(0, expectedLoss - (fluid ? ((fluid[0] + fluid[1]) / 2) * hours : 0));
  if (expectedLoss && stillMissing !== null && stillMissing >= 400) {
    after.push(
      t.lose(
        ml(expectedLoss),
        fluid ? ml(Math.round(stillMissing / 50) * 50) : null,
        ml(Math.round((stillMissing * 1.25) / 50) * 50).replace(/ (ml|fl oz)$/, ''),
        ml(Math.round((stillMissing * 1.5) / 50) * 50),
      ),
    );
  }

  return { minutes, before, during, after, fluid_ml_per_hour: fluid, expected_loss_ml: expectedLoss };
}
