import type { FormSeries, YearReview } from '@companion/insights';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import { shortDay } from '../../lib/dates.ts';
import { clock } from '../../lib/format.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

type TooltipProps = TooltipContentProps<TooltipValueType, string | number>;
const monthTick = (month: string) => `${new Date(`${month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })} ’${month.slice(2, 4)}`;

/**
 * One running-form measure by month, at your reference pace. Small multiples share one layout so they read as a set;
 * each has its own scale because the units differ, and the title says which way is more economical.
 */
export function FormChart({ series }: { series: FormSeries }) {
  const colors = useThemeColors();
  const values = series.points.map((p) => p.value).filter((v): v is number => v !== null);
  const spread = Math.max(...values) - Math.min(...values);
  const pad = spread * 0.15 || 1;
  const digits = series.unit === 'm' ? 2 : series.unit === '%' || series.unit === 'cm' ? 1 : 0;
  return (
    <div className={styles.plot} role="img" aria-label={`${series.label} by month at the same pace, ${series.points.length} months`}>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={series.points} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={colors['--rule']} />
          <XAxis dataKey="month" tickFormatter={monthTick} interval="preserveStartEnd" minTickGap={40} tick={{ fill: colors['--ink-3'], fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
          <YAxis domain={[Math.min(...values) - pad, Math.max(...values) + pad]} tickFormatter={(v: number) => v.toFixed(digits)} tick={{ fill: colors['--ink-3'], fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickCount={3} />
          <Tooltip content={(props: TooltipProps) => <FormTooltip {...props} unit={series.unit} digits={digits} />} cursor={{ stroke: colors['--ink-3'], strokeWidth: 1 }} />
          <Line type="monotone" dataKey="value" connectNulls={false} stroke={colors['--series-1']} strokeWidth={2} dot={{ r: 2.5, fill: colors['--series-1'], strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FormTooltip({ active, payload, unit, digits }: TooltipProps & { unit: string; digits: number }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload as FormSeries['points'][number];
  if (point.value === null) return null;
  return (
    <div className={styles.tooltip}>
      <strong>{monthTick(point.month)}</strong>
      <span>
        {point.value.toFixed(digits)} {unit}
      </span>
      <span>{point.runs} easy runs</span>
    </div>
  );
}

/** Kilometres per month of the year; months still to come stay empty rather than showing as zero runs. */
export function YearMonths({ review }: { review: YearReview }) {
  const colors = useThemeColors();
  const data = review.months.map((m) => ({ ...m, km: m.month > review.through.slice(0, 7) ? null : m.km }));
  return (
    <div className={styles.plot} role="img" aria-label={`Kilometres per month in ${review.year}`}>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={4}>
          <CartesianGrid vertical={false} stroke={colors['--rule']} />
          <XAxis dataKey="month" tickFormatter={(m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'narrow' })} interval={0} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
          <YAxis tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={(props: TooltipProps) => <MonthTooltip {...props} />} cursor={{ fill: colors['--rule'], opacity: 0.4 }} />
          <Bar dataKey="km" fill={colors['--series-1']} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MonthTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const m = payload[0]!.payload as YearReview['months'][number];
  return (
    <div className={styles.tooltip}>
      <strong>{new Date(`${m.month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long' })}</strong>
      <span>
        {m.km} km, {m.runs} run{m.runs === 1 ? '' : 's'}
      </span>
    </div>
  );
}
