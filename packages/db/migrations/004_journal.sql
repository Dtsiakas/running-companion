-- What Garmin can't measure, and what Claude writes back. Both are written only through packages/journal,
-- which validates every field; nothing else writes to these tables.

-- One check-in per day: the day it describes (alcohol that evening, work stress that day), not the day it was logged.
CREATE TABLE journal (
  calendar_date             TEXT PRIMARY KEY,
  tags                      TEXT    NOT NULL DEFAULT '[]',   -- JSON array of tag keys, see JOURNAL_TAGS
  mood                      INTEGER CHECK (mood BETWEEN 1 AND 5),
  energy                    INTEGER CHECK (energy BETWEEN 1 AND 5),
  sore_spot                 TEXT,                            -- free text: "left calf"
  note                      TEXT,
  updated_at                INTEGER NOT NULL
) STRICT;

-- Weekly reviews, plans and notes, written by Claude through the connector (author 'claude') or by the user.
CREATE TABLE notes (
  note_id                   INTEGER PRIMARY KEY,
  kind                      TEXT    NOT NULL CHECK (kind IN ('weekly_review', 'plan', 'note')),
  title                     TEXT    NOT NULL,
  body                      TEXT    NOT NULL,                -- Markdown
  week_start                TEXT,                            -- Monday of the week a review or plan is about
  author                    TEXT    NOT NULL CHECK (author IN ('claude', 'user')),
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
) STRICT;

-- A week has one review and one plan: saving again replaces it instead of piling up versions.
CREATE UNIQUE INDEX notes_one_per_week ON notes (kind, week_start) WHERE kind IN ('weekly_review', 'plan');
CREATE INDEX notes_by_time ON notes (created_at);
