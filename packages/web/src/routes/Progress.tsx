import type { FormMeasure, FormTrend, Progress as ProgressData, YearReview } from '@companion/insights';
import { useState } from 'react';
import { Link } from 'react-router';
import { useFormTrend, useProgress, useYearReview } from '../api/hooks.ts';
import { AskClaude } from '../components/AskClaude.tsx';
import { FormChart, YearMonths } from '../components/charts/ProgressCharts.tsx';
import { Note } from '../components/Note.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { longDay, shortDay, todayLocal } from '../lib/dates.ts';
import { clock } from '../lib/format.ts';
import { NOTES } from '../lib/insights.ts';
import { progressRequests } from '../lib/prompts.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Progress.module.css';

const FORM_ORDER: FormMeasure[] = ['cadence', 'gct', 'vertical_ratio', 'step_length', 'vertical_oscillation', 'power'];
const monthName = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const number = (value: number) => value.toLocaleString('en-GB');

/**
 * The long view: what you've built so far, the next marks, records and bests, how your form has changed, and one
 * year at a time. Order runs from what's next to what's behind you.
 */
export function Progress() {
  const progress = useProgress();
  if (progress.isPending) return <Loading />;
  if (progress.isError) return <ErrorState error={progress.error} retry={() => void progress.refetch()} />;
  const p = progress.data;
  const firstYear = p.totals.since ? Number(p.totals.since.slice(0, 4)) : null;

  return (
    <div className={blocks.page}>
      <h1 className={blocks.title}>Progress</h1>
      <NextUp next={p.next} />
      <SoFar p={p} />
      <Bests bests={p.bests} />
      <Milestones milestones={p.milestones} />
      <Form />
      {firstYear ? <Year firstYear={firstYear} /> : null}
    </div>
  );
}

