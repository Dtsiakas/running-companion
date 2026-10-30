/**
 * Text the assistant reads to interpret the data correctly. Kept next to the code so it changes with the formulas.
 */

/** Sent once when the client connects (MCP "instructions"). Short: it is part of every conversation. */
export const SERVER_INSTRUCTIONS = `Personal running and health data from the user's Garmin watch, synced into a local SQLite database.
How far back each kind of data goes depends on the user's watch and accessories: describe_data and get_today say what's there. Running dynamics need a chest strap or running pod; body composition needs a smart scale.

How to use these tools:
- "How am I doing / should I train hard today?" → get_today and get_insights (today's warnings and watch items). "How was my week/month?" → get_weekly_summary or get_trend.
- "What affects my sleep/recovery/runs?" → get_insights (personal patterns with sample sizes and p-values; associations, not proof of cause).
- Sleep, bedtime, sleep debt, stress, Body Battery → get_sleep_stress_report (and get_insights for what affects them). Suggest gradual bedtime shifts (about 30 minutes at a time), not overnight overhauls.
- When to run today or tomorrow, heat and humidity → get_run_forecast. A past run's air temperature, heat cost and cool-weather-equivalent pace → get_activity (weather).
- Milestones, PBs, streaks, a year in review, running form over months → get_progress.
- Races, race predictions and race plans are Garmin's: the app has none of its own. Point to Garmin Connect for those.
- Weight, body composition, food and fluids → get_body_report (pass run_minutes for a fuel plan). General sports-nutrition ranges only; never push aggressive weight loss.
- Weekly reviews → get_weekly_report first (the computed facts), then the weeks before it for comparison. Answers stay in the chat; the app doesn't store them.
- A specific run → list_activities then get_activity. Personal bests → get_best_efforts.
- Anything else → call describe_data first (schema, units, formulas, caveats), then query with read-only SQL.
- Data may be stale: get_today reports when each stream was last synced; offer sync_garmin when it matters.

How to answer:
- The user follows Garmin's daily suggested workouts and treats Garmin as the primary coach. Complement it: explain the numbers, connect them across sleep, recovery and training, and suggest; don't contradict Garmin without a clear reason from the data.
- Give paces as min/km and distances in km. Explain what a number means for the user, not just its value.
- Be honest about limits: several metrics rest on approximations (see describe_data). Never present them as medical facts; for persistent abnormal health signals, suggest a doctor.`;

