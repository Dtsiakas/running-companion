import { f, m } from '../lib/i18n.ts';
import type { ActivityListResponse, PlacesResponse } from '@companion/queries';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { useMapConfig, usePlaces, useRunList } from '../api/hooks.ts';
import { ErrorState, Loading } from '../components/States.tsx';
import blocks from '../styles/blocks.module.css';
import styles from './Runs.module.css';

type Run = ActivityListResponse[number];

const monthOf = (date: string) => f.monthYear(date);
const dayOf = (date: string) => `${f.weekday(date)} ${Number(date.slice(8))}`;

/**
 * Every run, newest first, grouped by month. One line per run with what you'd scan for: kind, distance, pace, heart rate.
 * Pages of 40 load on request rather than on scroll, so the list never jumps while you read it.
 */
export function Runs() {
  const runs = useRunList();

  if (runs.isPending) return <Loading />;
  if (runs.isError) return <ErrorState error={runs.error} retry={() => void runs.refetch()} />;

  const months = groupByMonth(runs.data.pages.flat());

  return (
    <div className={blocks.page}>
      <h1 className={blocks.title}>{m.run.list.title}</h1>
      <Places />
      {months.length === 0 ? <p className={blocks.empty}>{m.run.list.none}</p> : null}
      {months.map(([month, list]) => (
        <section key={month} className={styles.month}>
          <h2 className={styles.monthTitle}>{month}</h2>
          <ul className={styles.list}>
            {list.map((run) => (
              <li key={run.activity_id}>
                <RunRow run={run} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {runs.hasNextPage ? (
        <button type="button" className={`${blocks.button} ${styles.more}`} onClick={() => void runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>
          {runs.isFetchingNextPage ? m.run.list.loading : m.run.list.loadMore}
        </button>
      ) : null}
    </div>
  );
}

function RunRow({ run }: { run: Run }) {
  const kind = run.planned_workout ?? m.run.category[run.category ?? 'other'];
  // Garmin names runs after the workout ("Park Loop - Threshold"); repeating the kind adds nothing then.
  const kindIsInName = !!kind && !!run.name?.toLowerCase().includes(kind.toLowerCase());
  const details = [kindIsInName ? null : kind, run.pace, run.avg_hr ? `${run.avg_hr} bpm` : null, run.treadmill ? m.run.treadmill : null].filter(Boolean).join(', ');
  return (
    <Link to={`/runs/${run.activity_id}`} className={styles.row}>
      <span className={styles.day}>{run.date ? dayOf(run.date) : ''}</span>
      <span className={styles.main}>
        <span className={styles.name}>{run.name ?? m.run.run}</span>
        <span className={styles.details}>{details}</span>
      </span>
      <span className={styles.km}>
        {f.number(f.distanceValue(run.distance_km), 2)}
        <small> {f.distanceUnit}</small>
      </span>
    </Link>
  );
}

function groupByMonth(runs: Run[]): Array<[string, Run[]]> {
  const months = new Map<string, Run[]>();
  for (const run of runs) {
    const month = run.date ? monthOf(run.date) : m.run.list.undated;
    months.set(month, [...(months.get(month) ?? []), run]);
  }
  return [...months];
}

const PlacesMap = lazy(() => import('../components/map/PlacesMap.tsx'));

/** Folded away by default: the map and its library load only when you open it. */
function Places() {
  const [open, setOpen] = useState(false);
  const places = usePlaces();
  const map = useMapConfig();
  const count = places.data?.length;
  return (
    <details className={styles.places} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {m.run.list.whereYouRan}
        {count ? ` ${m.run.list.placeCount(count)}` : ''}
      </summary>
      {open && places.data && map.data ? (
        <Suspense fallback={<Loading label={m.run.loadingMap} />}>
          <PlacesMap places={places.data} config={map.data} />
          <ul className={styles.placeList}>
            {byName(places.data).slice(0, 8).map((p) => (
              <li key={p.name ?? `${p.lat},${p.lon}`}>
                <Link to={`/runs/${p.last_activity_id}`}>{p.name ?? m.run.list.unnamedPlace}</Link>
                <span>
                  {m.run.list.runs(p.runs)}, {f.distance(p.km, 0)}
                </span>
              </li>
            ))}
          </ul>
        </Suspense>
      ) : null}
    </details>
  );
}

/** The list merges starting points that share a place name (two corners of the same village); the map keeps them apart. */
function byName(places: PlacesResponse): PlacesResponse {
  const merged = new Map<string, PlacesResponse[number]>();
  for (const place of places) {
    const key = place.name ?? `${place.lat},${place.lon}`;
    const seen = merged.get(key);
    merged.set(
      key,
      seen
        ? { ...seen, runs: seen.runs + place.runs, km: seen.km + place.km, last_activity_id: place.last > seen.last ? place.last_activity_id : seen.last_activity_id, last: place.last > seen.last ? place.last : seen.last }
        : place,
    );
  }
  return [...merged.values()].sort((a, b) => b.runs - a.runs);
}
