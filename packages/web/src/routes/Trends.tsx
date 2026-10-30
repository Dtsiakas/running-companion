import type { TrendMetricName } from '@companion/queries';
import { useSearchParams } from 'react-router';
import { usePatterns, useTrend } from '../api/hooks.ts';
import { Patterns } from '../components/Patterns.tsx';
import { Section } from '../components/Section.tsx';
import { TrendChart, type TrendPoint } from '../components/charts/TrendChart.tsx';
import { Note } from '../components/Note.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { todayLocal, weekStartOf } from '../lib/dates.ts';
import { RANGES, TREND_GROUPS, TREND_VIEWS, type RangeKey, type TrendView } from '../lib/trends.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Trends.module.css';

/** Weekly levels are noisy (one or two runs a week can swing pace by 30 s/km), so the line is a rolling average. */
const SMOOTH_WEEKS = 4;
const DEFAULT_METRIC: TrendMetricName = 'pace_at_ref_hr';
const isMetric = (value: string | null): value is TrendMetricName => value !== null && value in TREND_VIEWS;

/**
 * Any metric over months or years. The choice lives in the address (?metric=hrv&range=2y), so the back button,
 * a bookmark or a link from elsewhere in the app returns to the same chart.
 */
export function Trends() {
  const [params, setParams] = useSearchParams();
  const metric = isMetric(params.get('metric')) ? (params.get('metric') as TrendMetricName) : DEFAULT_METRIC;
  const range = RANGES.find((r) => r.key === params.get('range')) ?? RANGES[1];
  const view = TREND_VIEWS[metric];
  const from = range.months === null ? undefined : monthsAgo(range.months);
  const trend = useTrend(metric, range.period, from);
  const patterns = usePatterns(todayLocal());

  const choose = (next: { metric?: TrendMetricName; range?: RangeKey }) =>
    setParams({ metric: next.metric ?? metric, range: next.range ?? range.key }, { replace: true });

  const smoothing = view.kind === 'level' && range.period === 'week' ? SMOOTH_WEEKS : 0;
  const points = trend.data ? smooth(toPoints(trend.data.points, view, range.period), smoothing) : [];

  return (
    <div className={blocks.page}>
      <h1 className={blocks.title}>Trends</h1>

      <div className={styles.controls}>
        <label className={styles.metric}>
          <span>Metric</span>
          <select value={metric} onChange={(event) => choose({ metric: event.target.value as TrendMetricName })}>
            {TREND_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {(Object.entries(TREND_VIEWS) as Array<[TrendMetricName, TrendView]>)
                  .filter(([, v]) => v.group === group)
                  .map(([key, v]) => (
                    <option key={key} value={key}>
                      {v.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className={styles.ranges} role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" aria-pressed={r.key === range.key} onClick={() => choose({ range: r.key })}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {trend.isPending ? (
        <Loading />
      ) : trend.isError ? (
        <ErrorState error={trend.error} retry={() => void trend.refetch()} />
      ) : points.every((p) => p.value === null) ? (
        <p className={blocks.empty}>No data for {view.label.toLowerCase()} in this range.</p>
      ) : (
        <section className={styles.result} data-stale={trend.isPlaceholderData || undefined}>
          <Headline points={points} view={view} period={range.period} />
          <TrendChart points={points} view={view} smoothingLabel={`${SMOOTH_WEEKS}-week average`} />
          <Note>{view.note}</Note>
        </section>
      )}

      <Section title="What works for you">
        {patterns.isPending ? <Loading label="Looking for patterns" /> : patterns.isError ? <ErrorState error={patterns.error} /> : <Patterns patterns={patterns.data} />}
      </Section>
    </div>
  );
}

/** Totals: the average per finished period, and the current one so far. Levels: the latest value and the change across the range. */
function Headline({ points, view, period }: { points: TrendPoint[]; view: TrendView; period: 'week' | 'month' }) {
  const withData = points.filter((p): p is TrendPoint & { value: number } => p.value !== null);
  const unit = period === 'week' ? 'week' : 'month';

  if (view.kind === 'total') {
    const finished = withData.filter((p) => !p.partial);
    const average = finished.length ? finished.reduce((sum, p) => sum + p.value, 0) / finished.length : null;
    const current = points.find((p) => p.partial);
    return (
      <dl className={blocks.stats}>
        <div>
          <dt>Average per {unit}</dt>
          <dd>{average === null ? '–' : view.format(average)}</dd>
        </div>
        <div>
          <dt>This {unit} so far</dt>
          <dd>{current?.value === null || current === undefined ? '–' : view.format(current.value)}</dd>
        </div>
      </dl>
    );
  }

  // With smoothing, compare averages: the change then reflects the direction, not one unusual week at either end.
  const series = points
    .map((p) => ({ ...p, value: p.smoothed !== undefined ? p.smoothed : p.value }))
    .filter((p): p is TrendPoint & { value: number } => p.value !== null);
  const averaged = points.some((p) => p.smoothed !== undefined);
  // The first few averages cover fewer than 4 weeks; start the comparison at the first full one.
  const first = series[averaged ? Math.min(SMOOTH_WEEKS - 1, series.length - 1) : 0];
  const last = series.at(-1);
  return (
    <dl className={blocks.stats}>
      <div>
        <dt>
          {averaged ? `${SMOOTH_WEEKS}-week average, to the ${last?.title.replace(/^Week/, 'week')}` : `Latest, ${last?.title}`}
        </dt>
        <dd>{last ? view.format(last.value) : '–'}</dd>
        {first && last && first !== last ? <dd className={blocks.change}>{change(first, last, view)}</dd> : null}
      </div>
    </dl>
  );
}

/** "−9 s/km since May 2025" for pace (faster is the useful word), "+4.1 ms since …" otherwise. */
function change(first: TrendPoint & { value: number }, last: TrendPoint & { value: number }, view: TrendView): string {
  const diff = last.value - first.value;
  const since = `since ${first.title.replace(/^Week of /, '')}`;
  if (view.toChart) {
    const seconds = Math.round(Math.abs(diff));
    return seconds === 0 ? `Unchanged ${since}` : `${seconds} s/km ${diff < 0 ? 'faster' : 'slower'} ${since}`;
  }
  const text = view.format(Math.abs(diff));
  if (!/[1-9]/.test(text)) return `Unchanged ${since}`;
  return `${diff > 0 ? '+' : '−'}${text} ${since}`;
}

function toPoints(raw: Array<{ period: string | null; raw: number | null }>, view: TrendView, period: 'week' | 'month'): TrendPoint[] {
  const today = todayLocal();
  const current = period === 'week' ? weekStartOf(today) : today.slice(0, 7);
  return raw
    .filter((p): p is { period: string; raw: number | null } => p.period !== null)
    .map((p) => {
      const date = new Date(`${period === 'week' ? p.period : `${p.period}-01`}T12:00:00`);
      return {
        period: p.period,
        label: date.toLocaleDateString('en-GB', period === 'week' ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' }),
        title: period === 'week' ? `Week of ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        value: p.raw === null ? null : view.toChart ? view.toChart(p.raw) : p.raw,
        partial: p.period === current,
      };
    });
}

function monthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Trailing average of up to `window` periods (missing periods skipped). A window of 0 leaves the points as they are. */
function smooth(points: TrendPoint[], window: number): TrendPoint[] {
  if (!window) return points;
  return points.map((point, i) => {
    const values = points.slice(Math.max(0, i - window + 1), i + 1).flatMap((p) => (p.value === null ? [] : [p.value]));
    return { ...point, smoothed: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  });
}
