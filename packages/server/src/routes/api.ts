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
import { getBodyReport, getFormTrend, getPatterns, getProgress, getSignals, getSleepReport, getStressReport, getWeeklyReport, getYearReview } from '@companion/insights';
import { getRunForecast } from '@companion/weather';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

export interface ApiRouteOptions {
  db: DatabaseSync;
  /** Only for caching the weather forecast: everything else the dashboard does is reading. */
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
export function apiRoutes({ db, writeDb, sync, isSyncRunning, cartoKey = null }: ApiRouteOptions): Router {
  const router = Router();

  const handle = <T extends z.ZodType>(schema: T, run: (input: z.infer<T>, req: Request) => unknown) => (req: Request, res: Response) => {
    const parsed = schema.safeParse({ ...req.query, ...req.params });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid parameters', issues: z.flattenError(parsed.error).fieldErrors });
    res.json(run(parsed.data, req));
  };

  router.get('/session', (_req, res) => res.json({ loggedIn: true }));

  router.get('/today', handle(z.object({ date: date.optional() }), ({ date: day }) => getToday(db, day)));

  router.get('/weeks', handle(z.object({ weeks: z.coerce.number().int().min(1).max(260).default(12) }), ({ weeks }) => getWeeklySummary(db, weeks)));

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
      (filters) => listActivities(db, filters),
    ),
  );

  router.get('/activities/:id', handle(z.object({ id: z.coerce.number().int().positive() }), ({ id }) => getActivity(db, id)));

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

  router.get('/week', handle(z.object({ start: date }), ({ start }) => getWeek(db, start)));

  router.get('/best-efforts', handle(z.object({ since: date.optional() }), ({ since }) => getBestEfforts(db, since)));

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
  router.get('/signals', handle(z.object({ date }), ({ date: day }) => getSignals(db, day)));
  router.get('/report', handle(z.object({ start: date, today: date }), ({ start, today }) => getWeeklyReport(db, start, today)));
  router.get('/body', handle(z.object({ date }), ({ date: day }) => getBodyReport(db, day)));
  router.get('/sleep', handle(z.object({ date }), ({ date: day }) => ({ sleep: getSleepReport(db, day), stress: getStressReport(db, day) })));
  router.get('/patterns', handle(z.object({ date }), ({ date: day }) => getPatterns(db, day)));

  router.get('/progress', handle(z.object({ date }), ({ date: day }) => getProgress(db, day)));
  router.get('/year', handle(z.object({ year: z.coerce.number().int().min(2000).max(2100), today: date }), ({ year, today }) => getYearReview(db, year, today)));
  router.get('/form', handle(z.object({ date }), ({ date: day }) => getFormTrend(db, day)));

  router.get('/sync', (_req, res) => res.json({ running: isSyncRunning() }));

  router.post('/sync', async (_req, res) => {
    try {
      res.json(await sync());
    } catch (error) {
      res.status(502).json({ error: `Sync failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  return router;
}
