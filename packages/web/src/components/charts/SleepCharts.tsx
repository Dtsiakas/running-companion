import type { BatteryDay, Night } from '@companion/insights';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts';
import { shortDay } from '../../lib/dates.ts';
import { hoursText, minutesFromClock } from '../../lib/sleep.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

type TooltipProps = TooltipContentProps<TooltipValueType, string | number>;
const dayTick = (d: string) => shortDay(d).replace(/^\w+ /, '');
const clockTick = (m: number) => {
  const v = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:00`;
};

/**
 * Four weeks of nights as bars from falling asleep to waking, time running down the page like a diary.
 * Weekend nights (free mornings) are drawn in the second colour; the dashed line is tonight's target.
 */
export function SleepDiary({ nights, target }: { nights: Night[]; target: string | null }) {
  const colors = useThemeColors();
  const data = nights.map((night) => ({ ...night, range: [night.bed_min, night.wake_min] as [number, number] }));
  const targetMin = target ? minutesFromClock(target) : null;
  const low = Math.floor(Math.min(...nights.map((x) => x.bed_min), targetMin ?? Infinity) / 120) * 120;
  const high = Math.ceil(Math.max(...nights.map((x) => x.wake_min)) / 120) * 120;
  const ticks = Array.from({ length: (high - low) / 120 + 1 }, (_, i) => low + i * 120);

  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        <span>
          <i style={{ background: colors['--series-1'] }} /> Weeknight
        </span>
        <span>
          <i style={{ background: colors['--series-2'] }} /> Weekend night
        </span>
        {target ? (
          <span>
            <i style={{ background: 'none', borderTop: `2px dashed ${colors['--ink-2']}`, height: 0 }} /> Asleep by {target} for Garmin’s need
          </span>
        ) : null}
      </div>
      <div className={styles.plot} role="img" aria-label={`Sleep times for the last ${nights.length} nights`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis dataKey="date" tickFormatter={dayTick} interval="preserveStartEnd" minTickGap={30} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
            <YAxis reversed domain={[low, high]} ticks={ticks} tickFormatter={clockTick} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            {targetMin !== null ? <ReferenceLine y={targetMin} stroke={colors['--ink-2']} strokeDasharray="5 4" /> : null}
            <Tooltip content={(props: TooltipProps) => <NightTooltip {...props} />} cursor={{ fill: colors['--rule'], opacity: 0.4 }} />
            <Bar dataKey="range" radius={4} isAnimationActive={false}>
              {data.map((night) => (
                <Cell key={night.date} fill={night.weekend ? colors['--series-2'] : colors['--series-1']} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function NightTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const night = payload[0]!.payload as Night;
  return (
    <div className={styles.tooltip}>
      <strong>Night to {shortDay(night.date)}</strong>
      <span>
        {night.bed} to {night.wake}
      </span>
      <span>
        {hoursText(night.hours)} asleep{night.need_h ? `, needed ${hoursText(night.need_h)}` : ''}
      </span>
      {night.score !== null ? <span>Score {night.score}</span> : null}
    </div>
  );
}

/** The last two weeks: hours asleep as bars, Garmin's need for each night as the line. */
export function SleepVsNeed({ nights }: { nights: Night[] }) {
  const colors = useThemeColors();
  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        <span>
          <i style={{ background: colors['--series-1'] }} /> Asleep
        </span>
        <span>
          <i style={{ background: colors['--ink-2'], height: 2 }} /> Garmin’s need
        </span>
      </div>
      <div className={styles.plot} role="img" aria-label={`Hours asleep against sleep need, last ${nights.length} nights`}>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={nights} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap={3}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis dataKey="date" tickFormatter={dayTick} interval="preserveStartEnd" minTickGap={30} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} unit="h" />
            <Tooltip content={(props: TooltipProps) => <NightTooltip {...props} />} cursor={{ fill: colors['--rule'], opacity: 0.4 }} />
            <Bar dataKey="hours" fill={colors['--series-1']} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="need_h" stroke={colors['--ink-2']} strokeWidth={2} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Each day's charge above the line and drain below it; a day is in the red when the lower bar is the longer one. */
export function BatteryBalance({ days }: { days: BatteryDay[] }) {
  const colors = useThemeColors();
  const data = days.map((d) => ({ ...d, minus: d.drained === null ? null : -d.drained }));
  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        <span>
          <i style={{ background: colors['--series-1'] }} /> Charged
        </span>
        <span>
          <i style={{ background: colors['--series-2'] }} /> Drained
        </span>
      </div>
      <div className={styles.plot} role="img" aria-label={`Body Battery charged and drained per day, last ${days.length} days`}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} stackOffset="sign" barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis dataKey="date" tickFormatter={dayTick} interval="preserveStartEnd" minTickGap={30} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(v: number) => String(Math.abs(v))} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={0} stroke={colors['--ink-3']} />
            <Tooltip content={(props: TooltipProps) => <BatteryTooltip {...props} />} cursor={{ fill: colors['--rule'], opacity: 0.4 }} />
            <Bar dataKey="charged" stackId="b" fill={colors['--series-1']} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="minus" stackId="b" fill={colors['--series-2']} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function BatteryTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const day = payload[0]!.payload as BatteryDay;
  const net = day.charged !== null && day.drained !== null ? day.charged - day.drained : null;
  return (
    <div className={styles.tooltip}>
      <strong>{shortDay(day.date)}</strong>
      <span>Charged {day.charged ?? '–'}, drained {day.drained ?? '–'}</span>
      {net !== null ? <span>Net {net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net)}</span> : null}
      {day.morning !== null ? <span>Morning level {day.morning}</span> : null}
    </div>
  );
}
