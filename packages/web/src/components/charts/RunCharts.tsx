import { f, m } from '../../lib/i18n.ts';
import type { ActivityRecordsResponse } from '@companion/queries';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clock } from '../../lib/format.ts';
import { useThemeColors } from '../../lib/useThemeColors.ts';
import styles from './charts.module.css';

type Point = ActivityRecordsResponse[number];
interface Row extends Point {
  x: number;
  pace_s: number | null;
}

interface Panel {
  key: 'pace_s' | 'hr' | 'power_w' | 'altitude_m';
  title: string;
  format: (value: number) => string;
  color: string;
  reversed?: boolean;
  area?: boolean;
}

const SYNC = 'run';

/**
 * A run over its distance as small multiples: one chart per measure, each on its own scale, sharing the x axis.
 * Touching any chart moves one cursor through all of them, and the readout above shows every value at that point.
 * Pace is drawn with faster at the top (axis reversed) so "up" means "working harder" in every panel.
 */
export function RunCharts({ records }: { records: ActivityRecordsResponse }) {
  const colors = useThemeColors();
  const [active, setActive] = useState<number | null>(null);

  const { rows, byDistance } = useMemo(() => {
    const byDistance = records.some((p) => p.distance_km !== null && p.distance_km > 0);
    const rows: Row[] = records.map((p) => ({
      ...p,
      x: byDistance ? (p.distance_km ?? 0) : p.t_s / 60,
      // Below 1.5 m/s is standing or walking: a gap in the line, not a 20-minute "pace".
      pace_s: p.speed_mps && p.speed_mps >= 1.5 ? f.paceSeconds(p.speed_mps) : null,
    }));
    return { rows, byDistance };
  }, [records]);

  const panels: Panel[] = [
    { key: 'pace_s' as const, title: m.charts.run.pace, format: (v: number) => `${clock(v)}${f.paceUnit}`, color: colors['--series-1'], reversed: true },
    { key: 'hr' as const, title: m.charts.run.heartRate, format: (v: number) => `${Math.round(v)} bpm`, color: colors['--series-2'] },
    { key: 'power_w' as const, title: m.charts.run.power, format: (v: number) => `${Math.round(v)} W`, color: colors['--series-1'] },
    { key: 'altitude_m' as const, title: m.charts.run.elevation, format: (v: number) => f.elevation(v), color: colors['--lane-band'], area: true },
  ].filter((panel) => rows.some((row) => row[panel.key] !== null));

  if (rows.length < 2) return <p className={styles.muted}>{m.charts.run.noRecords}</p>;

  const point = active === null ? null : rows[active];
  const xLabel = (x: number) => (byDistance ? f.distance(x, 1) : m.charts.run.minutes(Math.round(x)));

  return (
    <figure className={styles.figure}>
      <p className={styles.readout} aria-live="off">
        {point ? (
          <>
            <strong>{xLabel(point.x)}</strong>
            {panels.map((panel) => (
              <span key={panel.key}>
                {panel.title} {point[panel.key] === null ? '–' : panel.format(point[panel.key]!)}
              </span>
            ))}
          </>
        ) : (
          <span className={styles.muted}>{m.charts.run.hint}</span>
        )}
      </p>
      {panels.map((panel, i) => {
        const last = i === panels.length - 1;
        const domain = robustDomain(rows.map((row) => row[panel.key]));
        const common = {
          data: rows,
          syncId: SYNC,
          margin: { top: 8, right: 8, bottom: last ? 0 : 8, left: -8 },
          onMouseMove: (state: { activeTooltipIndex?: number | string | null }) => setActive(state.activeTooltipIndex === undefined || state.activeTooltipIndex === null ? null : Number(state.activeTooltipIndex)),
          onMouseLeave: () => setActive(null),
        };
        const axes = (
          <>
            <CartesianGrid vertical={false} stroke={colors['--rule']} />
            <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} hide={!last} tickFormatter={(x: number) => xLabel(x)} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors['--rule'] }} minTickGap={32} />
            <YAxis domain={domain} allowDataOverflow reversed={panel.reversed} tickFormatter={(v: number) => (panel.key === 'pace_s' ? clock(v) : String(Math.round(v)))} tick={{ fill: colors['--ink-3'], fontSize: 12 }} tickLine={false} axisLine={false} width={48} ticks={evenTicks(domain)} interval={0} />
            {/* Cursor only: the readout above carries the values for every panel at once. */}
            <Tooltip content={() => null} cursor={{ stroke: colors['--ink-3'], strokeWidth: 1 }} />
          </>
        );
        return (
          <div key={panel.key} className={styles.panel}>
            <h3 className={styles.panelTitle}>{panel.title}</h3>
            <div className={styles.plot} role="img" aria-label={`${panel.title} over the run`}>
              <ResponsiveContainer width="100%" height={last ? 118 : 96}>
                {panel.area ? (
                  <AreaChart {...common}>
                    {axes}
                    <Area type="monotone" dataKey={panel.key} stroke={colors['--ink-3']} strokeWidth={1.5} fill={panel.color} fillOpacity={0.6} isAnimationActive={false} connectNulls />
                  </AreaChart>
                ) : (
                  <LineChart {...common}>
                    {axes}
                    <Line type="monotone" dataKey={panel.key} stroke={panel.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: colors['--surface'] }} isAnimationActive={false} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </figure>
  );
}

/**
 * The y range from the 2nd to the 98th percentile, padded a little. GPS glitches and the first seconds of heart rate
 * produce single extreme points that would otherwise flatten the whole line; they are clipped at the edge instead.
 */
function robustDomain(values: Array<number | null>): [number, number] | ['auto', 'auto'] {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length < 10) return ['auto', 'auto'];
  const low = sorted[Math.floor(sorted.length * 0.02)]!;
  const high = sorted[Math.ceil(sorted.length * 0.98) - 1]!;
  const pad = Math.max((high - low) * 0.08, 1);
  return [Math.floor(low - pad), Math.ceil(high + pad)];
}

/** Three ticks: both ends of the range and the middle. Recharts' own "nice" ticks can fall outside a clipped range. */
function evenTicks(domain: [number, number] | ['auto', 'auto']): number[] | undefined {
  if (typeof domain[0] !== 'number' || typeof domain[1] !== 'number') return undefined;
  const [low, high] = domain;
  return [low, Math.round((low + high) / 2), high];
}
