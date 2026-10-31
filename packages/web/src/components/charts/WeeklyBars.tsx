import { f, m } from '../../lib/i18n.ts';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import { shortDay } from '../../lib/dates.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

export interface WeekPoint {
  week_start: string | null;
  km: number | null;
  load: number | null;
}

/**
 * Distance per week for recent weeks, the selected week emphasised. One series, so no legend: the title names it.
 * Other weeks are drawn in the band colour so the selected one reads first.
 */
export function WeeklyBars({ weeks, selected }: { weeks: WeekPoint[]; selected: string }) {
  const colors = useThemeColors();
  return (
    <div className={styles.plot} role="img" aria-label={m.charts.described.perWeek(f.distanceUnit, weeks.length)}>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={weeks.map((w) => ({ ...w, km: f.distanceValue(w.km) }))} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={4}>
          <CartesianGrid vertical={false} stroke={colors['--rule']} />
          <XAxis dataKey="week_start" tickFormatter={(d: string) => f.dayMonth(d)} interval="preserveStartEnd" minTickGap={30} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
          <YAxis tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={(props: TooltipContentProps<TooltipValueType, string | number>) => <WeekTooltip {...props} />} cursor={{ fill: colors['--rule'], opacity: 0.4 }} />
          <Bar dataKey="km" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {weeks.map((week) => (
              <Cell key={week.week_start} fill={week.week_start === selected ? colors['--series-1'] : colors['--lane-band']} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeekTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const week = payload[0]!.payload as WeekPoint;
  return (
    <div className={styles.tooltip}>
      <strong>{m.week.weekOf(f.dayMonth(week.week_start!))}</strong>
      <span>
        {f.number(week.km ?? 0, 1)} {f.distanceUnit}
      </span>
      <span>
        {m.week.load} {f.number(week.load ?? 0)}
      </span>
    </div>
  );
}
