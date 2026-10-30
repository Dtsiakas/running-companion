-- Layer 3: derived metrics. Everything here is computed from layers 1–2 and can be deleted and recomputed
-- at any time (npm run metrics -- --full). Formulas live in packages/metrics, each documented there.

CREATE TABLE activity_metrics (
  activity_id               INTEGER PRIMARY KEY REFERENCES activities (activity_id) ON DELETE CASCADE,
  metrics_version           INTEGER NOT NULL,   -- bumped when a formula changes, so old rows get recomputed
  category                  TEXT    NOT NULL,   -- intended type: easy, long, recovery, tempo, threshold, intervals, sprint, test, other
  category_source           TEXT    NOT NULL,   -- 'workout' (planned workout name), 'training_effect', 'duration' or 'sport'
  is_treadmill              INTEGER NOT NULL,
  trimp                     REAL,               -- Banister training impulse from per-second HR
  low_s                     REAL,               -- seconds below LT1 (easy)
  moderate_s                REAL,               -- seconds between LT1 and lactate threshold
  high_s                    REAL,               -- seconds above lactate threshold
  steady_s                  REAL,               -- seconds used for the efficiency metrics below
  m_per_beat                REAL,               -- efficiency factor: metres covered per heartbeat
  w_per_beat                REAL,               -- power efficiency: watts per beat per minute
  decoupling_pct            REAL,               -- HR drift vs pace, steady runs of 30+ minutes only
  ref_hr                    INTEGER,            -- reference HR used for speed_at_ref_hr_mps
  speed_at_ref_hr_mps       REAL,               -- median speed while HR was within ±3 bpm of ref_hr
  ref_hr_s                  REAL,               -- seconds spent in that HR window
  vdot                      REAL,               -- Daniels VDOT from the best effort of 3 km or longer
  computed_at               INTEGER NOT NULL
) STRICT;

-- Fastest time over standard distances within each run, from the per-second distance stream.
CREATE TABLE activity_best_efforts (
  activity_id               INTEGER NOT NULL REFERENCES activities (activity_id) ON DELETE CASCADE,
  distance_m                REAL    NOT NULL,
  duration_s                REAL    NOT NULL,
  PRIMARY KEY (activity_id, distance_m)
) STRICT, WITHOUT ROWID;

CREATE INDEX best_efforts_by_distance ON activity_best_efforts (distance_m, duration_s);

-- One row per calendar day from the first data point to today, including days without runs.
CREATE TABLE daily_metrics (
  calendar_date             TEXT PRIMARY KEY,

  load                      REAL NOT NULL,      -- sum of TRIMP that day
  garmin_load               REAL,               -- sum of Garmin's per-activity load, for comparison
  fitness                   REAL,               -- CTL: 42-day exponentially weighted load
  fatigue                   REAL,               -- ATL: 7-day exponentially weighted load
  form                      REAL,               -- TSB: yesterday's fitness − fatigue (freshness going into the day)
  acwr                      REAL,               -- acute:chronic ratio: 7-day load ÷ (28-day load / 4)
  run_km_7d                 REAL,
  run_km_28d                REAL,

  hrv_ms                    REAL,               -- last night's average
  hrv_7d_ms                 REAL,               -- 7-day rolling (geometric) mean
  hrv_baseline_ms           REAL,               -- previous 60 days
  hrv_z                     REAL,               -- (7-day − baseline) in standard deviations, on ln(HRV)

  rhr                       INTEGER,
  rhr_3d                    REAL,
  rhr_baseline              REAL,               -- previous 60 days
  rhr_z                     REAL,

  sleep_h                   REAL,               -- last night
  sleep_need_h              REAL,               -- Garmin's adjusted sleep need
  sleep_debt_7d_h           REAL,               -- sum over 7 nights of (need − slept), shortfalls only

  weight_trend_kg           REAL,               -- exponentially smoothed (10% per day)
  body_fat_trend_pct        REAL,

  vdot                      REAL,               -- best activity VDOT in the last 90 days
  pred_5k_s                 REAL,
  pred_10k_s                REAL,
  pred_half_s               REAL,
  pred_marathon_s           REAL,

  status                    TEXT,               -- 'green', 'amber', 'red'; null when there's not enough data
  status_reasons            TEXT,               -- JSON array of {code, message}
  computed_at               INTEGER NOT NULL
) STRICT;

