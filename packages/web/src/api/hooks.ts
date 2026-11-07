import type {
  ActivityListResponse,
  ActivityRecordsResponse,
  ActivityResponse,
  BaselineBandsResponse,
  DailySeriesResponse,
  PlacesResponse,
  RouteResponse,
  TodayResponse,
  TrendMetricName,
  TrendResponse,
  WeekResponse,
} from '@companion/queries';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyReport, FormTrend, Pattern, Progress, Signal, SleepReport, StressReport, WeeklyReport, YearReview } from '@companion/insights';
import type { RunForecast } from '@companion/weather';
import { todayLocal } from '../lib/dates.ts';
import { api } from './client.ts';

/*
 * One hook per endpoint. The response types come from the server's query functions (type-only imports,
 * erased at build time), so a change in what the server returns fails the build here instead of breaking a screen.
 *
 * Query keys name the data, so screens that need the same data share one request and one cache entry.
 */

export function useToday() {
  return useQuery({ queryKey: ['today'], queryFn: () => api<TodayResponse>('/api/today') });
}

/** Waits until both dates are known (they usually come from the Today response). */
export function useDaily(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: ['daily', from, to],
    queryFn: () => api<DailySeriesResponse>(`/api/daily?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });
}

export function useBaselines(date: string | undefined) {
  return useQuery({
    queryKey: ['baselines', date],
    queryFn: () => api<BaselineBandsResponse>(`/api/baselines?date=${date}`),
    enabled: !!date,
  });
}

export function useWeek(start: string) {
  return useQuery({ queryKey: ['week', start], queryFn: () => api<WeekResponse>(`/api/week?start=${start}`) });
}

export const RUNS_PAGE = 40;

/** Runs only (road, trail, track, treadmill), newest first, one page at a time. */
export function useRunList() {
  return useInfiniteQuery({
    queryKey: ['runs'],
    queryFn: ({ pageParam }) => api<ActivityListResponse>(`/api/activities?type=running&limit=${RUNS_PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    // A short page means there is nothing older.
    getNextPageParam: (last, pages) => (last.length < RUNS_PAGE ? undefined : pages.length * RUNS_PAGE),
  });
}

export function useActivity(id: string | undefined) {
  return useQuery({ queryKey: ['activity', id], queryFn: () => api<ActivityResponse>(`/api/activities/${id}`), enabled: !!id });
}

export function useActivityRecords(id: string | undefined) {
  return useQuery({ queryKey: ['activity-records', id], queryFn: () => api<ActivityRecordsResponse>(`/api/activities/${id}/records`), enabled: !!id });
}

/** Which trend metrics have any data (changes only when a new kind of data arrives). */
export function useAvailableTrendMetrics() {
  return useQuery({ queryKey: ['trend-metrics'], queryFn: () => api<TrendMetricName[]>('/api/trend-metrics'), staleTime: 60 * 60_000 });
}

export function useTrend(metric: TrendMetricName, period: 'week' | 'month', from: string | undefined) {
  const search = new URLSearchParams({ metric, period, ...(from ? { from } : {}) });
  return useQuery({
    queryKey: ['trend', metric, period, from],
    queryFn: () => api<TrendResponse>(`/api/trend?${search}`),
    // Switching metric keeps the old chart on screen until the new one arrives, instead of flashing "Loading".
    placeholderData: keepPreviousData,
  });
}

/** Pulls new data from Garmin, then refreshes everything on screen. */
export function useSync() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>('/api/sync', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries(),
  });
}

// Insights -----------------------------------------------------------------------------------------------------------

export function useSignals(date: string | undefined) {
  return useQuery({ queryKey: ['signals', date], queryFn: () => api<Signal[]>(`/api/signals?date=${date}`), enabled: !!date });
}

/** Patterns change at most once a day; no need to refetch them on every visit. */
export function usePatterns(date: string | undefined) {
  return useQuery({ queryKey: ['patterns', date], queryFn: () => api<Pattern[]>(`/api/patterns?date=${date}`), enabled: !!date, staleTime: 60 * 60_000 });
}

export function useWeeklyReport(start: string) {
  const today = todayLocal();
  return useQuery({ queryKey: ['report', start, today], queryFn: () => api<WeeklyReport | null>(`/api/report?start=${start}&today=${today}`) });
}

export function useBody(date: string) {
  return useQuery({ queryKey: ['body', date], queryFn: () => api<BodyReport>(`/api/body?date=${date}`) });
}

export function useSleep(date: string) {
  return useQuery({ queryKey: ['sleep', date], queryFn: () => api<{ sleep: SleepReport; stress: StressReport }>(`/api/sleep?date=${date}`) });
}

export function useRoute(id: string | undefined) {
  return useQuery({ queryKey: ['route', id], queryFn: () => api<RouteResponse>(`/api/activities/${id}/route`), enabled: !!id, staleTime: Infinity });
}

export function usePlaces() {
  return useQuery({ queryKey: ['places'], queryFn: () => api<PlacesResponse>('/api/places'), staleTime: 60 * 60_000 });
}

/** The server caches the forecast for an hour; asking more often just returns the cached copy. */
export function useForecast() {
  return useQuery({ queryKey: ['forecast'], queryFn: () => api<RunForecast | null>('/api/forecast'), staleTime: 30 * 60_000 });
}

// Progress --------------------------------------------------------------------------------------------------

export function useProgress() {
  const today = todayLocal();
  return useQuery({ queryKey: ['progress', today], queryFn: () => api<Progress>(`/api/progress?date=${today}`) });
}

export function useYearReview(year: number) {
  const today = todayLocal();
  return useQuery({ queryKey: ['year', year, today], queryFn: () => api<YearReview | null>(`/api/year?year=${year}&today=${today}`), placeholderData: keepPreviousData });
}

export function useFormTrend() {
  const today = todayLocal();
  return useQuery({ queryKey: ['form', today], queryFn: () => api<FormTrend | null>(`/api/form?date=${today}`), staleTime: 60 * 60_000 });
}

/** Which map tiles to use (set on the server); fetched once per session. */
export function useMapConfig() {
  return useQuery({ queryKey: ['map-config'], queryFn: () => api<{ provider: 'carto' | 'osm'; key: string | null }>('/api/map'), staleTime: Infinity });
}

// Settings --------------------------------------------------------------------------------------------------

/** Mirrors the server's /api/settings answer (packages/server/src/routes/settings.ts). The key itself never comes back. */
export interface SettingsResponse {
  /** Generated data (npm run demo): nothing to sync, nothing to change. */
  demo: boolean;
  garmin: {
    state: 'missing' | 'rejected' | 'expired' | 'expiring' | 'ok';
    source: 'settings' | 'environment' | 'file' | null;
    addedOn: string | null;
    expiresOn: string | null;
    daysLeft: number | null;
    rejectedAt: string | null;
  };
  locked: { password: boolean; garminKey: boolean };
  /** Null in demo mode. */
  claude: { connected: boolean; lastActive: string | null; connectorUrl: string | null } | null;
  backups: { latest: string | null; automatic: number; byHand: number; keep: number } | null;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsResponse>('/api/settings') });
}

/** Signs Claude out of the connector. */
export function useDisconnectClaude() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<SettingsResponse>('/api/settings/claude', { method: 'DELETE' }),
    onSuccess: (settings) => client.setQueryData(['settings'], settings),
  });
}

/** PUTs one setting; the answer is the new settings, which replaces the cached copy. */
export function useSaveSetting<T>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api<SettingsResponse>(`/api/settings${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    onSuccess: (settings) => client.setQueryData(['settings'], settings),
  });
}