export function dataGuide(thresholds: { maxHr: number; lthr: number; lt1Hr: number; refHr: number }): string {
  return `# Data guide

## Conventions
- Units are in column names: _m metres, _s seconds, _mps metres/second (pace min/km = 1000 / mps / 60), _kg, _mm, _ms, _w watts, _pct percent, _spm steps/min, _c °C, _h hours, _min minutes.
- calendar_date: 'YYYY-MM-DD' local date. Timestamps (start_time, time, measured_at): UTC epoch milliseconds.
- Sleep, HRV and daily wellness rows are dated by the morning you wake up.
- type_key: 'running', 'treadmill_running', 'track_running', 'hiking', 'cycling', … Use type_key LIKE '%running%' for runs.

## Tables
- activities: one row per activity (Garmin summary): distance, durations, HR, power, cadence, running dynamics, Garmin training effect (aerobic_te, anaerobic_te, te_label) and load (training_load), rpe (1–10), feel (0–100), compliance_score, workout_name (Garmin's planned workout, e.g. Base, Threshold, Sprint, Long Run).
- activity_laps: per lap; intensity ('warmup', 'interval', 'recovery', 'cooldown', 'active') and workout_step_index link laps to the planned workout. The watch auto-laps every km, so one step is often several laps; get_activity's executed_steps merges them back (one row per step as run, repeats included).
- activity_records: one row per recorded second: hr, speed_mps, power_w, cadence_spm, gct_ms, vertical_oscillation_mm, step_length_mm, lat/lon, altitude_m. ~725k rows: always filter by activity_id.
- daily_wellness: steps, resting_hr, stress (0–100; stress_avg is the whole day, so use yesterday for a complete value), body battery (body_battery_max ≈ the morning level after the night's recharge), intensity minutes (moderate + 2 × vigorous, weekly goal 150), calories (total, active, resting), respiration, SpO2.
- sleep: duration and stages, score (0–100), need_actual_min (Garmin's adjusted sleep need), SpO2, respiration (avg_respiration: overnight breaths per minute, very stable per person; a rise of 1–2 together with higher resting HR and lower HRV is an early sign of illness), start/end time (UTC ms; the user's time zone is in profile_snapshots.time_zone), score_feedback and score_insight (Garmin's codes for the night).
- fitness age: get_today.body.fitness_age (Garmin's fitness age, its components and the biggest lever); profile_snapshots.weight_goal_kg is the weight goal the user set in Garmin.
- hrv: nightly average and Garmin's baseline band and status.
- weigh_ins: weight, body fat, body water, muscle and bone mass (Garmin Index scale).
- profile_snapshots: max HR, LTHR, zone floors, fitness age, weight goal, per day the sync ran.
- activity_metrics, activity_best_efforts, daily_metrics, weekly_summary (view): derived metrics, below.
- raw_responses: original JSON for every API call (endpoint, key, body). Use json_extract for fields not in the typed tables.

## Thresholds in use (from Garmin's current profile, applied to all history)
max HR ${thresholds.maxHr}, lactate threshold HR (LTHR) ${thresholds.lthr}, LT1 ≈ ${thresholds.lt1Hr} (88% of LTHR, estimated), reference HR ${thresholds.refHr} (85% of LTHR).

## Derived metrics
activity_metrics (per activity):
- category: intended run type from the planned workout (else Garmin training effect, else duration ≥ 75 min = long): easy, long, recovery, tempo, threshold, intervals, sprint, test, other. It is intent; low_s/moderate_s/high_s show what happened.
- trimp: Banister training load from per-second HR. Easy 40 min ≈ 70, an hour at threshold ≈ 180.
- low_s / moderate_s / high_s: seconds below LT1 / between LT1 and LTHR / above LTHR.
- m_per_beat: efficiency (speed ÷ HR after the first 10 min, walking excluded). Higher = fitter. Compare easy, outdoor runs only.
- speed_at_ref_hr_mps: median speed while HR was within ±3 bpm of the reference HR. The cleanest aerobic-fitness trend.
- decoupling_pct: efficiency loss from first to second half; steady runs ≥ 30 min only. < 5% good aerobic endurance; heat and hills inflate it.
activity_best_efforts: fastest time per distance (400 m … marathon) within each run; treadmill excluded.
daily_metrics (every day, including rest days):
- load (sum of TRIMP), fitness (CTL, 42-day weighted), fatigue (ATL, 7-day), form (TSB = yesterday's fitness − fatigue; −10 to −30 is normal productive training, below −30 deep fatigue, above +5 fresh).
- acwr: 7-day load ÷ average weekly load of the last 28 days. 0.8–1.3 steady, > 1.5 a spike.
- hrv_7d_ms vs hrv_baseline_ms (60 days) and hrv_z (on ln HRV); rhr_3d vs rhr_baseline and rhr_z; sleep_h, sleep_need_h, sleep_debt_7d_h.
- weight_trend_kg, body_fat_trend_pct: smoothed 10% per day, so single weigh-ins don't swing it.
- status: green/amber/red from rules on 4 systems (HRV, resting HR, sleep vs the user's own 28-day normal, training load). Red needs 2 systems. status_reasons lists every triggered rule as JSON.
weekly_summary: Monday-based weeks: runs, km, hours, longest run, load, intensity split %, easy efficiency, pace at reference HR, end-of-week fitness/form/weight, average sleep/HRV/resting HR, red days.

## Known caveats
- LT1 is estimated, so "low %" shifts if the true LT1 differs. Almost no running registers above LTHR ${thresholds.lthr}, even in threshold sessions: Garmin's LTHR may be set high.
- Garmin's sleep need (~8 h) is well above the user's typical sleep (~6.5 h): a chronic gap, tracked as sleep_debt_7d_h rather than in the daily status.
- 2022 and 2024 contain long training breaks; fitness curves dip accordingly.
- Treadmill speed comes from the wrist and is unreliable; exclude treadmill runs (activity_metrics.is_treadmill) from pace and efficiency analysis.
`;
}
