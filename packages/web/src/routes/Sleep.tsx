import type { SleepReport, StressReport } from '@companion/insights';
import { usePatterns, useSleep } from '../api/hooks.ts';
import { AskClaude } from '../components/AskClaude.tsx';
import { BatteryBalance, SleepDiary, SleepVsNeed } from '../components/charts/SleepCharts.tsx';
import { Note } from '../components/Note.tsx';
import { Patterns } from '../components/Patterns.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { todayLocal } from '../lib/dates.ts';
import { m } from '../lib/i18n.ts';
import { sleepRequests } from '../lib/prompts.ts';
import { hoursText, spanText } from '../lib/sleep.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Sleep.module.css';

/** The patterns that are about sleep and recharge, from "What works for you". */
const SLEEP_PATTERNS = new Set(['bedtime', 'sleep-length', 'evening-runs', 'stress']);

const RATING = { regular: 'regular', variable: 'variable', irregular: 'irregular' } as const;

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
      <h1 className={blocks.title}>Sleep and stress</h1>
      {sleep.nights.length ? (
        <>
          {sleep.tonight ? <Tonight tonight={sleep.tonight} /> : null}
          <SleepNeed sleep={sleep} />
          <Timing sleep={sleep} />
          {sleep.stages ? <Stages stages={sleep.stages} /> : null}
        </>
      ) : (
        <Section title="Sleep">
          <p className={blocks.explain}>
            No sleep recorded in the last four weeks. Wearing the watch at night adds sleep and its timing, HRV, overnight breathing and Body Battery’s
            overnight recharge.
          </p>
        </Section>
      )}
      <Battery stress={stress} />
      <div className={blocks.columns}>
        {stress.sources ? <Sources sources={stress.sources} /> : null}
        <StressTime stress={stress} />
      </div>
      {patterns.data ? (
        <Section title="What affects your sleep">
          <Patterns patterns={patterns.data.filter((p) => SLEEP_PATTERNS.has(p.id))} />
        </Section>
      ) : null}
      <Section title="Ask Claude">
        <AskClaude requests={sleepRequests()} />
      </Section>
    </div>
  );
}

function Tonight({ tonight }: { tonight: NonNullable<SleepReport['tonight']> }) {
  const basis = tonight.wake_basis === 'weekday' ? 'weekday' : tonight.wake_basis === 'weekend' ? 'weekend' : 'usual';
  const needFrom = tonight.need_source === 'default' ? 'A typical adult need' : 'Garmin’s sleep need';
  return (
    <Section title="Tonight">
      {tonight.step ? (
        <>
          <p className={styles.target}>
            Asleep by <strong>{tonight.step.asleep_by}</strong>
          </p>
          <p className={styles.lead}>
            In bed by {tonight.step.in_bed_by}: half an hour earlier than your usual {tonight.usual_bed}, for about {hoursText(tonight.step.hours)} before your{' '}
            {basis} wake-up at {tonight.wake}.
          </p>
          <p className={blocks.explain}>
            {needFrom} tonight is {hoursText(tonight.need_h)}. Meeting it before {tonight.wake} would mean being asleep by {tonight.asleep_by},{' '}
            {spanText(tonight.gap_min)} earlier than you usually fall asleep. A jump that big rarely holds, because the body clock moves slowly; moving 30
            minutes at a time and keeping each step for a few nights does. Morning daylight and a fixed wake-up time help it move.
          </p>
        </>
      ) : (
        <>
          <p className={styles.target}>
            Asleep by <strong>{tonight.asleep_by}</strong>
          </p>
          <p className={styles.lead}>
            In bed by {tonight.in_bed_by} for {hoursText(tonight.need_h)} of sleep before your {basis} wake-up at {tonight.wake}.
          </p>
          <p className={blocks.explain}>
            {needFrom} tonight is {hoursText(tonight.need_h)}, counted back from the time you usually wake on a{' '}
            {basis === 'usual' ? 'day like tomorrow' : basis}.
          </p>
        </>
      )}
      <Note>
        Garmin sets your sleep need each night from your baseline, recent sleep, training load and HRV, so it goes up after hard days and short nights. In bed
        by allows {tonight.settle_min} minutes to fall asleep. The wake-up time is your median over the last four weeks for tomorrow’s kind of day.
      </Note>
    </Section>
  );
}

