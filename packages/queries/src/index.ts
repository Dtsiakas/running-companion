/**
 * Read-only queries shared by every way of looking at the data: the dashboard API (/api) and the MCP tools (/mcp).
 * One implementation means the dashboard and Claude always report the same numbers.
 */
import type { getActivity, getBestEfforts, getToday, getTrend, getWeeklySummary, listActivities } from './queries.ts';
import type { getActivityRecords, getBaselineBands, getDailySeries, getWeek } from './series.ts';
import type { getPlaces, getRoute } from './routes.ts';

export * from './format.ts';
export * from './queries.ts';
export * from './routes.ts';
export * from './series.ts';
export * from './wellness.ts';

// Response types for the dashboard, derived from the functions themselves: no hand-written copies to drift.
// The web app imports these with `import type`, which is erased at build time, so no server code reaches the browser.
type Ok<T> = Exclude<T, { error: string }>;
export type TodayResponse = Ok<ReturnType<typeof getToday>>;
export type WeeklySummaryResponse = ReturnType<typeof getWeeklySummary>;
export type ActivityListResponse = ReturnType<typeof listActivities>;
export type ActivityResponse = Ok<ReturnType<typeof getActivity>>;
export type BestEffortsResponse = ReturnType<typeof getBestEfforts>;
export type TrendResponse = Ok<ReturnType<typeof getTrend>>;
export type DailySeriesResponse = ReturnType<typeof getDailySeries>;
export type BaselineBandsResponse = ReturnType<typeof getBaselineBands>;
export type WeekResponse = ReturnType<typeof getWeek>;
export type RouteResponse = ReturnType<typeof getRoute>;
export type PlacesResponse = ReturnType<typeof getPlaces>;
export type ActivityRecordsResponse = ReturnType<typeof getActivityRecords>;
