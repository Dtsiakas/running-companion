-- What charged and drained Body Battery each day, summed by cause (Garmin's activityEvents: SLEEP, NAP, ACTIVITY,
-- STRESS, RECOVERY). Charges are positive, drains negative. NULL means Garmin sent no events of that kind.
ALTER TABLE daily_wellness ADD COLUMN bb_sleep INTEGER;
ALTER TABLE daily_wellness ADD COLUMN bb_nap INTEGER;
ALTER TABLE daily_wellness ADD COLUMN bb_activity INTEGER;
ALTER TABLE daily_wellness ADD COLUMN bb_stress INTEGER;
ALTER TABLE daily_wellness ADD COLUMN bb_recovery INTEGER;

-- Garmin's sleep need for the following night (minutes), sent with each night's summary. The latest night's value
-- is tonight's need, which the suggested bedtime is built on.
ALTER TABLE sleep ADD COLUMN next_need_min INTEGER;

-- Backfill both from the responses already stored, so history doesn't wait for a full re-sync.
-- A day can appear in several stored responses (re-syncs); the most recent one wins.
CREATE TEMP TABLE latest_day AS
SELECT day, value FROM (
  SELECT json_extract(item.value, '$.calendarDate') AS day, item.value AS value,
         ROW_NUMBER() OVER (PARTITION BY json_extract(item.value, '$.calendarDate') ORDER BY r.fetched_at DESC) AS rn
  FROM raw_responses r, json_each(r.body, '$.data') AS item
  WHERE r.endpoint = 'daily-summaries'
) WHERE rn = 1;

CREATE TEMP TABLE bb_events AS
SELECT d.day, json_extract(e.value, '$.eventType') AS kind, SUM(json_extract(e.value, '$.bodyBatteryImpact')) AS impact
FROM latest_day d, json_each(d.value, '$.bodyBattery.activityEvents') AS e
GROUP BY d.day, kind;

UPDATE daily_wellness SET
  bb_sleep    = (SELECT impact FROM bb_events WHERE day = calendar_date AND kind = 'SLEEP'),
  bb_nap      = (SELECT impact FROM bb_events WHERE day = calendar_date AND kind = 'NAP'),
  bb_activity = (SELECT impact FROM bb_events WHERE day = calendar_date AND kind = 'ACTIVITY'),
  bb_stress   = (SELECT impact FROM bb_events WHERE day = calendar_date AND kind = 'STRESS'),
  bb_recovery = (SELECT impact FROM bb_events WHERE day = calendar_date AND kind = 'RECOVERY');

CREATE TEMP TABLE latest_night AS
SELECT day, need FROM (
  SELECT json_extract(item.value, '$.calendarDate') AS day, json_extract(item.value, '$.nextSleepNeed.actual') AS need,
         ROW_NUMBER() OVER (PARTITION BY json_extract(item.value, '$.calendarDate') ORDER BY r.fetched_at DESC) AS rn
  FROM raw_responses r, json_each(r.body) AS item
  WHERE r.endpoint = 'sleep-summaries'
) WHERE rn = 1;

UPDATE sleep SET next_need_min = (SELECT need FROM latest_night WHERE day = calendar_date);

DROP TABLE latest_day;
DROP TABLE bb_events;
DROP TABLE latest_night;
