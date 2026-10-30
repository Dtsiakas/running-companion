import type { WeekResponse } from '@companion/queries';
import { Link, useSearchParams } from 'react-router';
import { useWeek, useWeeklyReport } from '../api/hooks.ts';
import { WeekReport } from '../components/WeekReport.tsx';
import { AskClaude } from '../components/AskClaude.tsx';
import { weekReviewRequest } from '../lib/prompts.ts';
import { IntensityBar } from '../components/charts/IntensityBar.tsx';
import { WeeklyBars } from '../components/charts/WeeklyBars.tsx';
import { Note } from '../components/Note.tsx';
import { RunSummary } from '../components/RunSummary.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { addDays, hoursMinutes, todayLocal, weekday, weekRange, weekStartOf } from '../lib/dates.ts';
import { f, m } from '../lib/i18n.ts';
import styles from '../styles/blocks.module.css';

type Summary = NonNullable<WeekResponse['summary']>;

export function Week() {
  const [params] = useSearchParams();
  const start = weekStartOf(params.get('start') ?? todayLocal());
  const week = useWeek(start);
  const report = useWeeklyReport(start);

  return (
    <div className={styles.page}>
      <header className={styles.pageTop}>
        <h1 className={styles.title}>{weekRange(start, addDays(start, 6))}</h1>
        <nav className={styles.pager} aria-label={m.week.otherWeeks}>
          {week.data?.has_previous_week !== false ? <Link to={`/week?start=${addDays(start, -7)}`}>{m.week.previous}</Link> : <span />}
          {week.data?.has_next_week ? <Link to={`/week?start=${addDays(start, 7)}`}>{m.week.next}</Link> : null}
        </nav>
      </header>

      {report.data ? (
        <Section title={m.week.inShort}>
          <WeekReport report={report.data} />
        </Section>
      ) : null}

      {week.isPending ? <Loading /> : week.isError ? <ErrorState error={week.error} retry={() => void week.refetch()} /> : <WeekBody week={week.data} />}

      <WeeklyReview start={start} />
    </div>
  );
}

function WeekBody({ week }: { week: WeekResponse }) {
  const summary = week.summary;
  if (!summary) return <p className={styles.empty}>{m.week.noData}</p>;
  const previous = week.previous;

  return (
    <>
      <dl className={styles.stats}>
        <Stat label={m.week.distance} value={f.distance(summary.km ?? 0)} change={change(f.distanceValue(summary.km), f.distanceValue(previous?.km), f.distanceUnit)} />
        <Stat label={m.week.runs} value={String(summary.runs ?? 0)} change={change(summary.runs, previous?.runs, '')} />
        <Stat label={m.week.time} value={hoursMinutes(summary.hours)} />
        <Stat label={m.week.load} value={f.number(summary.load ?? 0)} change={change(summary.load, previous?.load, '')} />
        <Stat label={m.week.longest} value={summary.longest_km ? f.distance(summary.longest_km, 2) : '–'} />
      </dl>

      <div className={styles.columns}>
        <Section title={m.week.intensity}>
          <IntensityBar intensity={summary.intensity_pct} />
          <Note>{m.notes.intensity}</Note>
        </Section>

        <Section title={m.week.perWeek}>
          <WeeklyBars weeks={week.recent} selected={week.week_start} />
        </Section>
      </div>

      <Section title={m.week.dayByDay}>
        <DayTable week={week} />
      </Section>

      <div className={styles.columns}>
        <Section title={m.week.recoveryAndBody}>
          <Comparison summary={summary} previous={previous} />
        </Section>

        <Section title={m.week.theRuns(week.runs.length)}>
          {week.runs.length ? week.runs.map((run) => <RunSummary key={run.activity_id} run={run} compact />) : <p className={styles.empty}>{m.week.noRuns}</p>}
        </Section>
      </div>
    </>
  );
}

function Stat({ label, value, change: delta }: { label: string; value: string; change?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {delta ? <dd className={styles.change}>{delta}</dd> : null}
    </div>
  );
}

/** "+4.2 km vs last week" */
function change(current: number | null | undefined, previous: number | null | undefined, unit: string): string | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return m.week.same;
  return m.week.vsLast(`${f.signed(diff, 1)}${unit ? ` ${unit}` : ''}`);
}


function DayTable({ week }: { week: WeekResponse }) {
  const kmByDay = new Map<string, number>();
  for (const run of week.runs) if (run.date) kmByDay.set(run.date, (kmByDay.get(run.date) ?? 0) + (run.distance_km ?? 0));

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{m.week.day}</th>
            <th scope="col">{m.week.status}</th>
            <th scope="col">{m.week.run}</th>
            <th scope="col">{m.week.sleep}</th>
            <th scope="col">{m.week.hrv}</th>
            <th scope="col">{m.week.restingHr}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }, (_, i) => addDays(week.week_start, i)).map((date) => {
            const day = week.days.find((d) => d.date === date);
            const km = kmByDay.get(date);
            return (
              <tr key={date}>
                <th scope="row">{weekday(date)}</th>
                <td>
                  {day?.status ? (
                    <span className={styles.status} data-status={day.status}>
                      <i aria-hidden="true" />
                      {m.insight.status[day.status].label}
                    </span>
                  ) : (
                    '–'
                  )}
                </td>
                <td>{km ? f.distance(km) : '–'}</td>
                <td>{day?.sleep_h ? hoursMinutes(day.sleep_h) : '–'}</td>
                <td>{day?.hrv_ms ? `${f.number(day.hrv_ms)} ms` : '–'}</td>
                <td>{day?.resting_hr ?? '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Comparison({ summary, previous }: { summary: Summary; previous: WeekResponse['previous'] }) {
  const rows: Array<[string, number | null | undefined, number | null | undefined, (v: number) => string]> = [
    [m.week.avgSleep, summary.avg_sleep_h, previous?.avg_sleep_h, hoursMinutes],
    [m.week.avgHrv, summary.avg_hrv_ms, previous?.avg_hrv_ms, (v) => `${f.number(v)} ms`],
    [m.week.avgRhr, summary.avg_resting_hr, previous?.avg_resting_hr, (v) => `${f.number(v, 1)} bpm`],
    [m.week.weightTrend, summary.weight_trend_kg, previous?.weight_trend_kg, (v) => f.weight(v)],
    [m.week.fitness, summary.fitness_end, previous?.fitness_end, (v) => f.number(v, 1)],
  ];
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">{m.week.thisWeek}</th>
          <th scope="col">{m.week.lastWeek}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, current, before, format]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{current === null || current === undefined ? '–' : format(current)}</td>
            <td>{before === null || before === undefined ? '–' : format(before)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Claude writes the review from the week's data, in the chat. */
function WeeklyReview({ start }: { start: string }) {
  return (
    <Section title={m.week.askClaude}>
      <AskClaude requests={[weekReviewRequest(start, addDays(start, 6))]} />
    </Section>
  );
}
