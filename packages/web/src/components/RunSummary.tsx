import type { ActivityListResponse } from '@companion/queries';
import { shortDay } from '../lib/dates.ts';
import { CATEGORY_LABEL } from '../lib/format.ts';
import { IntensityBar } from './charts/IntensityBar.tsx';
import styles from './RunSummary.module.css';

type Run = ActivityListResponse[number];


/** One run: what was planned, what it was, and how it felt. */
export function RunSummary({ run, compact = false }: { run: Run; compact?: boolean }) {
  const planned = run.planned_workout ? `Planned: ${run.planned_workout}` : CATEGORY_LABEL[run.category ?? 'other'];
  return (
    <article className={styles.run} data-compact={compact || undefined}>
      <div className={styles.top}>
        <div>
          <h3 className={styles.name}>{run.name ?? 'Run'}</h3>
          <p className={styles.meta}>
            {shortDay(run.date!)}, {planned}
            {run.treadmill ? ', treadmill' : ''}
          </p>
        </div>
        <p className={styles.distance}>
          {run.distance_km ?? '–'}
          <small> km</small>
        </p>
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>Time</dt>
          <dd>{run.duration ?? '–'}</dd>
        </div>
        <div>
          <dt>Pace</dt>
          <dd>{run.pace?.replace('/km', '') ?? '–'}</dd>
        </div>
        <div>
          <dt>Heart rate</dt>
          <dd>{run.avg_hr ?? '–'}</dd>
        </div>
        <div>
          <dt>Load</dt>
          <dd>{run.load_trimp ?? '–'}</dd>
        </div>
        {!compact ? (
          <div>
            <dt>Effort (RPE)</dt>
            <dd>{run.rpe ?? '–'}</dd>
          </div>
        ) : null}
      </dl>
      {!compact ? <IntensityBar intensity={run.intensity_pct} /> : null}
    </article>
  );
}
