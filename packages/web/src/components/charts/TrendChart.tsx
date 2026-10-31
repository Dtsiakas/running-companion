import { m } from '../../lib/i18n.ts';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import type { TrendView } from '../../lib/trends.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

export interface TrendPoint {
  period: string;
  /** Short, for axis ticks: "26 Oct", "Oct 25". */
  label: string;
  /** Full, for the tooltip: "Week of 26 Oct 2026", "October 2025". */
  title: string;
  value: number | null;
  /** Rolling average over the last few periods, for weekly levels; the line follows it and the dots show `value`. */
  smoothed?: number | null;
  /** The current period, still filling up. */
  partial: boolean;
}

/** One metric over time: bars for totals, a line for levels. One series, so the page title names it and there is no legend. */
export function TrendChart({ points, view, smoothingLabel }: { points: TrendPoint[]; view: TrendView; smoothingLabel?: string }) {
  const colors = useThemeColors();
  const smoothed = points.some((p) => p.smoothed !== undefined);
  const axisTick = { fill: colors['--ink-3'], fontSize: 12 };
  const tooltip = (
    <Tooltip
      content={(props: TooltipContentProps<TooltipValueType, string | number>) => <TrendTooltip {...props} view={view} />}
      cursor={view.kind === 'total' ? { fill: colors['--rule'], opacity: 0.4 } : { stroke: colors['--ink-3'], strokeWidth: 1 }}
    />
  );
  const xAxis = <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={36} tick={axisTick} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />;
  const yAxis = (
    <YAxis
      domain={view.kind === 'total' ? [0, 'auto'] : ['auto', 'auto']}
      reversed={view.reversed}
      tickFormatter={(v: number) => view.format(v).replace(/ .*$/, '').replace('/km', '')}
      tick={axisTick}
      tickLine={false}
      axisLine={false}
      width={52}
    />
  );

  return (
    <figure className={styles.figure}>
      {smoothed ? (
        <div className={styles.legend}>
          <span>
            <i className={styles.keyLine} /> {smoothingLabel}
          </span>
          <span>
            <i className={styles.keyDot} /> {m.trends.chart.eachWeek}
          </span>
        </div>
      ) : null}
      <div className={styles.plot} role="img" aria-label={m.charts.described.trend(view.label, points.length)}>
        <ResponsiveContainer width="100%" height={240}>
          {view.kind === 'total' ? (
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={colors['--rule']} />
              {xAxis}
              {yAxis}
              {tooltip}
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {points.map((point) => (
                  <Cell key={point.period} fill={point.partial ? colors['--lane-band'] : colors['--series-1']} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={colors['--rule']} />
              {xAxis}
              {yAxis}
              {tooltip}
              {smoothed ? (
                <>
                  {/* Each period's own value: context behind the line, not the line itself. */}
                  <Line dataKey="value" stroke="none" dot={{ r: 2.5, fill: colors['--ink-3'], strokeWidth: 0 }} activeDot={false} isAnimationActive={false} />
                  <Line
                    type="monotone"
                    dataKey="smoothed"
                    stroke={colors['--series-1']}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: colors['--surface'] }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={colors['--series-1']}
                  strokeWidth={2}
                  dot={points.length <= 30 ? { r: 3, fill: colors['--series-1'], strokeWidth: 0 } : false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: colors['--surface'] }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function TrendTooltip({ active, payload, view }: TooltipContentProps<TooltipValueType, string | number> & { view: TrendView }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as TrendPoint;
  return (
    <div className={styles.tooltip}>
      <strong>{point.title}</strong>
      <span>
        {point.value === null ? m.trends.chart.noData : view.format(point.value)}
        {point.partial ? ' so far' : ''}
      </span>
      {point.smoothed !== undefined && point.smoothed !== null ? <span>{m.trends.chart.average(view.format(point.smoothed))}</span> : null}
    </div>
  );
}