function SleepNeed({ sleep }: { sleep: SleepReport }) {
  const { debt } = sleep;
  return (
    <Section title="Sleep against need">
      {debt ? (
        <>
          <dl className={blocks.facts}>
            <div>
              <dt>Asleep, last {debt.nights} nights</dt>
              <dd>{hoursText(debt.slept_avg_h)} a night</dd>
            </div>
            <div>
              <dt>Garmin’s need</dt>
              <dd>{hoursText(debt.need_avg_h)} a night</dd>
            </div>
            <div>
              <dt>Missing this week</dt>
              <dd>{hoursText(debt.debt_h)}</dd>
            </div>
          </dl>
          <p className={styles.verdict} data-tone={debt.level === 'low' ? 'good' : 'concern'}>
            <span aria-hidden="true">{debt.level === 'low' ? '✓ ' : '▲ '}</span>
            {debt.level === 'low'
              ? 'You’re close to your need most nights.'
              : `${debt.short_nights} of ${debt.nights} nights were more than half an hour short. ${debt.level === 'high' ? 'That much missing sleep shows up in HRV, mood, appetite and how hard easy runs feel.' : 'Worth catching up before it builds.'}`}
          </p>
        </>
      ) : null}
      <SleepVsNeed nights={sleep.nights.slice(-14)} />
      <Note>
        Debt is the sum of what each night fell short of Garmin’s need; a long night doesn’t cancel a short one hour for hour. One or two longer nights help,
        but earlier nights help more than lie-ins, because lie-ins push the body clock later.
      </Note>
    </Section>
  );
}

