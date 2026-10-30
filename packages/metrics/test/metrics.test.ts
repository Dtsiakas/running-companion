import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessStatus,
  bestEfforts,
  classifyRun,
  computeActivityMetrics,
  computeDailyMetrics,
  thresholdsFromProfile,
  toDistancePoints,
  type DailyInputs,
  type DailyMetrics,
  type RecordPoint,
} from '@companion/metrics';

const thresholds = thresholdsFromProfile({ max_hr: 189, resting_hr_used: 38, lactate_threshold_hr: 170 });

test('thresholds derive LT1 and reference HR from LTHR', () => {
  assert.equal(thresholds.lt1Hr, 150);
  assert.equal(thresholds.refHr, 145);
});

test('classification: planned workout first, then training effect, long runs by duration', () => {
  assert.equal(classifyRun({ typeKey: 'running', workoutName: 'Base', teLabel: 'TEMPO', durationS: 2400 }).category, 'easy');
  assert.equal(classifyRun({ typeKey: 'running', workoutName: 'Anaerobic', teLabel: null, durationS: 2400 }).category, 'intervals');
  assert.equal(classifyRun({ typeKey: 'running', workoutName: 'Long Easy Run', teLabel: null, durationS: 2400 }).category, 'long');
  assert.equal(classifyRun({ typeKey: 'running', workoutName: 'Base', teLabel: null, durationS: 90 * 60 }).category, 'long');
  assert.deepEqual(classifyRun({ typeKey: 'running', workoutName: null, teLabel: 'LACTATE_THRESHOLD', durationS: 2400 }), {
    category: 'threshold',
    source: 'training_effect',
  });
  assert.equal(classifyRun({ typeKey: 'hiking', workoutName: null, teLabel: null, durationS: 2400 }).category, 'other');
});

test('best efforts at constant speed are distance ÷ speed', () => {
  const points = Array.from({ length: 1501 }, (_, t) => ({ t, d: t * 4 })); // 4 m/s for 6 km
  const efforts = bestEfforts(points);
  assert.equal(efforts.get(1000), 250);
  assert.equal(efforts.get(5000), 1250);
  assert.equal(efforts.has(10000), false, 'longer than the activity');
});

test('best efforts find the fastest window, not the first one', () => {
  // 2 km at 3 m/s, then 1 km at 5 m/s.
  const points = [];
  let d = 0;
  for (let t = 0; t <= 1000; t++) {
    points.push({ t, d });
    d += t < 667 ? 3 : 5;
  }
  assert.ok(Math.abs(bestEfforts(points, [1000]).get(1000)! - 200) < 1);
});

/** One sample per second for `minutes`, with HR and speed given per second. */
function run(minutes: number, hrAt: (s: number) => number, speedAt: (s: number) => number = () => 3): RecordPoint[] {
  return Array.from({ length: minutes * 60 }, (_, s) => ({ time: s * 1000, hr: hrAt(s), speedMps: speedAt(s), powerW: 300 }));
}

test('TRIMP: an hour at lactate threshold scores far more than an hour easy', () => {
  const hard = computeActivityMetrics(run(60, () => 170), 'threshold', thresholds, 38);
  const easy = computeActivityMetrics(run(60, () => 140), 'easy', thresholds, 38);
  assert.ok(Math.abs(hard.trimp! - 179) < 2, `hard TRIMP ${hard.trimp}`);
  assert.ok(hard.trimp! > 1.7 * easy.trimp!);
});

test('intensity split counts seconds below LT1, between thresholds, above LTHR', () => {
  const metrics = computeActivityMetrics(run(30, (s) => (s < 600 ? 140 : s < 1200 ? 160 : 175)), 'threshold', thresholds, 38);
  assert.equal(metrics.lowS, 600);
  assert.equal(metrics.moderateS, 600);
  assert.equal(metrics.highS, 600);
});

test('efficiency skips the first 10 minutes and walking', () => {
  const metrics = computeActivityMetrics(run(40, () => 150, (s) => (s < 600 ? 1 : 3)), 'easy', thresholds, 38);
  assert.equal(metrics.steadyS, 30 * 60);
  assert.equal(metrics.mPerBeat, (3 * 60) / 150);
});

