-- Initial schema.
--
-- Conventions
--   * Units are in the column name, base units: _m metres, _s seconds, _mps metres/second, _kg, _mm, _ms milliseconds,
--     _w watts, _pct percent, _spm steps/minute, _c degrees Celsius, _min minutes.
--   * calendar_date: TEXT 'YYYY-MM-DD' in the user's local time zone (how Garmin assigns days).
--   * Timestamps (*_time, *_at): INTEGER milliseconds since epoch, UTC.
--   * Booleans: INTEGER 0/1.
--   * STRICT tables: SQLite rejects values of the wrong type.
--   * updated_at: when our sync last wrote the row.

-- Layer 1: raw API responses, exactly as received. Lets us add columns later without re-downloading history.
CREATE TABLE raw_responses (
  endpoint   TEXT    NOT NULL,          -- e.g. 'sleep-summaries'
  key        TEXT    NOT NULL,          -- what was requested: a date range, a date or an activity id
  fetched_at INTEGER NOT NULL,
  body       TEXT    NOT NULL,          -- JSON
  PRIMARY KEY (endpoint, key)
) STRICT;

-- How far each data stream has been synced, so runs are incremental and an interrupted backfill resumes.
CREATE TABLE sync_state (
  stream        TEXT PRIMARY KEY,
  newest_date   TEXT,                   -- newest calendar date synced
  oldest_date   TEXT,                   -- oldest calendar date synced so far (backfill moves this backwards)
  backfill_done INTEGER NOT NULL DEFAULT 0,
  empty_streak  INTEGER NOT NULL DEFAULT 0, -- consecutive empty chunks seen while backfilling
  updated_at    INTEGER NOT NULL
) STRICT;

-- Layer 2: typed tables -------------------------------------------------------------------------------

CREATE TABLE activities (
  activity_id               INTEGER PRIMARY KEY,
  name                      TEXT,
  type_key                  TEXT    NOT NULL,   -- 'running', 'treadmill_running', 'strength_training', ...
  parent_type_id            INTEGER,
  start_time                INTEGER NOT NULL,
  start_time_local          TEXT    NOT NULL,   -- wall clock where the activity happened, 'YYYY-MM-DDTHH:MM:SS'
  calendar_date             TEXT    NOT NULL,
  location_name             TEXT,
  workout_name              TEXT,               -- planned workout loaded on the watch, if any
  is_pr                     INTEGER,

  distance_m                REAL,
  duration_s                REAL,               -- timer time (excludes pauses)
  moving_duration_s         REAL,
  elapsed_duration_s        REAL,
  elevation_gain_m          REAL,
  elevation_loss_m          REAL,
  avg_speed_mps             REAL,
  max_speed_mps             REAL,
  avg_gap_speed_mps         REAL,               -- grade adjusted
  steps                     INTEGER,
  calories                  INTEGER,

  avg_hr                    INTEGER,
  max_hr                    INTEGER,
  min_hr                    INTEGER,
  avg_cadence_spm           REAL,
  max_cadence_spm           REAL,
  avg_power_w               REAL,
  max_power_w               REAL,
  norm_power_w              REAL,
  avg_gct_ms                REAL,               -- ground contact time
  avg_vertical_oscillation_mm REAL,
  avg_vertical_ratio_pct    REAL,
  avg_step_length_mm        REAL,
  avg_temp_c                REAL,
  min_temp_c                REAL,
  max_temp_c                REAL,

  aerobic_te                REAL,               -- Garmin training effect, 0–5
  anaerobic_te              REAL,
  te_label                  TEXT,               -- 'LACTATE_THRESHOLD', 'BASE', ...
  training_load             REAL,               -- Garmin's per-activity load (EPOC based)
  moderate_intensity_min    INTEGER,
  vigorous_intensity_min    INTEGER,
  body_battery_delta        INTEGER,
  rpe                       REAL,               -- perceived exertion entered after the run, 1–10
  feel                      INTEGER,            -- "how did it feel", 0 (very weak) – 100 (very strong)
  compliance_score          INTEGER,            -- how closely a structured workout was followed, 0–100
  stamina_start_pct         REAL,
  stamina_end_pct           REAL,

  hr_zone1_s REAL, hr_zone2_s REAL, hr_zone3_s REAL, hr_zone4_s REAL, hr_zone5_s REAL,
  power_zone1_s REAL, power_zone2_s REAL, power_zone3_s REAL, power_zone4_s REAL, power_zone5_s REAL,
  fastest_1k_s              REAL,
  fastest_mile_s            REAL,
  fastest_5k_s              REAL,

  fit_path                  TEXT,               -- relative to the data folder, e.g. 'fit/123.fit'
  fit_sha256                TEXT,
  details_synced            INTEGER NOT NULL DEFAULT 0, -- detail, workout and FIT processed
  updated_at                INTEGER NOT NULL
) STRICT;

