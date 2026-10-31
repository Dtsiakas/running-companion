import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, daysBetween, isCalendarDate, mondayOf, today, weekday } from '../src/index.ts';

test('calendar arithmetic ignores daylight saving and crosses months and years', () => {
  assert.equal(addDays('2026-03-28', 1), '2026-03-29'); // the night clocks go forward in Europe
  assert.equal(addDays('2026-10-25', 1), '2026-10-26'); // and back
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(daysBetween('2026-10-31', '2026-10-01'), -30);
});

test('weeks run Monday to Sunday', () => {
  assert.equal(weekday('2026-10-26'), 0);
  assert.equal(weekday('2026-11-01'), 6);
  assert.equal(mondayOf('2026-11-01'), '2026-10-26');
  assert.equal(mondayOf('2026-10-26'), '2026-10-26');
});

test('dates are checked, and today follows the time zone', () => {
  assert.equal(isCalendarDate('2026-02-28'), true);
  assert.equal(isCalendarDate('2026-02-30'), false);
  assert.equal(isCalendarDate('26-02-01'), false);
  const lateEvening = new Date('2026-10-31T23:30:00Z');
  assert.equal(today('UTC', lateEvening), '2026-10-31');
  assert.equal(today('Europe/Athens', lateEvening), '2026-11-01');
});
