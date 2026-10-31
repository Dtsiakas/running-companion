import type { DatabaseSync } from 'node:sqlite';
import { APP_VERSION } from '@companion/config';
import { thresholdsFromProfile } from '@companion/metrics';
import { describeSchema, getActivity, getBestEfforts, getToday, getTrend, getWeeklySummary, listActivities, runQuery, TREND_METRICS } from '@companion/queries';
import { getRunForecast } from '@companion/weather';
import { fuelPlan, getBodyReport, getFormTrend, getPatterns, getProgress, getSignals, getSleepReport, getStressReport, getWeeklyReport, getYearReview } from '@companion/insights';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { dataGuide, SERVER_INSTRUCTIONS } from './guide.ts';
import { addDays, mondayOf, today } from '@companion/dates';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const CATEGORIES = ['easy', 'long', 'recovery', 'tempo', 'threshold', 'intervals', 'sprint', 'test', 'other'] as const;
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export interface ToolsOptions {
  /** A read-only connection for every read: a mistaken query can't change anything. */
  db: DatabaseSync;
  /**
   * The one writable connection, used only to cache the weather forecast. No tool can write Garmin data, metrics or
   * anything else.
   */
  writeDb: DatabaseSync;
  /** Runs a Garmin sync. Injected so tests don't call Garmin. */
  sync: () => Promise<unknown>;
  /**
   * Runs the `query` tool's SQL. The servers pass runQueryIsolated (its own thread, with a time limit); without it the
   * query runs on `db` directly, which is what tests want.
   */
  query?: (sql: string) => Promise<unknown>;
}

/**
 * An MCP server with all tools registered. Transport-agnostic: Claude Desktop uses it over stdin/stdout
 * (server.ts), the web server over HTTP (packages/server). The caller owns the database connection.
 */
