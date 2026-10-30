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
import { f, m } from '../lib/i18n.ts';
import { progressRequests } from '../lib/prompts.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Progress.module.css';

const FORM_ORDER: FormMeasure[] = ['cadence', 'gct', 'vertical_ratio', 'step_length', 'vertical_oscillation', 'power'];
const monthName = (month: string) => f.monthYear(`${month}-15`);
const number = (value: number) => f.number(value);

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
      <h1 className={blocks.title}>{m.progress.title}</h1>
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
    <Section title={m.progress.nextUp}>
      <div className={styles.next}>
        {next.map((item) => (
          <div key={item.title} className={styles.goal}>
            <div className={styles.goalHead}>
              <strong>{item.title}</strong>
              <span>{m.progress.of(number(Math.floor(item.progress)), number(item.target))}</span>
            </div>
            <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={Math.floor(item.progress)} aria-label={item.title}>
              <i style={{ width: `${Math.min(100, (item.progress / item.target) * 100)}%` }} />
            </div>
            {item.eta ? <p className={styles.eta}>{m.progress.eta(f.dayMonthYear(item.eta))}</p> : null}
          </div>
        ))}
      </div>
    </Section>
  );
}

function SoFar({ p }: { p: ProgressData }) {
  const r = p.records;
  return (
    <Section title={m.progress.soFar}>
      <dl className={blocks.stats}>
        <div>
          <dt>{m.progress.distance}</dt>
          <dd>
            {number(Math.round(f.distanceValue(p.totals.km)!))}
            <small className={styles.unit}> {f.distanceUnit}</small>
          </dd>
        </div>
        <div>
          <dt>{m.progress.runsLabel}</dt>
          <dd>{number(p.totals.runs)}</dd>
        </div>
        <div>
          <dt>{m.progress.time}</dt>
          <dd>
            {number(p.totals.hours)}
            <small className={styles.unit}> {f.locale.lang === 'el' ? 'ώ' : 'h'}</small>
          </dd>
        </div>
        {p.totals.climb_m ? (
          <div>
            <dt>{m.progress.climbed}</dt>
            <dd>{f.elevation(p.totals.climb_m)}</dd>
          </div>
        ) : null}
      </dl>
      <dl className={blocks.facts}>
        {r.longest_run ? (
          <div>
            <dt>{m.progress.longest}</dt>
            <dd>
              <Link to={`/runs/${r.longest_run.activity_id}`}>{f.distance(r.longest_run.km, 2)}</Link>
              <small className={styles.sub}>{shortDay(r.longest_run.date)}</small>
            </dd>
          </div>
        ) : null}
        {r.biggest_week ? (
          <div>
            <dt>{m.progress.biggestWeek}</dt>
            <dd>
              {f.distance(r.biggest_week.km)}
              <small className={styles.sub}>{m.progress.weekOf(f.dayMonthYear(r.biggest_week.week_start))}</small>
            </dd>
          </div>
        ) : null}
        {r.biggest_month ? (
          <div>
            <dt>{m.progress.biggestMonth}</dt>
            <dd>
              {f.distance(r.biggest_month.km)}
              <small className={styles.sub}>{monthName(r.biggest_month.month)}</small>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{m.progress.streakAny}</dt>
          <dd>
            {r.streak_any.current}
            <small className={styles.sub}>{m.progress.best(r.streak_any.best)}</small>
          </dd>
        </div>
        <div>
          <dt>{m.progress.streakThree}</dt>
          <dd>
            {r.streak_three.current}
            <small className={styles.sub}>{m.progress.best(r.streak_three.best)}</small>
          </dd>
        </div>
      </dl>
      {p.totals.since ? <Note>{m.progress.sinceNote(f.dayMonthYear(p.totals.since))}</Note> : null}
    </Section>
  );
}

function Bests({ bests }: { bests: ProgressData['bests'] }) {
  if (!bests.length) return null;
  return (
    <Section title={m.progress.bests}>
      <div className={blocks.tableWrap}>
        <table className={blocks.table}>
          <thead>
            <tr>
              <th scope="col">{m.progress.distance}</th>
              <th scope="col">{m.progress.bestCol}</th>
              <th scope="col">{m.progress.when}</th>
              <th scope="col">{m.progress.thisYear}</th>
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
                <td>{b.set_this_year ? <span className={styles.new}>{m.progress.setThisYear}</span> : b.this_year_s ? clock(b.this_year_s) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{m.progress.bestsNote}</Note>
    </Section>
  );
}

function Milestones({ milestones }: { milestones: ProgressData['milestones'] }) {
  if (!milestones.length) return null;
  const item = (ms: ProgressData['milestones'][number]) => (
    <li key={`${ms.date}-${ms.title}`}>
      <span className={styles.when}>{shortDay(ms.date)}</span>
      {ms.activity_id ? <Link to={`/runs/${ms.activity_id}`}>{ms.title}</Link> : ms.title}
    </li>
  );
  return (
    <Section title={m.progress.milestones}>
      <ul className={styles.milestones}>{milestones.slice(0, 8).map(item)}</ul>
      {milestones.length > 8 ? (
        <details className={styles.more}>
          <summary>{m.progress.earlier(milestones.length - 8)}</summary>
          <ul className={styles.milestones}>{milestones.slice(8).map(item)}</ul>
        </details>
      ) : null}
    </Section>
  );
}


function Form() {
  const form = useFormTrend();
  if (!form.data) return null;
  return (
    <Section title={m.progress.form.title}>
      <p className={blocks.explain}>{m.progress.form.intro(f.dayMonthYear(form.data.since), form.data.runs, f.paceFromSecondsPerKm(form.data.reference_pace_s))}</p>
      <div className={styles.form}>
        {FORM_ORDER.map((key) => (
          <FormPanel key={key} data={form.data!} measure={key} />
        ))}
      </div>
      <Note>
        {m.notes.runningForm} {m.progress.form.note}
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
            {series.basis === 'year_ago' ? `${m.progress.form.yearAgo} ` : ''}
            {f.number(series.first, 2)} → {m.progress.form.now} {f.number(series.last, 2)} {series.unit}
            {series.direction ? <span data-direction={series.direction}> {m.progress.form.direction[series.direction]}</span> : null}
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
      <Section title={m.progress.year.title}>
        <div className={styles.years} role="group" aria-label={m.progress.year.label}>
          {years.map((y) => (
            <button key={y} type="button" className={styles.year} aria-pressed={y === year} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
        {review.isPending ? <Loading /> : review.data ? <YearBody review={review.data} /> : <p className={blocks.empty}>{m.progress.year.none(year)}</p>}
      </Section>
      <Section title={m.progress.askClaude}>
        <AskClaude requests={progressRequests(year, !!form.data)} />
      </Section>
    </>
  );
}

function YearBody({ review: y }: { review: YearReview }) {
  const change = (key: keyof YearReview['fitness'], format: (v: number) => string, lowerIsBetter = false) => {
    const { start, end } = y.fitness[key];
    if (start === null || end === null) return null;
    const better = lowerIsBetter ? end < start : end > start;
    const same = Math.abs(end - start) < 0.5;
    return (
      <>
        {format(start)} → {format(end)}
        {!same && key !== 'weight' ? <span className={styles.sub}>{better ? m.progress.year.better : m.progress.year.worse}</span> : null}
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
          <dt>{m.progress.distance}</dt>
          <dd>
            {number(Math.round(f.distanceValue(y.km)!))}
            <small className={styles.unit}> {f.distanceUnit}</small>
          </dd>
          {vsLast !== null ? <dd className={blocks.change}>{m.progress.year.onLast(`${f.signed(vsLast)}%`, y.year - 1)}</dd> : null}
        </div>
        <div>
          <dt>{m.progress.runsLabel}</dt>
          <dd>{y.runs}</dd>
          {y.previous ? <dd className={blocks.change}>{m.progress.year.inYear(y.previous.runs, y.year - 1)}</dd> : null}
        </div>
        <div>
          <dt>{m.progress.year.aWeek}</dt>
          <dd>
            {f.number(f.distanceValue(y.km_per_week), 1)}
            <small className={styles.unit}> {f.distanceUnit}</small>
          </dd>
        </div>
        <div>
          <dt>{m.progress.year.weeksWithRun}</dt>
          <dd>
            {y.weeks_with_runs}
            <small className={styles.unit}> {m.progress.year.of(y.weeks)}</small>
          </dd>
          {y.since ? <dd className={blocks.change}>{m.progress.year.since(f.dayMonthYear(y.since))}</dd> : null}
        </div>
      </dl>
      <YearMonths review={y} />
      <dl className={blocks.facts}>
        <div>
          <dt>{m.progress.longest}</dt>
          <dd>
            <Link to={`/runs/${y.longest_run.activity_id}`}>{f.distance(y.longest_run.km, 2)}</Link>
            <small className={styles.sub}>{shortDay(y.longest_run.date)}</small>
          </dd>
        </div>
        <div>
          <dt>{m.progress.biggestWeek}</dt>
          <dd>
            {f.distance(y.biggest_week.km)}
            <small className={styles.sub}>{m.progress.weekOf(f.dayMonthYear(y.biggest_week.week_start))}</small>
          </dd>
        </div>
        <div>
          <dt>{m.progress.year.timeRunning}</dt>
          <dd>
            {f.hoursMinutes(y.hours).split(' ')[0]}
            <small className={styles.sub}>{y.climb_m ? m.progress.year.climbed(f.elevation(y.climb_m)) : ''}</small>
          </dd>
        </div>
        {y.fitness.resting_hr.start !== null ? (
          <div>
            <dt>{m.progress.year.restingHr}</dt>
            <dd>{change('resting_hr', (v) => `${f.number(v, 1)} bpm`, true)}</dd>
          </div>
        ) : null}
        {y.fitness.hrv.start !== null ? (
          <div>
            <dt>{m.progress.year.hrv}</dt>
            <dd>{change('hrv', (v) => `${f.number(v)} ms`)}</dd>
          </div>
        ) : null}
        {y.fitness.sleep_h.start !== null ? (
          <div>
            <dt>{m.progress.year.sleep}</dt>
            <dd>{change('sleep_h', (v) => f.hoursMinutes(v))}</dd>
          </div>
        ) : null}
        {y.fitness.weight.start !== null ? (
          <div>
            <dt>{m.progress.year.weightTrend}</dt>
            <dd>{change('weight', (v) => f.weight(v))}</dd>
          </div>
        ) : null}
        {total ? (
          <div>
            <dt>{m.progress.year.whenYouRan}</dt>
            <dd className={styles.small}>{m.progress.year.timeOfDay(share(y.time_of_day.morning), share(y.time_of_day.afternoon), share(y.time_of_day.evening))}</dd>
          </div>
        ) : null}
        {y.hottest && y.coldest ? (
          <div>
            <dt>{m.progress.year.hottestColdest}</dt>
            <dd className={styles.small}>
              <Link to={`/runs/${y.hottest.activity_id}`}>{f.temperature(y.hottest.temp_c, 1)}</Link> {m.progress.year.and}{' '}
              <Link to={`/runs/${y.coldest.activity_id}`}>{f.temperature(y.coldest.temp_c, 1)}</Link>
            </dd>
          </div>
        ) : null}
      </dl>
      {y.bests_set.length ? (
        <>
          <h3 className={styles.subhead}>{m.progress.year.bestsSet(y.year)}</h3>
          <ul className={styles.milestones}>
            {y.bests_set.map((b) => (
              <li key={b.distance}>
                <span className={styles.when}>{shortDay(b.date)}</span>
                <Link to={`/runs/${b.activity_id}`}>
                  {m.progress.year.bestIn(b.distance, clock(b.seconds))}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Note>
        {y.complete ? m.progress.year.whole(y.year) : m.progress.year.upTo(y.year, f.dayMonthYear(y.through))} {m.progress.year.note}
      </Note>
    </div>
  );
}
