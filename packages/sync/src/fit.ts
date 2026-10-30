import { Decoder, Stream } from '@garmin/fitsdk';
import type { Row } from '@companion/db';
import { unzipSync } from 'fflate';
import { int, num, semicirclesToDegrees, str, type Json } from './convert.ts';

/** Garmin delivers activity files as a ZIP holding the .fit file. Plain .fit bytes are accepted too. */
export function extractFitFile(bytes: Uint8Array): Uint8Array {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!isZip) return bytes;

  const entries = Object.entries(unzipSync(bytes)).filter(([name]) => name.toLowerCase().endsWith('.fit'));
  if (entries.length === 0) throw new Error('ZIP contains no .fit file');
  // Multi-file archives are rare; the activity itself is the largest file.
  entries.sort(([, a], [, b]) => b.length - a.length);
  return entries[0]![1];
}

type FitMessages = Record<string, Json[]>;

export function decodeFit(fitBytes: Uint8Array): { messages: FitMessages; errors: string[] } {
  const decoder = new Decoder(Stream.fromByteArray(fitBytes));
  if (!decoder.isFIT()) throw new Error('Not a FIT file');
  const { messages, errors } = decoder.read();
  return { messages: messages as unknown as FitMessages, errors: errors.map((error) => error.message) };
}

// Sports where FIT cadence counts strides (one foot); steps per minute is double.
const FOOT_SPORTS = new Set(['running', 'walking', 'hiking', 'training']);

export interface ParsedActivityFile {
  sport: string | null;
  records: Row[];
  laps: Row[];
  /** Session fields used as fallbacks when the API detail lacks them. */
  session: { rpe: number | null; feel: number | null };
}

export function parseActivityFit(activityId: number, fitBytes: Uint8Array): ParsedActivityFile {
  const { messages } = decodeFit(fitBytes);
  const session = messages.sessionMesgs?.[0] ?? {};
  const sport = str(session.sport) ?? str(messages.sportMesgs?.[0]?.sport);
  const isFootSport = sport !== null && FOOT_SPORTS.has(sport);

  const toSpm = (cadence: unknown, fraction: unknown) => {
    const whole = num(cadence);
    if (whole === null || !isFootSport) return null;
    return (whole + (num(fraction) ?? 0)) * 2;
  };

  // Keyed by timestamp: a few devices write two records for the same second.
  const records = new Map<number, Row>();
  for (const record of messages.recordMesgs ?? []) {
    const time = record.timestamp instanceof Date ? record.timestamp.getTime() : null;
    if (time === null) continue;
    records.set(time, {
      activity_id: activityId,
      time,
      lat: semicirclesToDegrees(record.positionLat),
      lon: semicirclesToDegrees(record.positionLong),
      distance_m: num(record.distance),
      speed_mps: num(record.enhancedSpeed) ?? num(record.speed),
      altitude_m: num(record.enhancedAltitude) ?? num(record.altitude),
      hr: int(record.heartRate),
      cadence_spm: toSpm(record.cadence, record.fractionalCadence),
      power_w: num(record.power),
      gct_ms: num(record.stanceTime),
      vertical_oscillation_mm: num(record.verticalOscillation),
      vertical_ratio_pct: num(record.verticalRatio),
      step_length_mm: num(record.stepLength),
      temperature_c: num(record.temperature),
    });
  }

  const laps = (messages.lapMesgs ?? []).map((lap, index): Row => ({
    activity_id: activityId,
    lap_index: index,
    start_time: lap.startTime instanceof Date ? lap.startTime.getTime() : null,
    elapsed_s: num(lap.totalElapsedTime),
    timer_s: num(lap.totalTimerTime),
    distance_m: num(lap.totalDistance),
    avg_speed_mps: num(lap.enhancedAvgSpeed) ?? num(lap.avgSpeed),
    max_speed_mps: num(lap.enhancedMaxSpeed) ?? num(lap.maxSpeed),
    avg_hr: int(lap.avgHeartRate),
    max_hr: int(lap.maxHeartRate),
    avg_power_w: num(lap.avgPower),
    max_power_w: num(lap.maxPower),
    norm_power_w: num(lap.normalizedPower),
    avg_cadence_spm: toSpm(lap.avgRunningCadence ?? lap.avgCadence, lap.avgFractionalCadence),
    avg_gct_ms: num(lap.avgStanceTime),
    avg_vertical_oscillation_mm: num(lap.avgVerticalOscillation),
    avg_step_length_mm: num(lap.avgStepLength),
    ascent_m: num(lap.totalAscent),
    descent_m: num(lap.totalDescent),
    intensity: str(lap.intensity),
    lap_trigger: str(lap.lapTrigger),
    workout_step_index: int(lap.wktStepIndex),
  }));

  return {
    sport,
    records: [...records.values()],
    laps,
    session: {
      rpe: num(session.workoutRpe) === null ? null : num(session.workoutRpe)! / 10,
      feel: int(session.workoutFeel),
    },
  };
}

// Discovery report -------------------------------------------------------------------------------------

export interface FitSummary {
  messageCounts: Record<string, number>;
  /** Share of record (per-second) messages that carry each field, 0–100. */
  recordFieldCoverage: Record<string, number>;
  developerFields: string[];
  session: Json | undefined;
  errors: string[];
}

export function summarizeFit(fitBytes: Uint8Array): FitSummary {
  const { messages, errors } = decodeFit(fitBytes);

  const messageCounts = Object.fromEntries(
    Object.entries(messages)
      .map(([name, list]) => [name, list.length] as const)
      .sort(([, a], [, b]) => b - a),
  );

  const records = messages.recordMesgs ?? [];
  const fieldHits = new Map<string, number>();
  for (const record of records) {
    for (const [field, value] of Object.entries(record)) {
      if (value !== undefined && value !== null && field !== 'developerFields') {
        fieldHits.set(field, (fieldHits.get(field) ?? 0) + 1);
      }
    }
  }
  const recordFieldCoverage = Object.fromEntries(
    [...fieldHits.entries()]
      .map(([field, hits]) => [field, Math.round((hits / records.length) * 100)] as const)
      .sort(([, a], [, b]) => b - a),
  );

  const developerFields = (messages.fieldDescriptionMesgs ?? []).map((description) => {
    const name = String(description.fieldName ?? 'unnamed');
    const units = description.units ? ` (${String(description.units)})` : '';
    return `${name}${units}`;
  });

  return { messageCounts, recordFieldCoverage, developerFields, session: messages.sessionMesgs?.[0], errors };
}
