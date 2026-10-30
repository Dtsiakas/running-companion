import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Encoder, Profile, type Encodable, type FileIdMesg, type LapMesg, type Mesg, type RecordMesg, type SessionMesg } from '@garmin/fitsdk';
import { zipSync } from 'fflate';
import { extractFitFile, parseActivityFit } from '@companion/sync';

/** Builds a small synthetic running FIT file with Garmin's own encoder. */
function syntheticRun(): Uint8Array {
  const encoder = new Encoder();
  const write = <T extends Mesg>(mesg: Encodable<T>) => encoder.writeMesg(mesg);
  const start = new Date('2026-10-27T16:00:00Z');
  write<FileIdMesg>({ mesgNum: Profile.MesgNum.FILE_ID!, type: 'activity', manufacturer: 'garmin', product: 4315, timeCreated: start, serialNumber: 1 });
  for (let i = 0; i < 60; i++) {
    write<RecordMesg>({
      mesgNum: Profile.MesgNum.RECORD!,
      timestamp: new Date(start.getTime() + i * 1000),
      positionLat: 536870912, // 45° (semicircles: degrees × 2³¹ / 180)
      positionLong: 119304647, // 10°
      heartRate: 150,
      enhancedSpeed: 3.3,
      cadence: 89,
      fractionalCadence: 0.5,
      power: 340,
      stanceTime: 243,
      verticalOscillation: 84.9,
      stepLength: 1115,
    });
  }
  write<LapMesg>({ mesgNum: Profile.MesgNum.LAP!, timestamp: new Date(start.getTime() + 60_000), startTime: start, totalDistance: 198, avgRunningCadence: 89, intensity: 'warmup', wktStepIndex: 0 });
  write<SessionMesg>({ mesgNum: Profile.MesgNum.SESSION!, timestamp: new Date(start.getTime() + 60_000), startTime: start, sport: 'running', workoutRpe: 40, workoutFeel: 75 });
  return encoder.close();
}

test('FIT inside a ZIP is extracted', () => {
  const fit = syntheticRun();
  assert.deepEqual(extractFitFile(zipSync({ '1_ACTIVITY.fit': fit })), fit);
  assert.deepEqual(extractFitFile(fit), fit, 'plain FIT passes through');
});

test('records: semicircles → degrees, stride cadence → steps per minute', () => {
  const parsed = parseActivityFit(1, syntheticRun());
  assert.equal(parsed.sport, 'running');
  assert.equal(parsed.records.length, 60);

  const record = parsed.records[0]!;
  assert.ok(Math.abs((record.lat as number) - 45) < 1e-6);
  assert.ok(Math.abs((record.lon as number) - 10) < 1e-6);
  assert.equal(record.cadence_spm, 179);
  assert.equal(record.gct_ms, 243);
  assert.equal(parsed.laps[0]!.intensity, 'warmup');
  assert.equal(parsed.session.rpe, 4);
});
