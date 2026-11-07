-- The food log: what the user ate, as Claude estimated it from a photo or a description when the user asked to log it.
-- The only data in the app typed in rather than recorded by the watch, so the only table a tool can write.
CREATE TABLE meals (
  meal_id       INTEGER PRIMARY KEY,
  calendar_date TEXT    NOT NULL,            -- local date the meal was eaten
  time          TEXT,                        -- local 'HH:MM', when known
  description   TEXT    NOT NULL,            -- what and how much, in the user's words
  kcal          REAL    NOT NULL,
  protein_g     REAL    NOT NULL,
  carbs_g       REAL    NOT NULL,
  fat_g         REAL    NOT NULL,
  logged_at     INTEGER NOT NULL             -- UTC epoch ms
);
CREATE INDEX meals_by_date ON meals (calendar_date, time);
