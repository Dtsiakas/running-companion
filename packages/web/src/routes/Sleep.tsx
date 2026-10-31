import type { SleepReport, StressReport } from '@companion/insights';
import { usePatterns, useSleep } from '../api/hooks.ts';
import { AskClaude } from '../components/AskClaude.tsx';
import { BatteryBalance, SleepDiary, SleepVsNeed } from '../components/charts/SleepCharts.tsx';
import { Note } from '../components/Note.tsx';
import { Patterns } from '../components/Patterns.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { todayLocal } from '../lib/dates.ts';
import { f, m } from '../lib/i18n.ts';
import { sleepRequests } from '../lib/prompts.ts';
import { hoursText, spanText } from '../lib/sleep.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Sleep.module.css';
import { scrollRegion } from '../lib/a11y.ts';

/** The patterns that are about sleep and recharge, from "What works for you". */
const SLEEP_PATTERNS = new Set(['bedtime', 'sleep-length', 'evening-runs', 'stress']);


/**
 * Sleep and stress in depth. Order follows the question you'd ask in the evening: when should I sleep tonight,
 * how far behind am I, how regular is my timing, and then what drains the day and what helps the night.
 */
export function Sleep() {
  const today = todayLocal();
  const report = useSleep(today);
  const patterns = usePatterns(today);
  if (report.isPending) return <Loading />;
  if (report.isError) return <ErrorState error={report.error} retry={() => void report.refetch()} />;
  const { sleep, stress } = report.data;

  return (
    <div className={blocks.page}>
      <h1 className={blocks.title}>{m.sleep.title}</h1>
      {sleep.nights.length ? (
        <>
          {sleep.tonight ? <Tonight tonight={sleep.tonight} /> : null}
          <SleepNeed sleep={sleep} />
          <Timing sleep={sleep} />
          {sleep.stages ? <Stages stages={sleep.stages} /> : null}
        </>
      ) : (
        <Section title={m.sleep.sleep}>
          <p className={blocks.explain}>{m.sleep.noSleep}</p>
        </Section>
      )}
      <Battery stress={stress} />
      <div className={blocks.columns}>
        {stress.sources ? <Sources sources={stress.sources} /> : null}
        <StressTime stress={stress} />
      </div>
      {patterns.data ? (
        <Section title={m.sleep.affects}>
          <Patterns patterns={patterns.data.filter((p) => SLEEP_PATTERNS.has(p.id))} />
        </Section>
      ) : null}
      <Section title={m.sleep.askClaude}>
        <AskClaude requests={sleepRequests()} />
      </Section>
    </div>
  );
}

function Tonight({ tonight }: { tonight: NonNullable<SleepReport['tonight']> }) {
  const basis = tonight.wake_basis === 'weekday' ? 'weekday' : tonight.wake_basis === 'weekend' ? 'weekend' : 'usual';
  const t = m.sleep.tonight;
  const needFrom = tonight.need_source === 'default' ? t.typicalNeed : t.garminNeed;
  const wakeUp = t.wakeUp[basis];
  return (
    <Section title={t.title}>
      {tonight.step ? (
        <>
          <p className={styles.target}>
            {t.asleepBy} <strong>{tonight.step.asleep_by}</strong>
          </p>
          <p className={styles.lead}>{t.stepLead(tonight.step.in_bed_by, tonight.usual_bed, hoursText(tonight.step.hours), wakeUp, tonight.wake)}</p>
          <p className={blocks.explain}>{t.stepExplain(needFrom, hoursText(tonight.need_h), tonight.wake, tonight.asleep_by, spanText(tonight.gap_min))}</p>
        </>
      ) : (
        <>
          <p className={styles.target}>
            {t.asleepBy} <strong>{tonight.asleep_by}</strong>
          </p>
          <p className={styles.lead}>{t.lead(tonight.in_bed_by, hoursText(tonight.need_h), wakeUp, tonight.wake)}</p>
          <p className={blocks.explain}>{t.explain(needFrom, hoursText(tonight.need_h), basis)}</p>
        </>
      )}
      <Note>{t.note(tonight.settle_min)}</Note>
    </Section>
  );
}

