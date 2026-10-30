-- What you typed in by hand goes: the daily check-in and the races. The app runs on what the watch records.
-- Saved check-ins and races are deleted with their tables.
DROP TABLE IF EXISTS journal;
DROP TABLE IF EXISTS races;

-- The app's own race predictions go too (Garmin's predictions and race plans cover them, and two different
-- predictions only invite doubt): VDOT and the predicted times. The weekly view read VDOT, so it's recreated without it
-- before the columns can be dropped.
DROP VIEW weekly_summary;

ALTER TABLE daily_metrics DROP COLUMN vdot;
ALTER TABLE daily_metrics DROP COLUMN pred_5k_s;
ALTER TABLE daily_metrics DROP COLUMN pred_10k_s;
ALTER TABLE daily_metrics DROP COLUMN pred_half_s;
ALTER TABLE daily_metrics DROP COLUMN pred_marathon_s;
ALTER TABLE activity_metrics DROP COLUMN vdot;

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
    ROUND(body_fat_trend_pct, 1)  AS body_fat_trend_pct
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
  d.fitness, d.form, d.weight_trend_kg, d.body_fat_trend_pct,
  v.avg_sleep_h, v.avg_hrv_ms, v.avg_rhr, v.red_days
FROM day_weeks d
JOIN day_averages v USING (week_start)
LEFT JOIN run_weeks r USING (week_start)
ORDER BY d.week_start;
