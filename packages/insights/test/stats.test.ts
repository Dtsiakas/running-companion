import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, percentile, twoSidedP } from '../src/stats.ts';

test('two-sided t p-values match statistical tables', () => {
  // Critical values: t = 2.228 at df 10 and t = 1.960 at large df give p = 0.05; t = 2.576 at large df gives 0.01.
  assert.ok(Math.abs(twoSidedP(2.228, 10) - 0.05) < 0.001);
  assert.ok(Math.abs(twoSidedP(1.96, 100_000) - 0.05) < 0.001);
  assert.ok(Math.abs(twoSidedP(2.576, 100_000) - 0.01) < 0.001);
  assert.equal(twoSidedP(0, 20), 1);
});

test('compare finds a real difference and not a fake one', () => {
  const base = Array.from({ length: 40 }, (_, i) => 50 + ((i * 7) % 11) - 5);
  const shifted = base.map((v) => v + 6);
  const real = compare(shifted, base)!;
  assert.ok(Math.abs(real.difference - 6) < 1e-9);
  assert.ok(real.p < 0.001 && real.d > 1);
  const same = compare(base.slice(0, 20), base.slice(20))!;
  assert.ok(same.p > 0.2, `same distribution, p=${same.p}`);
  assert.equal(compare([1], [2, 3]), null, 'one value is not a group');
});

test('percentile interpolates', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4], 0.25), 1.75);
});
