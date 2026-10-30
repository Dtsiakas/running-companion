-- Air temperature and humidity at the time and place of each outdoor run (Open-Meteo), because the watch's own
-- temperature sensor sits against the wrist and reads several degrees warm. The hour nearest the middle of the run.
CREATE TABLE activity_weather (
  activity_id               INTEGER PRIMARY KEY REFERENCES activities (activity_id) ON DELETE CASCADE,
  lat                       REAL    NOT NULL,   -- where the run started, 3 decimals (about 100 m)
  lon                       REAL    NOT NULL,
  hour                      INTEGER NOT NULL,   -- start of the hour used, epoch ms UTC
  temp_c                    REAL    NOT NULL,
  dew_point_c               REAL    NOT NULL,
  humidity_pct              REAL,
  wind_kmh                  REAL,
  source                    TEXT    NOT NULL CHECK (source IN ('archive', 'forecast')),
  fetched_at                INTEGER NOT NULL
) STRICT;

-- The coming days' hourly forecast for where you usually run, cached so the dashboard asks Open-Meteo at most hourly.
CREATE TABLE weather_forecast (
  place                     TEXT    PRIMARY KEY,   -- 'lat,lon' at 2 decimals
  lat                       REAL    NOT NULL,
  lon                       REAL    NOT NULL,
  hours                     TEXT    NOT NULL,      -- JSON array of HourlyWeather
  fetched_at                INTEGER NOT NULL
) STRICT;