test('decoupling: HR drifting up at constant pace shows as a positive percentage', () => {
  const steady = computeActivityMetrics(run(60, () => 145), 'easy', thresholds, 38);
  assert.ok(Math.abs(steady.decouplingPct!) < 0.01);

  const drifting = computeActivityMetrics(run(60, (s) => 140 + (s / 3600) * 20), 'long', thresholds, 38);
  assert.ok(drifting.decouplingPct! > 5 && drifting.decouplingPct! < 10, `decoupling ${drifting.decouplingPct}`);

  const intervals = computeActivityMetrics(run(60, () => 145), 'intervals', thresholds, 38);
  assert.equal(intervals.decouplingPct, null, 'not meaningful for interval sessions');
});

test('speed at reference HR uses only seconds within ±3 bpm of it', () => {
  const metrics = computeActivityMetrics(run(30, (s) => (s % 2 ? 145 : 165), (s) => (s % 2 ? 3 : 4)), 'easy', thresholds, 38);
  assert.equal(metrics.speedAtRefHrMps, 3);
});

function inputs(days: number, loadPerDay: number): DailyInputs {
  const load = new Map<string, number>();
  const date = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  for (let i = 0; i < days; i++) load.set(date(i), loadPerDay);
  const empty = () => new Map<string, number>();
  return {
    from: date(0),
    to: date(days - 1),
    load,
    garminLoad: empty(),
    runKm: empty(),
    hrvMs: empty(),
    rhr: empty(),
    sleep: new Map(),
    weightKg: empty(),
    bodyFatPct: empty(),
  };
}

test('fitness and fatigue converge to a constant daily load; fatigue converges faster', () => {
  const rows = computeDailyMetrics(inputs(365, 60));
  const last = rows.at(-1)!;
  assert.ok(Math.abs(last.fitness - 60) < 0.1);
  assert.ok(Math.abs(last.fatigue - 60) < 0.1);
  assert.ok(Math.abs(last.acwr! - 1) < 0.01);
  assert.ok(rows[10]!.fatigue > rows[10]!.fitness);
});

test('status counts systems, not rules: one system amber, two systems red', () => {
  const day = computeDailyMetrics(inputs(1, 0))[0]!;
  const base: DailyMetrics = { ...day, hrvZ: 0, rhrZ: 0, rhr3d: 40, rhrBaseline: 40, sleepH: 7, sleepBaselineH: 7, form: 0, acwr: 1, fitness: 40 };

  assert.equal(assessStatus(base).status, 'green');
  assert.equal(assessStatus({ ...base, sleepH: 5.5 }).status, 'amber');
  assert.equal(assessStatus({ ...base, form: -35, acwr: 1.8 }).status, 'amber', 'two load rules are one system');
  assert.equal(assessStatus({ ...base, sleepH: 5.5, hrvZ: -1.5, hrv7dMs: 70, hrvBaselineMs: 85 }).status, 'red');
  assert.equal(assessStatus({ ...base, hrvZ: null, rhrZ: null, sleepH: null }).status, null, 'no recovery data, no status');
});

test('best efforts use timer time: a pause does not count, running through a GPS gap does', () => {
  // 4 m/s for 5 km (1250 s), a 3-minute pause (no samples, same place), then 4 m/s for another 5 km.
  const rows: Array<{ time: number; distance_m: number }> = [];
  for (let t = 0; t <= 1250; t++) rows.push({ time: t * 1000, distance_m: t * 4 });
  for (let t = 0; t <= 1250; t++) rows.push({ time: (1250 + 180 + t) * 1000, distance_m: 5000 + t * 4 });
  const tenK = bestEfforts(toDistancePoints(rows)).get(10000)!;
  assert.ok(Math.abs(tenK - 2501) < 2, `10 km in about 2,500 s of running, not 2,680 with the pause (got ${tenK})`);

  // The same run without a pause but with a 30-second GPS gap in the middle: the gap was run, so it counts.
  const gappy = rows.filter((r) => r.time < 1235_000 || r.time > 1430_000 + 15_000).map((r) => (r.time >= 1430_000 ? { ...r, time: r.time - 180_000 } : r));
  const withGap = bestEfforts(toDistancePoints(gappy)).get(10000)!;
  assert.ok(Math.abs(withGap - 2500) < 2, `a gap you ran through still counts its time (got ${withGap})`);
});