function SleepNeed({ sleep }: { sleep: SleepReport }) {
  const { debt } = sleep;
  return (
    <Section title={m.sleep.need.title}>
      {debt ? (
        <>
          <dl className={blocks.facts}>
            <div>
              <dt>{m.sleep.need.asleepLast(debt.nights)}</dt>
              <dd>{m.sleep.need.aNight(hoursText(debt.slept_avg_h))}</dd>
            </div>
            <div>
              <dt>{m.sleep.need.garminNeed}</dt>
              <dd>{m.sleep.need.aNight(hoursText(debt.need_avg_h))}</dd>
            </div>
            <div>
              <dt>{m.sleep.need.missing}</dt>
              <dd>{hoursText(debt.debt_h)}</dd>
            </div>
          </dl>
          <p className={styles.verdict} data-tone={debt.level === 'low' ? 'good' : 'concern'}>
            <span aria-hidden="true">{debt.level === 'low' ? '✓ ' : '▲ '}</span>
            {debt.level === 'low' ? m.sleep.need.close : m.sleep.need.short(debt.short_nights, debt.nights, debt.level === 'high')}
          </p>
        </>
      ) : null}
      <SleepVsNeed nights={sleep.nights.slice(-14)} />
      <Note>{m.sleep.need.note}</Note>
    </Section>
  );
}

