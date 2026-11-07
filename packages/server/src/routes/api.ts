import type { DatabaseSync } from 'node:sqlite';
import {
  getActivity,
  getActivityRecords,
  getBaselineBands,
  getBestEfforts,
  getDailySeries,
  getPlaces,
  getRoute,
  getToday,
  getAvailableTrendMetrics,
  getTrend,
  getWeek,
  getWeeklySummary,
  listActivities,
  TREND_METRICS,
} from '@companion/queries';
import { deleteMeal, getBodyReport, getFormTrend, getNutrition, getPatterns, getProgress, getSignals, getSleepReport, getStressReport, getWeeklyReport, getYearReview } from '@companion/insights';
import { getRunForecast } from '@companion/weather';
import { requestI18n } from '../locale.ts';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

export interface ApiRouteOptions {
  db: DatabaseSync;
  /** For the weather forecast cache and removing food-log entries: everything else the dashboard does is reading. */
  writeDb: DatabaseSync;
  /** CARTO basemaps key, sent to the browser for the map tiles (it's a public tile key, like any web map's). */
  cartoKey?: string | null;
  sync: () => Promise<unknown>;
  isSyncRunning: () => boolean;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CATEGORIES = ['easy', 'long', 'recovery', 'tempo', 'threshold', 'intervals', 'sprint', 'test', 'other'] as const;

/**
 * JSON for the dashboard. Same query functions as the MCP tools, so both always agree.
 * Query strings are validated with zod: bad input gets a 400 explaining what's wrong instead of a confusing SQL error.
 */
const isNotFound = (value: unknown): value is { error: string } =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as { error?: unknown }).error === 'string';

export function apiRoutes({ db, writeDb, sync, isSyncRunning, cartoKey = null }: ApiRouteOptions): Router {
  const router = Router();

  const handle = <T extends z.ZodType>(schema: T, run: (input: z.infer<T>, req: Request) => unknown) => (req: Request, res: Response) => {
    const parsed = schema.safeParse({ ...req.query, ...req.params });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid parameters', issues: z.flattenError(parsed.error).fieldErrors });
    const result = run(parsed.data, req);
    // The queries answer "nothing here" with { error } (the MCP tools pass that sentence on as it is). Over HTTP it's a 404,
    // so the app can tell it apart from data.
    if (isNotFound(result)) return res.status(404).json(result);
    res.json(result);
  };

  router.get('/session', (_req, res) => res.json({ loggedIn: true }));

  router.get('/today', handle(z.object({ date: date.optional() }), ({ date: day }, req) => getToday(db, day, requestI18n(req))));

  router.get('/weeks', handle(z.object({ weeks: z.coerce.number().int().min(1).max(260).default(12) }), ({ weeks }, req) => getWeeklySummary(db, weeks, requestI18n(req))));

  router.get(
    '/activities',
    handle(
      z.object({
        from: date.optional(),
        to: date.optional(),
        category: z.enum(CATEGORIES).optional(),
        type: z.string().max(40).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      (filters, req) => listActivities(db, filters, requestI18n(req)),
    ),
  );

  router.get('/activities/:id', handle(z.object({ id: z.coerce.number().int().positive() }), ({ id }, req) => getActivity(db, id, requestI18n(req))));

  router.get('/activities/:id/route', handle(z.object({ id: z.coerce.number().int().positive() }), ({ id }) => getRoute(db, id)));
  router.get('/map', (_req, res) => res.json(cartoKey ? { provider: 'carto', key: cartoKey } : { provider: 'osm', key: null }));
  router.get('/places', handle(z.object({}), () => getPlaces(db)));
  // The forecast may call Open-Meteo (at most hourly; cached in the database), so it needs the write connection.
  router.get('/forecast', async (_req, res) => {
    res.json(await getRunForecast(writeDb, fetch));
  });
  router.get('/activities/:id/records', handle(z.object({ id: z.coerce.number().int().positive() }), ({ id }) => getActivityRecords(db, id)));

  router.get('/daily', handle(z.object({ from: date, to: date }), (range) => getDailySeries(db, range)));

  router.get('/baselines', handle(z.object({ date }), ({ date: day }) => getBaselineBands(db, day)));

  router.get('/week', handle(z.object({ start: date }), ({ start }, req) => getWeek(db, start, requestI18n(req))));

  router.get('/best-efforts', handle(z.object({ since: date.optional() }), ({ since }, req) => getBestEfforts(db, since, requestI18n(req))));

  router.get('/trend-metrics', (_req, res) => res.json(getAvailableTrendMetrics(db)));

  router.get(
    '/trend',
    handle(
      z.object({
        metric: z.enum(Object.keys(TREND_METRICS) as [string, ...string[]]),
        period: z.enum(['week', 'month']).default('month'),
        from: date.optional(),
        to: date.optional(),
      }),
      ({ metric, period, from, to }) => getTrend(db, metric, period, from, to),
    ),
  );

  // Insights: today's signals, and the patterns in your history -----------------------------------------------
  router.get('/signals', handle(z.object({ date }), ({ date: day }, req) => getSignals(db, day, requestI18n(req))));
  router.get('/report', handle(z.object({ start: date, today: date }), ({ start, today }, req) => getWeeklyReport(db, start, today, requestI18n(req))));
  router.get('/body', handle(z.object({ date }), ({ date: day }, req) => getBodyReport(db, day, requestI18n(req))));
  router.get('/sleep', handle(z.object({ date }), ({ date: day }) => ({ sleep: getSleepReport(db, day), stress: getStressReport(db, day) })));
  router.get('/patterns', handle(z.object({ date }), ({ date: day }, req) => getPatterns(db, day, requestI18n(req))));

  router.get('/progress', handle(z.object({ date }), ({ date: day }, req) => getProgress(db, day, requestI18n(req))));
  router.get('/year', handle(z.object({ year: z.coerce.number().int().min(2000).max(2100), today: date }), ({ year, today }, req) => getYearReview(db, year, today, requestI18n(req))));
  router.get('/form', handle(z.object({ date }), ({ date: day }, req) => getFormTrend(db, day, requestI18n(req))));

  router.get('/nutrition', handle(z.object({ date }), ({ date: day }, req) => getNutrition(db, day, requestI18n(req))));
  // Meals are logged by Claude (the log_meal tool); the dashboard can only remove one.
  router.delete('/meals/:id', (req, res) => {
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: 'Invalid meal id' });
    if (!deleteMeal(writeDb, id.data)) return res.status(404).json({ error: `No meal ${id.data}.` });
    res.status(204).end();
  });

  router.get('/sync', (_req, res) => res.json({ running: isSyncRunning() }));

  router.post('/sync', async (req, res) => {
    try {
      res.json(await sync());
    } catch (error) {
      res.status(502).json({ error: requestI18n(req).m.pages.syncFailed(error instanceof Error ? error.message : String(error)) });
    }
  });

  return router;
}
