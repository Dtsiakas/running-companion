-- Races you've entered, set in the app or through Claude. Written only through packages/journal, which validates
-- every field. The next race (earliest on or after today) drives the race plan.
CREATE TABLE races (
  race_id                   INTEGER PRIMARY KEY,
  name                      TEXT    NOT NULL,
  race_date                 TEXT    NOT NULL,            -- YYYY-MM-DD
  distance_m                REAL    NOT NULL CHECK (distance_m BETWEEN 1000 AND 100000),
  goal_s                    INTEGER CHECK (goal_s > 0),  -- goal finish time, optional
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
) STRICT;

CREATE INDEX races_by_date ON races (race_date);
