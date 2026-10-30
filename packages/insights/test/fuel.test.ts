import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyRanges, fuelPlan } from '../src/fuel.ts';

test('daily ranges scale with body weight, in 5 g steps', () => {
  const ranges = dailyRanges(70);
  assert.deepEqual(ranges.protein_g, [100, 140]); // 1.4–2.0 g/kg
  assert.deepEqual(ranges.carbs_g.rest, [210, 350]); // 3–5 g/kg
  assert.deepEqual(ranges.carbs_g.hard, [420, 700]); // 6–10 g/kg
});

test('short runs need nothing special; long runs get carbohydrate and fluids per hour', () => {
  const short = fuelPlan({ weightKg: 70, minutes: 40, sweatMlPerHour: 900 });
  assert.equal(short.fluid_ml_per_hour, null);
  assert.match(short.during[0]!, /No food needed/);

  const long = fuelPlan({ weightKg: 70, minutes: 120, sweatMlPerHour: 1000 });
  assert.match(long.during[0]!, /30–60 g of carbohydrate per hour.*60–120 g over the run/);
  assert.deepEqual(long.fluid_ml_per_hour, [400, 700]);
  assert.equal(long.expected_loss_ml, 2000);
  // After the run, only the shortfall still missing is replaced: 2000 − 550 × 2 = 900 ml, times 1.25–1.5.
  assert.match(long.after.at(-1)!, /about 900 ml more than you drink on the way\. Drink about 1150–1350 ml/);

  const veryLong = fuelPlan({ weightKg: 70, minutes: 180, sweatMlPerHour: 1000 });
  assert.match(veryLong.during[0]!, /60–90 g of carbohydrate per hour/);
});