CREATE INDEX activities_by_date ON activities (calendar_date);

CREATE TABLE activity_laps (
  activity_id               INTEGER NOT NULL REFERENCES activities (activity_id) ON DELETE CASCADE,
  lap_index                 INTEGER NOT NULL,
  start_time                INTEGER,
  elapsed_s                 REAL,
  timer_s                   REAL,
  distance_m                REAL,
  avg_speed_mps             REAL,
  max_speed_mps             REAL,
  avg_hr                    INTEGER,
  max_hr                    INTEGER,
  avg_power_w               REAL,
  max_power_w               REAL,
  norm_power_w              REAL,
  avg_cadence_spm           REAL,
  avg_gct_ms                REAL,
  avg_vertical_oscillation_mm REAL,
  avg_step_length_mm        REAL,
  ascent_m                  REAL,
  descent_m                 REAL,
  intensity                 TEXT,               -- 'active', 'rest', 'warmup', 'cooldown', 'recovery', 'interval'
  lap_trigger               TEXT,               -- 'manual', 'distance', 'time', 'session_end', ...
  workout_step_index        INTEGER,
  PRIMARY KEY (activity_id, lap_index)
) STRICT, WITHOUT ROWID;

-- One row per recorded second (the FIT "record" messages). The largest table by far.
CREATE TABLE activity_records (
  activity_id               INTEGER NOT NULL REFERENCES activities (activity_id) ON DELETE CASCADE,
  time                      INTEGER NOT NULL,
  lat                       REAL,               -- degrees
  lon                       REAL,
  distance_m                REAL,               -- cumulative
  speed_mps                 REAL,
  altitude_m                REAL,
  hr                        INTEGER,
  cadence_spm               REAL,
  power_w                   REAL,
  gct_ms                    REAL,
  vertical_oscillation_mm   REAL,
  vertical_ratio_pct        REAL,
  step_length_mm            REAL,
  temperature_c             REAL,
  PRIMARY KEY (activity_id, time)
) STRICT, WITHOUT ROWID;

CREATE TABLE daily_wellness (
  calendar_date             TEXT PRIMARY KEY,
  steps                     INTEGER,
  step_goal                 INTEGER,
  walking_distance_m        REAL,
  floors_up                 INTEGER,
  floors_down               INTEGER,
  resting_hr                INTEGER,
  min_hr                    INTEGER,
  max_hr                    INTEGER,
  stress_avg                INTEGER,            -- Garmin stress 0–100
  stress_max                INTEGER,
  stress_qualifier          TEXT,
  rest_stress_s             REAL,
  low_stress_s              REAL,
  medium_stress_s           REAL,
  high_stress_s             REAL,
  body_battery_min          INTEGER,
  body_battery_max          INTEGER,
  body_battery_charged      INTEGER,
  body_battery_drained      INTEGER,
  body_battery_end          INTEGER,
  moderate_intensity_min    INTEGER,
  vigorous_intensity_min    INTEGER,
  intensity_goal_min        INTEGER,
  calories_total            INTEGER,
  calories_active           INTEGER,
  calories_resting          INTEGER,
  respiration_avg           REAL,               -- breaths per minute
  respiration_min           REAL,
  respiration_max           REAL,
  spo2_avg_pct              REAL,
  spo2_min_pct              REAL,
  hydration_ml              REAL,
  updated_at                INTEGER NOT NULL
) STRICT;

