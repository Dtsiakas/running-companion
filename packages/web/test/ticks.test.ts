import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roundTicks } from '../src/lib/ticks.ts';

test('chart ticks land on round values inside the range', () => {
  assert.deepEqual(roundTicks([186, 426], true), [240, 360]); // 3:06–7:06 → 4:00, 6:00
  assert.deepEqual(roundTicks([290, 370], true), [300, 330, 360]); // 5:00, 5:30, 6:00
  assert.deepEqual(roundTicks([128, 194]), [140, 160, 180]);
  assert.deepEqual(roundTicks([27, 64]), [40, 60]);
  assert.deepEqual(roundTicks([3, 997]), [200, 400, 600, 800]);
  assert.deepEqual(roundTicks([0, 1]), [0, 0.5, 1]);
  assert.equal(roundTicks(['auto', 'auto']), undefined);
  for (const ticks of [roundTicks([3, 997]), roundTicks([150, 152]), roundTicks([186, 426], true)]) {
    assert.ok(ticks!.length >= 2 && ticks!.length <= 4, String(ticks));
  }
});
