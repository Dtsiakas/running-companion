-- Garmin's estimate of fluid lost during an activity (ml): sweat plus breathing. Used for hydration guidance.
ALTER TABLE activities ADD COLUMN water_estimated_ml REAL;

-- Fill it for every activity already synced, from the raw activity lists kept in raw_responses: no download needed.
UPDATE activities
SET water_estimated_ml = (
  SELECT json_extract(item.value, '$.waterEstimated')
  FROM raw_responses r, json_each(r.body) AS item
  WHERE r.endpoint = 'activities-search'
    AND json_extract(item.value, '$.activityId') = activities.activity_id
    AND json_extract(item.value, '$.waterEstimated') IS NOT NULL
  ORDER BY r.fetched_at DESC
  LIMIT 1
);
