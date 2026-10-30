/**
 * Plain-language interpretation of the numbers, by explicit rules. Same thresholds as the metrics engine,
 * so a sentence here never disagrees with the status it explains. Garmin stays the primary coach:
 * these lines describe your state; they don't replace Garmin's daily suggestion.
 */

export type Status = 'green' | 'amber' | 'red';

export const STATUS_TEXT: Record<Status, { title: string; detail: string; label: string }> = {
  green: { label: 'Recovered', title: 'Recovered. Go with today’s plan.', detail: 'HRV, resting heart rate, sleep and training load are all within your normal range.' },
  amber: { label: 'One signal off', title: 'One signal is off. Follow the plan, don’t add extra.', detail: 'One recovery system is outside your normal range.' },
  red: { label: 'Two signals off', title: 'Two signals are off. Consider an easier day than planned.', detail: 'Two independent recovery systems are outside your normal range at the same time.' },
};

export function percentDifference(value: number | null | undefined, reference: number | null | undefined): number | null {
  if (value === null || value === undefined || !reference) return null;
  return Math.round(((value - reference) / reference) * 100);
}

/** Differences smaller than this are measurement noise, not a signal worth a sentence. */
const NOISE: Record<string, number> = { bpm: 1, h: 0.25 };

/** A number with a real minus sign (U+2212), which lines up with "+" and reads better than a hyphen. */
export function signed(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** "9% above your normal", "3 bpm below your normal", "40 min below your normal" */
export function relativeToNormal(value: number | null | undefined, normal: number | null | undefined, unit = '', noise?: number): string {
  if (value === null || value === undefined || normal === null || normal === undefined) return 'Not enough data for a normal yet';
  const diff = value - normal;
  if (unit) {
    if (Math.abs(diff) < (noise ?? NOISE[unit] ?? 0.5)) return 'Right at your normal';
    const direction = diff > 0 ? 'above' : 'below';
    if (unit === 'h') return `${Math.round(Math.abs(diff) * 60)} min ${direction} your normal`;
    const amount = unit === 'points' ? Math.round(Math.abs(diff)) : Math.round(Math.abs(diff) * 10) / 10;
    // "1 point", "2 points": scores and percentages read better as points than as a bare unit.
    const label = unit === 'points' && amount === 1 ? 'point' : unit;
    return `${amount} ${label} ${direction} your normal`;
  }
  const pct = percentDifference(value, normal)!;
  if (Math.abs(pct) < 3) return 'Right at your normal';
  return `${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} your normal`;
}

/** Form (TSB): fitness minus fatigue. Bands as in the data guide. */
export function describeForm(form: number | null | undefined): string {
  if (form === null || form === undefined) return '';
  if (form > 5) return 'Fresh: fatigue is below your fitness, a good state before a race or hard test.';
  if (form >= -10) return 'Balanced: training and recovery are in step.';
  if (form >= -30) return 'Productive training: you are carrying fatigue, which is how fitness is built.';
  return 'Deep fatigue: fatigue is far above fitness. Recovery deserves priority.';
}

/** Acute:chronic workload ratio. */
export function describeAcwr(acwr: number | null | undefined): string {
  if (acwr === null || acwr === undefined) return '';
  if (acwr < 0.8) return 'Lighter than your recent average.';
  if (acwr <= 1.3) return 'Steady: in line with your recent weeks.';
  if (acwr <= 1.5) return 'Building: above your recent weeks. Fine for a while, watch recovery.';
  return 'A spike: well above your recent weeks, the range most linked to overuse injuries.';
}

/** What each metric is, for the "What is this?" notes. Mirrors the data guide the assistant reads. */
export const NOTES = {
  hrv: 'Heart rate variability: the variation between heartbeats, measured overnight. Higher than your normal usually means your nervous system has recovered; lower suggests stress, illness, poor sleep or accumulated fatigue. Only your own baseline matters, not other people’s numbers. The band is your typical range over the last 60 days.',
  restingHr: 'Your lowest steady heart rate of the day. A rise of a few beats above your normal over several days often comes before illness or signals incomplete recovery. The band is your typical range over the last 60 days.',
  sleep: 'Last night’s sleep compared with your own typical range over the last 28 nights. The marker line shows the sleep Garmin estimates you need, adjusted for your training and recent nights.',
  form: 'Fitness is your training load over about six weeks; fatigue is the last week. Form is the difference: negative while you are building, positive when you are fresh. It uses TRIMP, a training load calculated from your heart rate every second of every run.',
  acwr: 'This week’s training load compared with your average week over the last four. Steady progression stays between 0.8 and 1.3.',
  weight: 'Smoothed weight trend: each weigh-in moves the line 10% of the way, so day-to-day water swings don’t hide the real direction.',
  efficiency: 'Metres covered per heartbeat after the first 10 minutes. Higher means more speed for the same effort. It only compares fairly between similar runs: easy, outdoor, similar terrain and weather.',
  paceAtRefHr: 'Your typical pace while your heart rate sat near a fixed reference (85% of your lactate threshold heart rate). Getting faster at the same heart rate is the clearest sign of aerobic progress.',
  decoupling: 'How much efficiency dropped from the first half of the run to the second. Under 5% on a steady run means good aerobic endurance; heat, hills and dehydration push it up.',
  plannedVsActual: 'Each step of the workout Garmin loaded on your watch, with the pace you actually ran. The watch laps every kilometre, so laps that belong to one step are merged back together. On target means your average pace for the step fell inside its target range.',
  runningForm: 'Cadence is steps per minute, ground contact time is how long each foot stays on the ground, and vertical ratio is bounce relative to stride length (lower is more economical). Watch these over months rather than in one run.',
  trainingEffect: 'Garmin’s estimate of how much this run improved your aerobic (steady) and anaerobic (fast, short) fitness, from 0 to 5. Around 3 maintains, 4 improves, 5 overreaches.',
  sleepScore: 'Garmin’s 0–100 rating of the night, from duration, stages, stress during sleep and how often you woke. The stages are estimated from heart rate, HRV and movement: useful for trends over weeks, less exact for a single night. Deep sleep is when the body repairs most; REM supports memory and mood.',
  breathing: 'Breaths per minute while you slept. It is very stable for each person, so a rise of 1–2 breaths above your normal, together with a higher resting heart rate and lower HRV, is one of the earliest signs that your body is fighting something.',
  spo2: 'Blood oxygen saturation measured by the watch overnight. Most healthy people sit around 95–98%. Wrist readings are noisy and dip when you lie on your arm, so only a sustained drop below your own normal is worth attention, and the watch is not a medical device.',
  bodyBattery: 'Garmin’s 0–100 estimate of your energy reserve, from HRV, stress, sleep and activity. Sleep recharges it and the day drains it, so the morning peak shows how well the night restored you.',
  stress: 'Garmin’s all-day stress score (0–100) from heart rate variability. It rises with mental stress, but also with caffeine, alcohol, illness, heat and hard training the day before. The number shown is yesterday’s average, the last complete day.',
  intensityMinutes: 'Minutes at moderate or vigorous effort this week, with vigorous minutes counting double. The WHO recommends at least 150 a week for health; as a runner you’ll usually pass it, so it matters most in easy or rest weeks.',
  fitnessAge: 'Garmin compares your VO2max, resting heart rate, activity and body fat with population norms to express them as an age. The lever is the component Garmin says would move it most.',
  intensity: 'Time below your first lactate threshold (easy), between your two thresholds (moderate), and above your lactate threshold (hard). Most endurance progress comes from a large easy share.',
} as const;