-- One row per night, keyed by the date Garmin assigns (the morning you wake up).
CREATE TABLE sleep (
  calendar_date             TEXT PRIMARY KEY,
  start_time                INTEGER,
  end_time                  INTEGER,
  sleep_s                   REAL,
  deep_s                    REAL,
  light_s                   REAL,
  rem_s                     REAL,
  awake_s                   REAL,
  nap_s                     REAL,
  awake_count               INTEGER,
  score                     INTEGER,            -- 0–100
  score_qualifier           TEXT,               -- 'EXCELLENT', 'GOOD', 'FAIR', 'POOR'
  duration_qualifier        TEXT,
  stress_qualifier          TEXT,
  deep_pct                  REAL,
  light_pct                 REAL,
  rem_pct                   REAL,
  avg_hr                    INTEGER,
  avg_sleep_stress          REAL,
  avg_spo2_pct              REAL,
  lowest_spo2_pct           REAL,
  avg_respiration           REAL,
  lowest_respiration        REAL,
  highest_respiration       REAL,
  need_baseline_min         INTEGER,            -- Garmin's sleep need before adjustments
  need_actual_min           INTEGER,            -- after adjusting for training, HRV, sleep debt, naps
  need_feedback             TEXT,
  score_feedback            TEXT,
  score_insight             TEXT,
  breathing_disruption      TEXT,
  updated_at                INTEGER NOT NULL
) STRICT;

CREATE TABLE hrv (
  calendar_date             TEXT PRIMARY KEY,
  last_night_avg_ms         REAL,
  last_night_5min_high_ms   REAL,
  weekly_avg_ms             REAL,
  baseline_low_upper_ms     REAL,               -- below this: LOW
  baseline_balanced_low_ms  REAL,               -- balanced band lower bound
  baseline_balanced_upper_ms REAL,              -- balanced band upper bound
  status                    TEXT,               -- 'BALANCED', 'UNBALANCED', 'LOW', 'POOR'
  feedback                  TEXT,
  updated_at                INTEGER NOT NULL
) STRICT;

CREATE TABLE weigh_ins (
  sample_pk                 INTEGER PRIMARY KEY,
  measured_at               INTEGER NOT NULL,
  calendar_date             TEXT    NOT NULL,
  weight_kg                 REAL    NOT NULL,
  bmi                       REAL,
  body_fat_pct              REAL,
  body_water_pct            REAL,
  muscle_mass_kg            REAL,
  bone_mass_kg              REAL,
  visceral_fat              REAL,
  metabolic_age             INTEGER,
  source                    TEXT,               -- 'INDEX_SCALE', 'MANUAL', ...
  updated_at                INTEGER NOT NULL
) STRICT;

CREATE INDEX weigh_ins_by_date ON weigh_ins (calendar_date);

-- Profile values that change over time (zones, max HR, fitness age). One snapshot per day the sync runs.
CREATE TABLE profile_snapshots (
  calendar_date             TEXT PRIMARY KEY,
  max_hr                    INTEGER,
  resting_hr_used           INTEGER,
  lactate_threshold_hr      INTEGER,
  hr_zone_method            TEXT,
  hr_zone1_floor            INTEGER,
  hr_zone2_floor            INTEGER,
  hr_zone3_floor            INTEGER,
  hr_zone4_floor            INTEGER,
  hr_zone5_floor            INTEGER,
  fitness_age               REAL,
  chronological_age         INTEGER,
  weight_goal_kg            REAL,
  time_zone                 TEXT,
  updated_at                INTEGER NOT NULL
) STRICT;