function Timing({ sleep }: { sleep: SleepReport }) {
  const c = sleep.consistency;
  return (
    <Section title={m.sleep.timing.title}>
      {c ? (
        <dl className={blocks.facts}>
          <div>
            <dt>{m.sleep.timing.bedVaries}</dt>
            <dd>
              ±{f.minutes(c.bed_sd_min)}
              <small className={styles.sub}>{m.sleep.timing.range(m.sleep.rating[c.bed_rating], c.earliest_bed, c.latest_bed)}</small>
            </dd>
          </div>
          <div>
            <dt>{m.sleep.timing.wakeVaries}</dt>
            <dd>
              ±{f.minutes(c.wake_sd_min)}
              <small className={styles.sub}>{m.sleep.rating[c.wake_rating]}</small>
            </dd>
          </div>
          {c.social_jetlag_min !== null ? (
            <div>
              <dt>{m.sleep.timing.weekendShift}</dt>
              <dd>
                {c.social_jetlag_min > 0 ? '+' : c.social_jetlag_min < 0 ? '−' : ''}
                {spanText(c.social_jetlag_min)}
                <small className={styles.sub}>{c.social_jetlag_min >= 0 ? m.sleep.timing.later : m.sleep.timing.earlier}</small>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <SleepDiary nights={sleep.nights} target={sleep.tonight?.asleep_by ?? null} />
      <Note>{m.sleep.timing.note}</Note>
    </Section>
  );
}

function Stages({ stages }: { stages: NonNullable<SleepReport['stages']> }) {
  const rows = [
    [m.sleep.stages.deep, stages.deep],
    [m.sleep.stages.rem, stages.rem],
    [m.sleep.stages.light, stages.light],
  ] as const;
  return (
    <Section title={m.sleep.stages.title}>
      <dl className={blocks.facts}>
        {rows.map(([label, stage]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {stage.pct}%
              <small className={styles.sub}>
                {stage.status === 'in_range'
                  ? m.sleep.stages.inRange(stage.ideal[0], stage.ideal[1])
                  : stage.status === 'low'
                    ? m.sleep.stages.below(stage.ideal[0], stage.ideal[1])
                    : m.sleep.stages.above(stage.ideal[0], stage.ideal[1])}
              </small>
            </dd>
          </div>
        ))}
      </dl>
      {stages.rem.status === 'low' ? (
        <p className={blocks.explain}>{m.sleep.stages.remLow}</p>
      ) : null}
      <Note>
        {m.sleep.stages.averages(stages.nights)} {m.notes.sleepScore}
      </Note>
    </Section>
  );
}

function Battery({ stress }: { stress: StressReport }) {
  const b = stress.balance;
  return (
    <Section title={m.sleep.battery.title}>
      {b ? (
        <>
          <dl className={blocks.facts}>
            <div>
              <dt>{m.sleep.battery.charged}</dt>
              <dd>{b.charged_avg}</dd>
            </div>
            <div>
              <dt>{m.sleep.battery.drained}</dt>
              <dd>{b.drained_avg}</dd>
            </div>
            {b.morning_avg !== null ? (
              <div>
                <dt>{m.sleep.battery.mornings}</dt>
                <dd>
                  {b.morning_avg}
                  {b.usual_morning !== null ? <small className={styles.sub}>{m.sleep.battery.usually(b.usual_morning)}</small> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.verdict} data-tone={b.verdict === 'draining' ? 'concern' : 'good'}>
            <span aria-hidden="true">{b.verdict === 'draining' ? '▲ ' : '✓ '}</span>
            {b.verdict === 'draining'
              ? m.sleep.battery.draining(f.signed(b.net_avg, 1), b.deficit_days, b.days)
              : b.verdict === 'building'
                ? m.sleep.battery.building(f.signed(b.net_avg, 1))
                : m.sleep.battery.even(b.deficit_days, b.days)}
          </p>
        </>
      ) : null}
      <BatteryBalance days={stress.days} />
      <Note>
        {m.notes.bodyBattery} {m.sleep.battery.todayNote}
      </Note>
    </Section>
  );
}

function Sources({ sources }: { sources: NonNullable<StressReport['sources']> }) {
  const rows: Array<[string, number]> = [
    [m.sleep.sources.sleep, sources.sleep],
    [m.sleep.sources.naps, sources.nap],
    [m.sleep.sources.restful, sources.everyday_charge],
    [m.sleep.sources.workouts, sources.workouts],
    [m.sleep.sources.stress, sources.stress],
    [m.sleep.sources.restless, sources.recovery],
    [m.sleep.sources.awake, -sources.everyday_drain],
  ];
  return (
    <Section title={m.sleep.sources.title}>
      <div className={blocks.tableWrap} {...scrollRegion(m.sleep.sources.title)}>
        <table className={blocks.table}>
          <thead>
            <tr>
              <th scope="col">{m.sleep.sources.perDay}</th>
              <th scope="col" className={styles.num}>
                Body Battery
              </th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(([, value]) => value !== 0)
              .map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className={styles.num}>
                    {value > 0 ? '+' : '−'}
                    {Math.abs(value)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Note>{m.sleep.sources.note}</Note>
    </Section>
  );
}

function StressTime({ stress }: { stress: StressReport }) {
  const t = stress.stress_time;
  const w = stress.week_pattern;
  if (!t && !w) return null;
  const stressed = (x: { medium_min: number | null; high_min: number | null }) => (x.medium_min ?? 0) + (x.high_min ?? 0);
  return (
    <Section title={m.sleep.stress.title}>
      <dl className={blocks.facts}>
        {t ? (
          <>
            <div>
              <dt>{m.sleep.stress.average}</dt>
              <dd>
                {t.recent.stress}
                {t.before.stress !== null ? <small className={styles.sub}>{m.sleep.stress.before10(t.before.stress)}</small> : null}
              </dd>
            </div>
            <div>
              <dt>{m.sleep.stress.stressedDay}</dt>
              <dd>
                {spanText(stressed(t.recent))}
                <small className={styles.sub}>{m.sleep.stress.before(spanText(stressed(t.before)))}</small>
              </dd>
            </div>
          </>
        ) : null}
        {w ? (
          <div>
            <dt>{m.sleep.stress.workWeekend}</dt>
            <dd>
              {m.sleep.stress.and(String(w.workdays.stress), String(w.weekends.stress))}
              <small className={styles.sub}>{m.sleep.stress.stressedADay(spanText(w.workdays.stressed_min ?? 0), spanText(w.weekends.stressed_min ?? 0))}</small>
            </dd>
          </div>
        ) : null}
      </dl>
      <Note>
        {m.notes.stress} {m.sleep.stress.note}
      </Note>
    </Section>
  );
}