-- Monday-based weeks. Runs only (type_key contains 'running'); daily values averaged over the week.
-- SQLite detail: in an aggregate with MAX(x), bare columns come from the row holding that maximum,
-- which is how end-of-week values (fitness, form, weight trend) are picked.
CREATE VIEW weekly_summary AS
WITH run_weeks AS (
  SELECT
    date(a.calendar_date, '-' || ((CAST(strftime('%w', a.calendar_date) AS INTEGER) + 6) % 7) || ' days') AS week_start,
    COUNT(*)                                       AS runs,
    ROUND(SUM(a.distance_m) / 1000.0, 1)           AS km,
    ROUND(SUM(a.duration_s) / 3600.0, 2)           AS hours,
    ROUND(MAX(a.distance_m) / 1000.0, 1)           AS longest_km,
    ROUND(SUM(m.trimp))                            AS load,
    ROUND(100.0 * SUM(m.low_s) / NULLIF(SUM(m.low_s + m.moderate_s + m.high_s), 0)) AS low_pct,
    ROUND(100.0 * SUM(m.moderate_s) / NULLIF(SUM(m.low_s + m.moderate_s + m.high_s), 0)) AS moderate_pct,
    ROUND(100.0 * SUM(m.high_s) / NULLIF(SUM(m.low_s + m.moderate_s + m.high_s), 0)) AS high_pct,
    ROUND(AVG(CASE WHEN m.category IN ('easy', 'long', 'recovery') AND m.is_treadmill = 0 THEN m.m_per_beat END), 3) AS easy_m_per_beat,
    ROUND(AVG(CASE WHEN m.is_treadmill = 0 THEN m.speed_at_ref_hr_mps END), 3) AS speed_at_ref_hr_mps
  FROM activities a
  JOIN activity_metrics m USING (activity_id)
  WHERE a.type_key LIKE '%running%'
  GROUP BY 1
),
day_weeks AS (
  SELECT
    date(calendar_date, '-' || ((CAST(strftime('%w', calendar_date) AS INTEGER) + 6) % 7) || ' days') AS week_start,
    MAX(calendar_date)            AS last_day,
    ROUND(fitness, 1)             AS fitness,
    ROUND(form, 1)                AS form,
    ROUND(weight_trend_kg, 1)     AS weight_trend_kg,
    ROUND(body_fat_trend_pct, 1)  AS body_fat_trend_pct,
    ROUND(vdot, 1)                AS vdot
  FROM daily_metrics
  GROUP BY 1
),
day_averages AS (
  SELECT
    date(calendar_date, '-' || ((CAST(strftime('%w', calendar_date) AS INTEGER) + 6) % 7) || ' days') AS week_start,
    ROUND(AVG(sleep_h), 2)        AS avg_sleep_h,
    ROUND(AVG(hrv_ms))            AS avg_hrv_ms,
    ROUND(AVG(rhr), 1)            AS avg_rhr,
    SUM(status = 'red')           AS red_days
  FROM daily_metrics
  GROUP BY 1
)
SELECT
  d.week_start,
  COALESCE(r.runs, 0)  AS runs,
  COALESCE(r.km, 0)    AS km,
  COALESCE(r.hours, 0) AS hours,
  r.longest_km, r.load, r.low_pct, r.moderate_pct, r.high_pct, r.easy_m_per_beat, r.speed_at_ref_hr_mps,
  d.fitness, d.form, d.vdot, d.weight_trend_kg, d.body_fat_trend_pct,
  v.avg_sleep_h, v.avg_hrv_ms, v.avg_rhr, v.red_days
FROM day_weeks d
JOIN day_averages v USING (week_start)
LEFT JOIN run_weeks r USING (week_start)
ORDER BY d.week_start;