function NextUp({ next }: { next: ProgressData['next'] }) {
  if (!next.length) return null;
  return (
    <Section title="Next up">
      <div className={styles.next}>
        {next.map((item) => (
          <div key={item.title} className={styles.goal}>
            <div className={styles.goalHead}>
              <strong>{item.title}</strong>
              <span>
                {number(Math.floor(item.progress))} of {number(item.target)}
              </span>
            </div>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={Math.floor(item.progress)} aria-label={item.title}>
              <i style={{ width: `${Math.min(100, (item.progress / item.target) * 100)}%` }} />
            </div>
            {item.eta ? <p className={styles.eta}>Around {longDay(item.eta)} at your pace of the last eight weeks.</p> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function SoFar({ p }: { p: ProgressData }) {
  const r = p.records;
  return (
    <Section title="So far">
      <dl className={blocks.stats}>
        <div>
          <dt>Distance</dt>
          <dd>
            {number(p.totals.km)}
            <small className={styles.unit}> km</small>
          </dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{number(p.totals.runs)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>
            {number(p.totals.hours)}
            <small className={styles.unit}> h</small>
          </dd>
        </div>
        {p.totals.climb_m ? (
          <div>
            <dt>Climbed</dt>
            <dd>
              {number(p.totals.climb_m)}
              <small className={styles.unit}> m</small>
            </dd>
          </div>
        ) : null}
      </dl>
      <dl className={blocks.facts}>
        {r.longest_run ? (
          <div>
            <dt>Longest run</dt>
            <dd>
              <Link to={`/runs/${r.longest_run.activity_id}`}>{r.longest_run.km} km</Link>
              <small className={styles.sub}>{shortDay(r.longest_run.date)}</small>
            </dd>
          </div>
        ) : null}
        {r.biggest_week ? (
          <div>
            <dt>Biggest week</dt>
            <dd>
              {r.biggest_week.km} km<small className={styles.sub}>week of {shortDay(r.biggest_week.week_start)}</small>
            </dd>
          </div>
        ) : null}
        {r.biggest_month ? (
          <div>
            <dt>Biggest month</dt>
            <dd>
              {r.biggest_month.km} km<small className={styles.sub}>{monthName(r.biggest_month.month)}</small>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Weeks in a row with a run</dt>
          <dd>
            {r.streak_any.current}
            <small className={styles.sub}>best {r.streak_any.best}</small>
          </dd>
        </div>
        <div>
          <dt>Weeks in a row with 3+ runs</dt>
          <dd>
            {r.streak_three.current}
            <small className={styles.sub}>best {r.streak_three.best}</small>
          </dd>
        </div>
      </dl>
      {p.totals.since ? <Note>Every run since {longDay(p.totals.since)}. Weeks run Monday to Sunday; the week in progress never breaks a streak.</Note> : null}
    </Section>
  );
}

function Bests({ bests }: { bests: ProgressData['bests'] }) {
  if (!bests.length) return null;
  return (
    <Section title="Personal bests">
      <div className={blocks.tableWrap}>
        <table className={blocks.table}>
          <thead>
            <tr>
              <th scope="col">Distance</th>
              <th scope="col">Best</th>
              <th scope="col">When</th>
              <th scope="col">This year</th>
            </tr>
          </thead>
          <tbody>
            {bests.map((b) => (
              <tr key={b.distance}>
                <th scope="row">{b.distance}</th>
                <td>
                  <Link to={`/runs/${b.activity_id}`}>{clock(b.best_s)}</Link>
                </td>
                <td>{shortDay(b.date)}</td>
                <td>{b.set_this_year ? <span className={styles.new}>set this year</span> : b.this_year_s ? clock(b.this_year_s) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>The fastest stretch of each distance inside any run, not only races, measured from the watch’s distance. Short ones (400 m, 1 km) come from intervals; GPS can flatter them by a second or two.</Note>
    </Section>
  );
}

function Milestones({ milestones }: { milestones: ProgressData['milestones'] }) {
  if (!milestones.length) return null;
  const item = (m: ProgressData['milestones'][number]) => (
    <li key={`${m.date}-${m.title}`}>
      <span className={styles.when}>{shortDay(m.date)}</span>
      {m.activity_id ? <Link to={`/runs/${m.activity_id}`}>{m.title}</Link> : m.title}
    </li>
  );
  return (
    <Section title="Milestones">
      <ul className={styles.milestones}>{milestones.slice(0, 8).map(item)}</ul>
      {milestones.length > 8 ? (
        <details className={styles.more}>
          <summary>Earlier ({milestones.length - 8})</summary>
          <ul className={styles.milestones}>{milestones.slice(8).map(item)}</ul>
        </details>
      ) : null}
    </Section>
  );
}

const DIRECTION = { better: '✓ improved', worse: '▲ slipped', steady: 'steady' } as const;

function Form() {
  const form = useFormTrend();
  if (!form.data) return null;
  return (
    <Section title="Running form">
      <p className={blocks.explain}>
        Easy outdoor runs since {longDay(form.data.since)} ({form.data.runs} runs), month by month, every measure adjusted to your typical easy pace of {clock(form.data.reference_pace_s)}/km so faster
        months don’t look like better form. The numbers compare your last three months with the same three a year earlier, which also cancels out the season. Gaps are months with fewer than
        three easy runs.
      </p>
      <div className={styles.form}>
        {FORM_ORDER.map((key) => (
          <FormPanel key={key} data={form.data!} measure={key} />
        ))}
      </div>
      <Note>
        {NOTES.runningForm} Improved means toward what coaches usually recommend: a slightly higher cadence and shorter contact are linked to lower impact on the legs, and less bounce wastes less
        energy going up and down. At a fixed pace, cadence and step length always move opposite ways (pace is the two multiplied), so read them together. Power has no verdict: Garmin models it from the
        watch’s motion sensors and your weight, and the model has changed with firmware updates, which shows as a sudden step.
      </Note>
    </Section>
  );
}

function FormPanel({ data, measure }: { data: FormTrend; measure: FormMeasure }) {
  const series = data.measures[measure];
  if (series.points.filter((p) => p.value !== null).length < 3) return null;
  return (
    <article className={styles.panel}>
      <header className={styles.panelHead}>
        <h3>{series.label}</h3>
        {series.first !== null && series.last !== null ? (
          <p>
            {series.basis === 'year_ago' ? 'a year ago ' : ''}
            {series.first} → now {series.last} {series.unit}
            {series.direction ? <span data-direction={series.direction}> {DIRECTION[series.direction]}</span> : null}
          </p>
        ) : null}
      </header>
      <FormChart series={series} />
    </article>
  );
}

function Year({ firstYear }: { firstYear: number }) {
  const thisYear = Number(todayLocal().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const review = useYearReview(year);
  const form = useFormTrend();
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);
  return (
    <>
      <Section title="Year in review">
        <div className={styles.years} role="group" aria-label="Year">
          {years.map((y) => (
            <button key={y} type="button" className={styles.year} aria-pressed={y === year} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        {review.isPending ? <Loading /> : review.data ? <YearBody review={review.data} /> : <p className={blocks.empty}>No runs in {year}.</p>}
      </Section>
      <Section title="Ask Claude">
        <AskClaude requests={progressRequests(year, !!form.data)} />
      </Section>
    </>
  );
}

function YearBody({ review: y }: { review: YearReview }) {
  const change = (key: keyof YearReview['fitness'], unit: string, lowerIsBetter = false) => {
    const { start, end } = y.fitness[key];
    if (start === null || end === null) return null;
    const better = lowerIsBetter ? end < start : end > start;
    const same = Math.abs(end - start) < 0.5;
    return (
      <>
        {start} → {end}
        {unit}
        {!same && key !== 'weight' ? <span className={styles.sub}>{better ? 'better' : 'worse'} than in January</span> : null}
      </>
    );
  };
  const vsLast = y.previous ? Math.round(((y.km - y.previous.km) / y.previous.km) * 100) : null;
  const total = y.time_of_day.morning + y.time_of_day.afternoon + y.time_of_day.evening;
  const share = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div className={styles.yearBody}>
      <dl className={blocks.stats}>
        <div>
          <dt>Distance</dt>
          <dd>
            {number(Math.round(y.km))}
            <small className={styles.unit}> km</small>
          </dd>
          {vsLast !== null ? <dd className={blocks.change}>{vsLast >= 0 ? `+${vsLast}` : `−${Math.abs(vsLast)}`}% on {y.year - 1}</dd> : null}
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{y.runs}</dd>
          {y.previous ? <dd className={blocks.change}>{y.previous.runs} in {y.year - 1}</dd> : null}
        </div>
        <div>
          <dt>A week</dt>
          <dd>
            {y.km_per_week}
            <small className={styles.unit}> km</small>
          </dd>
        </div>
        <div>
          <dt>Weeks with a run</dt>
          <dd>
            {y.weeks_with_runs}
            <small className={styles.unit}> of {y.weeks}</small>
          </dd>
          {y.since ? <dd className={blocks.change}>since {longDay(y.since)}</dd> : null}
        </div>
      </dl>
      <YearMonths review={y} />
      <dl className={blocks.facts}>
        <div>
          <dt>Longest run</dt>
          <dd>
            <Link to={`/runs/${y.longest_run.activity_id}`}>{y.longest_run.km} km</Link>
            <small className={styles.sub}>{shortDay(y.longest_run.date)}</small>
          </dd>
        </div>
        <div>
          <dt>Biggest week</dt>
          <dd>
            {y.biggest_week.km} km<small className={styles.sub}>week of {shortDay(y.biggest_week.week_start)}</small>
          </dd>
        </div>
        <div>
          <dt>Time running</dt>
          <dd>
            {y.hours} h<small className={styles.sub}>{y.climb_m ? `${number(y.climb_m)} m climbed` : ''}</small>
          </dd>
        </div>
        {y.fitness.resting_hr.start !== null ? (
          <div>
            <dt>Resting heart rate</dt>
            <dd>{change('resting_hr', ' bpm', true)}</dd>
          </div>
        ) : null}
        {y.fitness.hrv.start !== null ? (
          <div>
            <dt>HRV</dt>
            <dd>{change('hrv', ' ms')}</dd>
          </div>
        ) : null}
        {y.fitness.sleep_h.start !== null ? (
          <div>
            <dt>Sleep</dt>
            <dd>{change('sleep_h', ' h')}</dd>
          </div>
        ) : null}
        {y.fitness.weight.start !== null ? (
          <div>
            <dt>Weight trend</dt>
            <dd>{change('weight', ' kg')}</dd>
          </div>
        ) : null}
        {total ? (
          <div>
            <dt>When you ran</dt>
            <dd className={styles.small}>
              {share(y.time_of_day.morning)} mornings, {share(y.time_of_day.afternoon)} afternoons, {share(y.time_of_day.evening)} evenings
            </dd>
          </div>
        ) : null}
        {y.hottest && y.coldest ? (
          <div>
            <dt>Hottest and coldest</dt>
            <dd className={styles.small}>
              <Link to={`/runs/${y.hottest.activity_id}`}>{y.hottest.temp_c}°C</Link> and <Link to={`/runs/${y.coldest.activity_id}`}>{y.coldest.temp_c}°C</Link>
            </dd>
          </div>
        ) : null}
      </dl>
      {y.bests_set.length ? (
        <>
          <h3 className={styles.subhead}>Personal bests set in {y.year}</h3>
          <ul className={styles.milestones}>
            {y.bests_set.map((b) => (
              <li key={b.distance}>
                <span className={styles.when}>{shortDay(b.date)}</span>
                <Link to={`/runs/${b.activity_id}`}>
                  {b.distance} in {clock(b.seconds)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Note>
        {y.complete ? `The whole of ${y.year}.` : `${y.year} up to ${longDay(y.through)}.`} Fitness and body values compare the year’s first month with its last. A personal best counts for the year it was
        first set, at that distance’s fastest stretch inside any run.
      </Note>
    </div>
  );
}
