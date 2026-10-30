import { f, m } from '../../lib/i18n.ts';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import { shortDay } from '../../lib/dates.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

interface Point {
  date: string;
  trend: number | null;
  weighIn: number | null;
}

/**
 * Weight over six months: the smoothed trend as the line (what's really happening), each weigh-in as a faint dot
 * (how much single readings jump around), and the goal as a dashed line.
 */
export function WeightChart({ series, weighIns, goal }: { series: Array<{ date: string; trend_kg: number | null }>; weighIns: Array<{ date: string; kg: number }>; goal: number | null }) {
  const colors = useThemeColors();
  const lastWeighIn = new Map(weighIns.map((w) => [w.date, f.weightValue(w.kg)]));
  const data: Point[] = series.map((p) => ({ date: p.date, trend: f.weightValue(p.trend_kg), weighIn: lastWeighIn.get(p.date) ?? null }));
  const goalValue = f.weightValue(goal);
  const values = data.flatMap((p) => [p.trend, p.weighIn]).filter((v): v is number => v !== null);
  if (goalValue !== null) values.push(goalValue);
  const domain: [number, number] = [Math.floor(Math.min(...values) - 0.5), Math.ceil(Math.max(...values) + 0.5)];

  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        <span>
          <i style={{ background: colors['--series-1'], height: 3 }} /> {m.body.chart.trend}
        </span>
        <span>
          <i style={{ background: colors['--ink-3'], width: 6, height: 6, borderRadius: '50%' }} /> {m.body.chart.weighIns}
        </span>
        {goal !== null ? (
          <span>
            <i style={{ background: 'none', borderTop: `2px dashed ${colors['--ink-2']}`, height: 0 }} /> {m.body.chart.goal(f.weight(goal))}
          </span>
        ) : null}
      </div>
      <div className={styles.plot} role="img" aria-label={m.body.chart.label(goal !== null ? f.weight(goal) : null)}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis dataKey="date" tickFormatter={(d: string) => f.dayMonth(d)} interval="preserveStartEnd" minTickGap={40} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
            <YAxis domain={domain} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
            {goalValue !== null ? <ReferenceLine y={goalValue} stroke={colors['--ink-2']} strokeDasharray="5 4" /> : null}
            <Tooltip content={(props: TooltipContentProps<TooltipValueType, string | number>) => <WeightTooltip {...props} />} cursor={{ stroke: colors['--ink-3'], strokeWidth: 1 }} />
            <Line dataKey="weighIn" stroke="none" dot={{ r: 2, fill: colors['--ink-3'], strokeWidth: 0 }} activeDot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="trend" stroke={colors['--series-1']} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function WeightTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as Point;
  return (
    <div className={styles.tooltip}>
      <strong>{shortDay(point.date)}</strong>
      {point.trend !== null ? <span>{m.body.chart.trendAt(`${f.number(point.trend, 1)} ${f.weightUnit}`)}</span> : null}
      {point.weighIn !== null ? <span>{m.body.chart.weighed(`${f.number(point.weighIn, 1)} ${f.weightUnit}`)}</span> : null}
    </div>
  );
}
