import { f, m } from '../../lib/i18n.ts';
import type { DailySeriesResponse } from '@companion/queries';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import { shortDay } from '../../lib/dates.ts';
import { signed } from '../../lib/insights.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

/**
 * Fitness (42-day) and fatigue (7-day) load over the last weeks. Both are the same unit (TRIMP per day),
 * so they share one axis. Form is their difference, given as a number above the chart rather than
 * a third line on a second scale.
 */
export function LoadChart({ days }: { days: DailySeriesResponse }) {
  const colors = useThemeColors();
  const last = days.at(-1);

  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        <span>
          <i style={{ background: colors['--series-1'] }} /> {m.charts.load.fitness} {f.number(last?.fitness, 1)}
        </span>
        <span>
          <i style={{ background: colors['--series-2'] }} /> {m.charts.load.fatigue} {f.number(last?.fatigue, 1)}
        </span>
      </div>
      <div className={styles.plot} role="img" aria-label={m.charts.load.label(f.number(last?.fitness, 1), f.number(last?.fatigue, 1), days.length)}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis
              dataKey="date"
              tickFormatter={(date: string) => f.dayMonth(date)}
              interval="preserveStartEnd"
              minTickGap={40}
              tick={{ fill: colors['--ink-3'], fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: colors['--rule'] }}
            />
            <YAxis tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={(props: TooltipContentProps<TooltipValueType, string | number>) => <LoadTooltip {...props} />} cursor={{ stroke: colors['--ink-3'], strokeWidth: 1 }} />
            <Line type="monotone" dataKey="fitness" name={m.charts.load.fitness} stroke={colors['--series-1']} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
            <Line type="monotone" dataKey="fatigue" name={m.charts.load.fatigue} stroke={colors['--series-2']} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function LoadTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const day = payload[0]!.payload as DailySeriesResponse[number];
  return (
    <div className={styles.tooltip}>
      <strong>{shortDay(String(label))}</strong>
      <span>
        {m.charts.load.fitness} {f.number(day.fitness, 1)}
      </span>
      <span>
        {m.charts.load.fatigue} {f.number(day.fatigue, 1)}
      </span>
      <span>
        {m.charts.load.form} {signed(day.form)}
      </span>
      {day.load ? <span>{m.charts.load.loadThatDay(f.number(day.load))}</span> : <span>{m.charts.load.restDay}</span>}
    </div>
  );
}