export function createMcpServer({ db, writeDb, sync, query = async (sql) => runQuery(db, sql) }: ToolsOptions): McpServer {
  /** Today in the user's own time zone (the Garmin profile's), not the server's: near midnight they can differ. */
  const localToday = () => {
    const zone = (db.prepare('SELECT time_zone FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get() as { time_zone?: string } | undefined)?.time_zone;
    return today(zone ?? 'UTC');
  };
  const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const server = new McpServer({ name: 'running-companion', version: APP_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    'get_today',
    {
      title: 'Today',
      description:
        'Recovery status (green/amber/red with reasons), HRV, resting HR, sleep, training load (fitness/fatigue/form), last night in detail (score, stages, bedtime, breathing rate, SpO2), energy (Body Battery this morning, yesterday\'s stress), everyday activity (steps, calories, weekly intensity minutes), weight trend, fitness age with its biggest lever and the weight goal, the latest run, and how fresh the data is. Pass a date for a past day.',
      inputSchema: { date: date.optional() },
      annotations: READ_ONLY,
    },
    async ({ date: day }) => {
      return json(getToday(db, day));
    },
  );

  server.registerTool(
    'get_weekly_summary',
    {
      title: 'Weekly summary',
      description: 'One row per Monday-based week: runs, km, hours, load, intensity split, efficiency, fitness/form, weight, sleep, HRV, resting HR.',
      inputSchema: { weeks: z.number().int().min(1).max(260).default(8) },
      annotations: READ_ONLY,
    },
    async ({ weeks }) => json(getWeeklySummary(db, weeks)),
  );

  server.registerTool(
    'list_activities',
    {
      title: 'List activities',
      description: 'Activities newest first, with pace, HR, load, intensity split, efficiency and RPE. Filter by date range, run category or activity type.',
      inputSchema: {
        from: date.optional(),
        to: date.optional(),
        category: z.enum(CATEGORIES).optional(),
        type: z.string().optional().describe("Substring of the activity type, e.g. 'running', 'treadmill', 'hiking'"),
        limit: z.number().int().min(1).max(200).default(20),
      },
      annotations: READ_ONLY,
    },
    async (filters) => json(listActivities(db, filters)),
  );

  server.registerTool(
    'get_activity',
    {
      title: 'Activity details',
      description: 'Everything about one activity: summary, running dynamics, zones, the planned workout steps, planned vs actual per step (executed_steps: auto-laps merged back into steps, pace judged against the target as on/fast/slow), every lap and best efforts. Defaults to the latest activity.',
      inputSchema: { activity_id: z.number().int().positive().optional() },
      annotations: READ_ONLY,
    },
    async ({ activity_id }) => json(getActivity(db, activity_id)),
  );

  server.registerTool(
    'get_best_efforts',
    {
      title: 'Best efforts',
      description: 'Fastest time for 400 m, 1 km, 1 mile, 3 km, 5 km, 10 km, half and marathon found inside any run. Optionally only since a date.',
      inputSchema: { since: date.optional() },
      annotations: READ_ONLY,
    },
    async ({ since }) => json(getBestEfforts(db, since)),
  );

  server.registerTool(
    'get_trend',
    {
      title: 'Trend',
      description: `A metric aggregated per week or month. Metrics: ${Object.entries(TREND_METRICS)
        .map(([name, metric]) => `${name} (${metric.description})`)
        .join('; ')}.`,
      inputSchema: {
        metric: z.enum(Object.keys(TREND_METRICS) as [string, ...string[]]),
        period: z.enum(['week', 'month']).default('month'),
        from: date.optional(),
        to: date.optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ metric, period, from, to }) => json(getTrend(db, metric, period, from, to)),
  );

  server.registerTool(
    'describe_data',
    {
      title: 'Describe data',
      description: 'Schema of every table, units, how each derived metric is calculated, the HR thresholds in use and known caveats. Read before writing SQL.',
      annotations: READ_ONLY,
    },
    async () => {
      const profile = db.prepare('SELECT max_hr, resting_hr_used, lactate_threshold_hr FROM profile_snapshots ORDER BY calendar_date DESC LIMIT 1').get();
      const guide = dataGuide(thresholdsFromProfile(profile as Parameters<typeof thresholdsFromProfile>[0]));
      return { content: [{ type: 'text' as const, text: `${guide}\n## Schema\n${JSON.stringify(describeSchema(db), null, 1)}` }] };
    },
  );

  server.registerTool(
    'query',
    {
      title: 'SQL query',
      description: 'Run one read-only SQLite SELECT against the database (max 200 rows). Call describe_data first for tables, units and conventions.',
      inputSchema: { sql: z.string().min(1) },
      annotations: READ_ONLY,
    },
    async ({ sql }) => {
      try {
        return json(await query(sql));
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: `SQL error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    },
  );

  server.registerTool(
    'sync_garmin',
    {
      title: 'Sync from Garmin',
      description: 'Fetch new data from Garmin (activities, sleep, HRV, wellness, weigh-ins) and recompute metrics. Usually takes 10–30 seconds.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        return json(await sync());
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: `Sync failed: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    },
  );

  server.registerTool(
    'get_insights',
    {
      title: 'Insights',
      description:
        "Signals for a day (warnings such as possible illness, overreaching, load spikes; watch items such as easy-run drift, sleep debt, irregular bedtimes, stress streaks; positives) and the user's personal patterns: comparisons from two years of their own data (late bedtimes, short nights, hard sessions, stressful days, evening runs, running after short nights or in heat), each with sample sizes, p-values (p raw, q adjusted for the number of comparisons: q decides what counts as an effect), effect size d and a caveat. Patterns are associations, not proof of cause; say so. Pass a date (defaults to the latest day with data).",
      inputSchema: { date: date.optional(), include_patterns: z.boolean().default(true) },
      annotations: READ_ONLY,
    },
    async ({ date: day, include_patterns }) => {
      const latest = day ?? String((db.prepare('SELECT MAX(calendar_date) AS d FROM daily_metrics').get() as { d: string }).d);
      return json({ date: latest, signals: getSignals(db, latest), patterns: include_patterns ? getPatterns(db, latest) : undefined });
    },
  );

  server.registerTool(
    'get_weekly_report',
    {
      title: 'Weekly report',
      description:
        'The computed report for one Monday-to-Sunday week: a headline, training (volume against the previous four weeks, intensity balance, form), key sessions with planned vs actual, recovery (HRV, resting heart rate, status days, sleep against need, sleep score, bedtime regularity), life (stress, Body Battery), body (weight trend), new personal bests and the signals raised during the week. Lines carry a tone (good, neutral, concern). Start every weekly review from this. Defaults to the last complete week.',
      inputSchema: { week_start: date.optional() },
      annotations: READ_ONLY,
    },
    async ({ week_start }) => {
      const today = localToday();
      return json(getWeeklyReport(db, week_start ?? addDays(mondayOf(today), -7), today) ?? { error: 'No data for that week.' });
    },
  );

  server.registerTool(
    'get_body_report',
    {
      title: 'Body and nutrition',
      description:
        "Weight trend against the user's goal with a safe-rate assessment and projected date, body composition (two-week averages of fat and muscle, a muscle-loss flag), Garmin's fitness age, calories burned on rest, training and big days, the user's own sweat rates (ml/h, overall and warm vs cool), and daily protein and carbohydrate ranges for their weight from the ACSM/ISSN position stands. Pass run_minutes (and hard) for a fuel and fluid plan for one run. This is general sports-nutrition guidance, not a diet: never suggest aggressive deficits, and point to a sports dietitian for personal plans.",
      inputSchema: { date: date.optional(), run_minutes: z.number().int().min(10).max(600).optional(), hard: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    async ({ date: day, run_minutes, hard }) => {
      const latest = day ?? String((db.prepare('SELECT MAX(calendar_date) AS d FROM daily_metrics').get() as { d: string }).d);
      const body = getBodyReport(db, latest);
      const { weight_series: _series, weigh_ins: _weighIns, ...summary } = body;
      const plan =
        run_minutes && body.nutrition
          ? fuelPlan({ weightKg: body.nutrition.weight_kg, minutes: run_minutes, sweatMlPerHour: body.sweat.typical_ml_per_hour, hard })
          : undefined;
      return json({ ...summary, fuel_plan: plan });
    },
  );

  server.registerTool(
    'get_sleep_stress_report',
    {
      title: 'Sleep and stress in depth',
      description:
        "Sleep: the last 4 weeks of nights (bedtime, wake time, hours, Garmin's sleep need, score), tonight's suggested bedtime (Garmin's need counted back from the usual wake time for tomorrow's kind of day, plus a realistic 30-minute step when the target is far from the usual bedtime), 7-night sleep debt, timing consistency (spread of bed and wake times, weekday vs weekend shift) and the stage mix against Garmin's ideal ranges. Stress: Body Battery charged vs drained (2-week balance and morning levels), what charges and drains it per day (sleep, naps, workouts, stress, everyday), awake minutes at each stress level, workdays vs weekends. Clock times are local. For what affects sleep for this user, also see get_insights (bedtime, short nights, evening runs).",
      inputSchema: { date: date.optional() },
      annotations: READ_ONLY,
    },
    async ({ date: day }) => {
      const latest = day ?? String((db.prepare('SELECT MAX(calendar_date) AS d FROM sleep').get() as { d: string }).d);
      const sleep = getSleepReport(db, latest);
      const stress = getStressReport(db, latest);
      return json({ sleep, stress: { ...stress, days: stress.days.slice(-14) } });
    },
  );

  server.registerTool(
    'get_run_forecast',
    {
      title: 'When to run',
      description:
        "Hourly forecast for today's remaining hours and tomorrow (06:00 to 22:00) where the user usually runs, from Open-Meteo: air temperature, dew point, humidity, wind, chance of rain, and the heat cost of each hour (Hadley's temperature plus dew point rule: estimated % slower at the same effort). Each day has the coolest dry window and the hour to avoid. Clock hours are local. A run's own weather and heat-adjusted pace are in get_activity.",
      inputSchema: {},
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async () => json((await getRunForecast(writeDb, fetch)) ?? { error: 'No forecast: the weather for past runs has not been synced yet, or Open-Meteo could not be reached.' }),
  );

  // Progress ------------------------------------------------------------------------------------------
  /** Today in the user's own time zone (the Garmin profile's), not UTC: near midnight the two can be different days. */

  server.registerTool(
    'get_progress',
    {
      title: 'Progress, milestones and year in review',
      description:
        'Lifetime totals, milestones passed with their dates (total km, run counts, first times under round times per distance), the next milestones with an estimated date at the recent pace, records (longest run, biggest week and month, weekly streaks) and personal bests per distance. Pass year for that year in review (volume, consistency, PBs set, fitness and resting values from start to end of year, time of day, hottest and coldest run, against the previous year). Pass form: true for running form by month on easy runs, adjusted to the same pace.',
      inputSchema: { year: z.number().int().min(2000).max(2100).optional(), form: z.boolean().default(false) },
      annotations: READ_ONLY,
    },
    async ({ year, form }) => {
      const today = localToday();
      return json({ progress: getProgress(db, today), year_review: year ? getYearReview(db, year, today) : undefined, form: form ? getFormTrend(db, today) : undefined });
    },
  );

  return server;
}


