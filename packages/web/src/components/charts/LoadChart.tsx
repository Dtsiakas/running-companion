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
          <i style={{ background: colors['--series-1'] }} /> Fitness {last?.fitness ?? '–'}
        </span>
        <span>
          <i style={{ background: colors['--series-2'] }} /> Fatigue {last?.fatigue ?? '–'}
        </span>
      </div>
      <div className={styles.plot} role="img" aria-label={`Fitness ${last?.fitness} and fatigue ${last?.fatigue} over the last ${days.length} days`}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis
              dataKey="date"
              tickFormatter={(date: string) => shortDay(date).replace(/^\w+ /, '')}
              interval="preserveStartEnd"
              minTickGap={40}
              tick={{ fill: colors['--ink-3'], fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: colors['--rule'] }}
            />
            <YAxis tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={(props: TooltipContentProps<TooltipValueType, string | number>) => <LoadTooltip {...props} />} cursor={{ stroke: colors['--ink-3'], strokeWidth: 1 }} />
            <Line type="monotone" dataKey="fitness" name="Fitness" stroke={colors['--series-1']} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
            <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={colors['--series-2']} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
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
      <span>Fitness {day.fitness}</span>
      <span>Fatigue {day.fatigue}</span>
      <span>Form {signed(day.form)}</span>
      {day.load ? <span>Load that day {day.load}</span> : <span>Rest day</span>}
    </div>
  );
}
