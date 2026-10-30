import { f, m } from '../lib/i18n.ts';
import type { ActivityListResponse } from '@companion/queries';
import { shortDay } from '../lib/dates.ts';
import { stripPace } from '../lib/format.ts';
import { IntensityBar } from './charts/IntensityBar.tsx';
import styles from './RunSummary.module.css';

type Run = ActivityListResponse[number];


/** One run: what was planned, what it was, and how it felt. */
export function RunSummary({ run, compact = false }: { run: Run; compact?: boolean }) {
  const planned = run.planned_workout ? m.run.planned(run.planned_workout) : m.run.category[run.category ?? 'other'];
  return (
    <article className={styles.run} data-compact={compact || undefined}>
      <div className={styles.top}>
        <div>
          <h3 className={styles.name}>{run.name ?? m.run.run}</h3>
          <p className={styles.meta}>
            {shortDay(run.date!)}, {planned}
            {run.treadmill ? `, ${m.run.treadmill}` : ''}
          </p>
        </div>
        <p className={styles.distance}>
          {f.number(f.distanceValue(run.distance_km), 2)}
          <small> {f.distanceUnit}</small>
        </p>
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>{m.run.time}</dt>
          <dd>{run.duration ?? '–'}</dd>
        </div>
        <div>
          <dt>{m.run.pace}</dt>
          <dd>{stripPace(run.pace)}</dd>
        </div>
        <div>
          <dt>{m.run.heartRate}</dt>
          <dd>{run.avg_hr ?? '–'}</dd>
        </div>
        <div>
          <dt>{m.run.load}</dt>
          <dd>{run.load_trimp ?? '–'}</dd>
        </div>
        {!compact ? (
          <div>
            <dt>{m.run.rpe}</dt>
            <dd>{run.rpe ?? '–'}</dd>
          </div>
        ) : null}
      </dl>
      {!compact ? <IntensityBar intensity={run.intensity_pct} /> : null}
    </article>
  );
}
