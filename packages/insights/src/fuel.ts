/**
 * Sports-nutrition guidance from the published position stands, scaled to body weight. Pure functions with no
 * dependencies: the web app runs the fuel planner on the phone, Claude's tool runs the same code on the server.
 *
 * Sources: American College of Sports Medicine, Academy of Nutrition and Dietetics and Dietitians of Canada,
 * "Nutrition and Athletic Performance" (joint position statement, 2016); International Society of Sports Nutrition
 * position stands on protein (2017) and nutrient timing (2017). These are ranges for healthy adults in training,
 * not a diet: a sports dietitian can personalise them.
 */

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
export function fuelPlan({ weightKg, minutes, sweatMlPerHour, hard = false }: { weightKg: number; minutes: number; sweatMlPerHour: number | null; hard?: boolean }): FuelPlan {
  const g = (perKg: number) => Math.round((perKg * weightKg) / 5) * 5;
  const hours = minutes / 60;
  const before: string[] = [];
  const during: string[] = [];
  const after: string[] = [];

  if (minutes >= 90) {
    before.push(`A carbohydrate-rich meal 2–4 hours before: about ${g(1)}–${g(2)} g of carbohydrate (bread, rice, pasta, oats, fruit), low in fat and fibre so it settles.`);
    before.push('If you run early, a smaller snack 30–60 minutes before works too: a banana, toast with honey, or a sports drink.');
  } else if (minutes >= 60 || hard) {
    before.push(`A normal meal 2–3 hours before, or a light carbohydrate snack 30–60 minutes before (about ${g(0.5)} g: a banana or toast).`);
  } else {
    before.push('Nothing special needed for a run this short. Running on an empty stomach is fine for easy runs if you feel good.');
  }

  if (minutes < 60) {
    during.push('No food needed. Drink if you’re thirsty, especially when it’s warm.');
  } else if (minutes < 90) {
    during.push(hard ? 'Optional: 15–30 g of carbohydrate (a gel or a few sips of sports drink) can help the last part of a hard session.' : 'Food is optional at this length. Water to thirst.');
  } else if (minutes <= 150) {
    during.push(`30–60 g of carbohydrate per hour, starting after 30–45 minutes: about ${Math.round(30 * hours)}–${Math.round(60 * hours)} g over the run (one gel is about 20–25 g).`);
    during.push('Practise this on long runs: the gut adapts to taking carbohydrate on the move.');
  } else {
    during.push(`60–90 g of carbohydrate per hour (above 60 g/h, gels or drinks that mix glucose and fructose are easier on the stomach): about ${Math.round(60 * hours)}–${Math.round(90 * hours)} g over the run.`);
  }

  const expectedLoss = sweatMlPerHour ? Math.round((sweatMlPerHour * hours) / 50) * 50 : null;
  let fluid: Range | null = null;
  if (minutes >= 75 && sweatMlPerHour) {
    // Replace part of what you lose: the aim is to stay within about 2% of body weight, not to replace it all.
    fluid = [Math.round((sweatMlPerHour * 0.4) / 50) * 50, Math.round((sweatMlPerHour * 0.7) / 50) * 50];
    during.push(`Drink about ${fluid[0]}–${fluid[1]} ml per hour: roughly half of what you sweat, which keeps the loss under 2% of body weight.`);
    if (minutes >= 120) during.push('On long or hot runs, add salt: a sports drink or electrolyte tablets rather than water alone.');
  }

  if (minutes >= 75 || hard) {
    after.push(`Within about 2 hours: a meal or snack with carbohydrate (about ${g(1)} g) and ${g(0.3)} g of protein, for example yoghurt with fruit and honey, or a sandwich and milk.`);
  } else {
    after.push('Your next regular meal covers it. Include some protein.');
  }
  // What's still missing after drinking on the way (the middle of the advised range), not the whole loss.
  const stillMissing = expectedLoss === null ? null : Math.max(0, expectedLoss - (fluid ? ((fluid[0] + fluid[1]) / 2) * hours : 0));
  if (expectedLoss && stillMissing !== null && stillMissing >= 400) {
    after.push(
      `You’ll lose about ${expectedLoss} ml of fluid${fluid ? `, about ${Math.round(stillMissing / 50) * 50} ml more than you drink on the way` : ''}. Drink about ${Math.round((stillMissing * 1.25) / 50) * 50}–${Math.round((stillMissing * 1.5) / 50) * 50} ml over the next hours: a bit more than the shortfall, because you keep losing some.`,
    );
  }

  return { minutes, before, during, after, fluid_ml_per_hour: fluid, expected_loss_ml: expectedLoss };
}
