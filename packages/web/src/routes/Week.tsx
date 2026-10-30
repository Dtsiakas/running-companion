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
import { m } from '../lib/i18n.ts';
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
        <nav className={styles.pager} aria-label="Other weeks">
          {week.data?.has_previous_week !== false ? <Link to={`/week?start=${addDays(start, -7)}`}>Previous week</Link> : <span />}
          {week.data?.has_next_week ? <Link to={`/week?start=${addDays(start, 7)}`}>Next week</Link> : null}
        </nav>
      </header>

      {report.data ? (
        <Section title="The week in short">
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
  if (!summary) return <p className={styles.empty}>No data for this week.</p>;
  const previous = week.previous;

  return (
    <>
      <dl className={styles.stats}>
        <Stat label="Distance" value={`${summary.km ?? 0} km`} change={change(summary.km, previous?.km, 'km')} />
        <Stat label="Runs" value={String(summary.runs ?? 0)} change={change(summary.runs, previous?.runs, '')} />
        <Stat label="Time" value={hoursMinutes(summary.hours)} />
        <Stat label="Load" value={String(summary.load ?? 0)} change={change(summary.load, previous?.load, '')} />
        <Stat label="Longest run" value={summary.longest_km ? `${summary.longest_km} km` : '–'} />
      </dl>

      <div className={styles.columns}>
        <Section title="Intensity">
          <IntensityBar intensity={summary.intensity_pct} />
          <Note>{m.notes.intensity}</Note>
        </Section>

        <Section title="Distance per week">
          <WeeklyBars weeks={week.recent} selected={week.week_start} />
        </Section>
      </div>

      <Section title="Day by day">
        <DayTable week={week} />
      </Section>

      <div className={styles.columns}>
        <Section title="Recovery and body">
          <Comparison summary={summary} previous={previous} />
        </Section>

        <Section title={week.runs.length === 1 ? 'The run' : `The ${week.runs.length} runs`}>
          {week.runs.length ? week.runs.map((run) => <RunSummary key={run.activity_id} run={run} compact />) : <p className={styles.empty}>No runs this week.</p>}
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
  if (diff === 0) return 'Same as last week';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)}${unit ? ` ${unit}` : ''} vs last week`;
}

const STATUS_LABEL = { green: 'Recovered', amber: 'One signal off', red: 'Two signals off' } as const;

function DayTable({ week }: { week: WeekResponse }) {
  const kmByDay = new Map<string, number>();
  for (const run of week.runs) if (run.date) kmByDay.set(run.date, (kmByDay.get(run.date) ?? 0) + (run.distance_km ?? 0));

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Status</th>
            <th scope="col">Run</th>
            <th scope="col">Sleep</th>
            <th scope="col">HRV</th>
            <th scope="col">Resting HR</th>
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
                      {STATUS_LABEL[day.status]}
                    </span>
                  ) : (
                    '–'
                  )}
                </td>
                <td>{km ? `${Math.round(km * 10) / 10} km` : '–'}</td>
                <td>{day?.sleep_h ? hoursMinutes(day.sleep_h) : '–'}</td>
                <td>{day?.hrv_ms ? `${day.hrv_ms} ms` : '–'}</td>
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
    ['Average sleep', summary.avg_sleep_h, previous?.avg_sleep_h, hoursMinutes],
    ['Average HRV', summary.avg_hrv_ms, previous?.avg_hrv_ms, (v) => `${v} ms`],
    ['Average resting HR', summary.avg_resting_hr, previous?.avg_resting_hr, (v) => `${v} bpm`],
    ['Weight trend', summary.weight_trend_kg, previous?.weight_trend_kg, (v) => `${v} kg`],
    ['Fitness', summary.fitness_end, previous?.fitness_end, String],
  ];
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">This week</th>
          <th scope="col">Last week</th>
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
    <Section title="Ask Claude">
      <AskClaude requests={[weekReviewRequest(start, addDays(start, 6))]} />
    </Section>
  );
}
