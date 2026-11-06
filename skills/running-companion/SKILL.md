---
name: running-companion
description: Answer questions about the user's running, training, recovery, sleep, stress, body composition and nutrition from their Garmin data, through a connected Running Companion MCP server. Use when they ask how they're doing, whether to train hard today, about a run, a week, trends, personal bests, sleep, weight or what affects their recovery.
---

# Running Companion

[Running Companion](https://github.com/Dtsiakas/running-companion) is a self-hosted app that syncs a person's Garmin
watch data into their own database and serves it to AI assistants through an MCP server. This skill is for answering
from that data well.

## Before you start

- The tools come from the user's own Running Companion server (`get_today`, `get_activity`, `query`, …). If they aren't
  available, the server isn't connected: point the user to the project's README (the connector address is in the app's
  Settings → Claude). Don't answer health or training questions as if you had their data when you don't.
- Data may be stale. `get_today` says when each stream last synced; offer `sync_garmin` when freshness matters (asking
  about this morning's run, today's readiness).
- What exists depends on the watch and accessories: running dynamics need a chest strap or running pod, body
  composition a smart scale. `describe_data` and `get_today` say what's there. Never fill a gap with a guess.

## Which tool for which question

| Question | Tools |
|---|---|
| How am I doing? Should I train hard today? | `get_today`, then `get_insights` (today's warnings and watch items) |
| How was my week / month? | `get_weekly_summary`, or `get_trend` for one metric over time |
| A weekly review | `get_weekly_report` first (the computed facts), then the weeks before it to compare |
| A specific run | `list_activities`, then `get_activity` (laps, effort, efficiency, form, weather and heat cost) |
| Personal bests | `get_best_efforts` |
| Milestones, streaks, year in review, running form over months | `get_progress` |
| What affects my sleep, recovery or runs? | `get_insights` (personal patterns with sample sizes, p-values and effect sizes) |
| Sleep, bedtime, sleep debt, stress, Body Battery | `get_sleep_stress_report` |
| When to run today or tomorrow, heat and humidity | `get_run_forecast` |
| Weight, body composition, food, fluids, fuelling a run | `get_body_report` (pass `run_minutes` for a fuel plan) |
| Anything else | `describe_data` first (schema, units, formulas, caveats), then `query` with read-only SQL |

`query` runs SELECT statements only, with a 15-second limit. Always filter `activity_records` (one row per recorded
second) by `activity_id`, and aggregate rather than pulling raw rows.

## How to answer

- **Garmin is the coach.** Its suggested workouts, training status, race predictions and plans stay in Garmin Connect;
  this app has none of its own. Explain the numbers, connect sleep, recovery and training, and suggest, but don't
  contradict Garmin without a clear reason in the data.
- **Say what a number means for this person**, against their own normal (baselines are in the data), not just its value.
- **Patterns are associations, not causes.** Use `q` (adjusted for the number of comparisons), not the raw `p`, to say
  whether something is a finding, and mention the sample size.
- **Units:** the connector reports metric (pace in min/km, distance in km). Convert if the user asks for miles.
- **Change gradually:** suggest bedtime shifts of about 30 minutes at a time, never aggressive weight loss, and only
  general sports-nutrition ranges.
- **Be honest about limits.** Several metrics are approximations (`describe_data` lists them). They aren't medical
  facts: for persistent abnormal signals (resting HR, HRV, SpO2, breathing rate), suggest seeing a doctor.