function Timing({ sleep }: { sleep: SleepReport }) {
  const c = sleep.consistency;
  return (
    <Section title="When you sleep">
      {c ? (
        <dl className={blocks.facts}>
          <div>
            <dt>Bedtime varies by</dt>
            <dd>
              ±{c.bed_sd_min} min
              <small className={styles.sub}>
                {RATING[c.bed_rating]}, {c.earliest_bed} to {c.latest_bed}
              </small>
            </dd>
          </div>
          <div>
            <dt>Wake-up varies by</dt>
            <dd>
              ±{c.wake_sd_min} min<small className={styles.sub}>{RATING[c.wake_rating]}</small>
            </dd>
          </div>
          {c.social_jetlag_min !== null ? (
            <div>
              <dt>Weekend shift</dt>
              <dd>
                {c.social_jetlag_min > 0 ? '+' : c.social_jetlag_min < 0 ? '−' : ''}
                {spanText(c.social_jetlag_min)}
                <small className={styles.sub}>{c.social_jetlag_min >= 0 ? 'later' : 'earlier'} than weeknights</small>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <SleepDiary nights={sleep.nights} target={sleep.tonight?.asleep_by ?? null} />
      <Note>
        The spread is the standard deviation over the last two weeks: under 30 minutes is regular, over an hour is irregular. The weekend shift compares the
        middle of your sleep on weekend nights with weeknights; over an hour works like flying a time zone away every weekend and back on Monday. Regular timing
        is linked to better sleep and daytime energy even at the same number of hours.
      </Note>
    </Section>
  );
}

function Stages({ stages }: { stages: NonNullable<SleepReport['stages']> }) {
  const rows = [
    ['Deep', stages.deep],
    ['REM', stages.rem],
    ['Light', stages.light],
  ] as const;
  return (
    <Section title="Sleep stages">
      <dl className={blocks.facts}>
        {rows.map(([label, stage]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {stage.pct}%
              <small className={styles.sub}>
                {stage.status === 'in_range'
                  ? `in Garmin’s ${stage.ideal[0]}–${stage.ideal[1]}%`
                  : `${stage.status === 'low' ? 'below' : 'above'} Garmin’s ${stage.ideal[0]}–${stage.ideal[1]}%`}
              </small>
            </dd>
          </div>
        ))}
      </dl>
      {stages.rem.status === 'low' ? (
        <p className={blocks.explain}>
          REM comes mostly in the last hours of the night, so short nights and early alarms cut it first. More time asleep, not anything else, is what brings it
          back. Alcohol in the evening also suppresses it.
        </p>
      ) : null}
      <Note>
        Averages over the last {stages.nights} nights. {m.notes.sleepScore}
      </Note>
    </Section>
  );
}

function Battery({ stress }: { stress: StressReport }) {
  const b = stress.balance;
  return (
    <Section title="Body Battery">
      {b ? (
        <>
          <dl className={blocks.facts}>
            <div>
              <dt>Charged a day</dt>
              <dd>{b.charged_avg}</dd>
            </div>
            <div>
              <dt>Drained a day</dt>
              <dd>{b.drained_avg}</dd>
            </div>
            {b.morning_avg !== null ? (
              <div>
                <dt>Mornings</dt>
                <dd>
                  {b.morning_avg}
                  {b.usual_morning !== null ? <small className={styles.sub}>usually {b.usual_morning}</small> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.verdict} data-tone={b.verdict === 'draining' ? 'concern' : 'good'}>
            <span aria-hidden="true">{b.verdict === 'draining' ? '▲ ' : '✓ '}</span>
            {b.verdict === 'draining'
              ? `Over the last two weeks your days drained more than your nights charged (${b.net_avg} a day, ${b.deficit_days} of ${b.days} days in the red). That gap is what makes mornings start lower.`
              : b.verdict === 'building'
                ? `Your nights are charging more than your days use (+${b.net_avg} a day over two weeks).`
                : `Charging and draining are roughly even over the last two weeks (${b.deficit_days} of ${b.days} days drained more than they charged).`}
          </p>
        </>
      ) : null}
      <BatteryBalance days={stress.days} />
      <Note>{m.notes.bodyBattery} Today isn’t in the averages because it’s still running.</Note>
    </Section>
  );
}

function Sources({ sources }: { sources: NonNullable<StressReport['sources']> }) {
  const rows: Array<[string, number]> = [
    ['Sleep', sources.sleep],
    ['Naps', sources.nap],
    ['Restful spells while awake', sources.everyday_charge],
    ['Workouts', sources.workouts],
    ['Stressful spells', sources.stress],
    ['Restless rest periods', sources.recovery],
    ['Everyday awake drain', -sources.everyday_drain],
  ];
  return (
    <Section title="Where it goes">
      <div className={blocks.tableWrap}>
        <table className={blocks.table}>
          <thead>
            <tr>
              <th scope="col">Per day, 4 weeks</th>
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
      <Note>
        Garmin tags part of each day to events: sleep, naps, workouts, stressful spells, and rest periods that didn’t recharge. The rest is the steady cost of
        being awake and the small top-ups of sitting still. Sleep is almost the whole charging side, so it decides whether the day ends in credit.
      </Note>
    </Section>
  );
}

function StressTime({ stress }: { stress: StressReport }) {
  const t = stress.stress_time;
  const w = stress.week_pattern;
  if (!t && !w) return null;
  const stressed = (x: { medium_min: number | null; high_min: number | null }) => (x.medium_min ?? 0) + (x.high_min ?? 0);
  return (
    <Section title="Stress">
      <dl className={blocks.facts}>
        {t ? (
          <>
            <div>
              <dt>Average stress</dt>
              <dd>
                {t.recent.stress}
                {t.before.stress !== null ? <small className={styles.sub}>{t.before.stress} the 10 weeks before</small> : null}
              </dd>
            </div>
            <div>
              <dt>Medium or high, a day</dt>
              <dd>
                {spanText(stressed(t.recent))}
                <small className={styles.sub}>{spanText(stressed(t.before))} before</small>
              </dd>
            </div>
          </>
        ) : null}
        {w ? (
          <div>
            <dt>Workdays against weekends</dt>
            <dd>
              {w.workdays.stress} and {w.weekends.stress}
              <small className={styles.sub}>
                stressed {spanText(w.workdays.stressed_min ?? 0)} and {spanText(w.weekends.stressed_min ?? 0)} a day
              </small>
            </dd>
          </div>
        ) : null}
      </dl>
      <Note>
        {m.notes.stress} The last two weeks here, against the ten weeks before; workdays and weekends over eight weeks. Time at rest and asleep isn’t counted as
        stressed.
      </Note>
    </Section>
  );
}
