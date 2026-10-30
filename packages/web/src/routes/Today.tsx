import type { BaselineBandsResponse, TodayResponse } from '@companion/queries';
import { Link } from 'react-router';
import { useBaselines, useDaily, useSignals, useToday } from '../api/hooks.ts';
import { Signals } from '../components/Signals.tsx';
import { AskClaude } from '../components/AskClaude.tsx';
import { LoadChart } from '../components/charts/LoadChart.tsx';
import { SleepStages } from '../components/charts/SleepStages.tsx';
import { KeyNotice } from '../components/KeyNotice.tsx';
import { Lane } from '../components/Lane.tsx';
import { Note } from '../components/Note.tsx';
import { RunSummary } from '../components/RunSummary.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { SyncButton } from '../components/SyncButton.tsx';
import { WhenToRun } from '../components/WhenToRun.tsx';
import { addDays, hoursMinutes, longDay } from '../lib/dates.ts';
import { todayRequests } from '../lib/prompts.ts';
import { describeAcwr, describeForm, NOTES, relativeToNormal, signed, STATUS_TEXT, type Status } from '../lib/insights.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Today.module.css';

const CHART_DAYS = 42;

export function Today() {
  const today = useToday();
  const date = today.data?.date;
  const daily = useDaily(date && addDays(date, -(CHART_DAYS - 1)), date);
  const baselines = useBaselines(date);
  const signals = useSignals(date);

  if (today.isPending) return <Loading />;
  if (today.isError) return <ErrorState error={today.error} retry={() => void today.refetch()} />;

  const t = today.data;
  const status: Status | null = t.status;
  const bands = baselines.data;
  const sleepNeed = t.recovery.sleep_need_h;
  const fitnessAge = t.body.fitness_age;
  const lever = fitnessAge?.biggest_lever;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <p className={styles.date}>{longDay(t.date)}</p>
        <SyncButton lastSync={t.data_freshness.last_sync} />
      </header>

      <KeyNotice />

      {/* The one loud element on the page: today's verdict, as a sentence. */}
      <section className={styles.verdict} data-status={status ?? 'none'} aria-live="polite">
        <p className={styles.badge}>
          <span className={styles.dot} aria-hidden="true" />
          {status ? STATUS_TEXT[status].label : 'No status yet'}
        </p>
        <h1 className={styles.headline}>{status ? STATUS_TEXT[status].title : 'Not enough recovery data yet.'}</h1>
        {t.reasons.length ? (
          <ul className={styles.reasons}>
            {t.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.detail}>{status ? STATUS_TEXT[status].detail : 'Sync after a night with the watch on to get a status.'}</p>
        )}
      </section>

      {signals.data?.length ? (
        <Section title="Worth knowing">
          <Signals signals={signals.data} />
        </Section>
      ) : null}

      <div className={styles.columns}>
        <Section title="Recovery">
          <Lane
            label="HRV, 7-day average"
            valueText={t.recovery.hrv_7d_ms ? `${t.recovery.hrv_7d_ms} ms` : '–'}
            description={relativeToNormal(t.recovery.hrv_7d_ms, t.recovery.hrv_normal_ms)}
            value={t.recovery.hrv_7d_ms}
            band={bands?.hrv_ms}
            concernWhen="below"
          >
            <Note>{NOTES.hrv}</Note>
          </Lane>
          <Lane
            label="Resting heart rate"
            valueText={t.recovery.resting_hr_3d ? `${t.recovery.resting_hr_3d} bpm` : '–'}
            description={relativeToNormal(t.recovery.resting_hr_3d, t.recovery.resting_hr_normal, 'bpm')}
            value={t.recovery.resting_hr_3d}
            band={bands?.resting_hr}
            concernWhen="above"
          >
            <Note>{NOTES.restingHr}</Note>
          </Lane>
          <Lane
            label="Sleep last night"
            valueText={hoursMinutes(t.recovery.sleep_h)}
            description={
              t.recovery.sleep_h === null
                ? 'No sleep recorded for last night yet'
                : `${relativeToNormal(t.recovery.sleep_h, bands?.sleep_h?.typical, 'h')}${sleepNeed ? `. Garmin estimates you needed ${hoursMinutes(sleepNeed)}` : ''}`
            }
            value={t.recovery.sleep_h}
            band={bands?.sleep_h}
            concernWhen="below"
            target={sleepNeed ? { value: sleepNeed, label: 'Need' } : null}
          >
            <Note>{NOTES.sleep}</Note>
          </Lane>
        </Section>

        <Section title="Training">
          <div className={styles.formRow}>
            <p className={styles.bigNumber}>
              {signed(t.training.form)}
              <small>form</small>
            </p>
            <p className={blocks.explain}>{describeForm(t.training.form)}</p>
          </div>
          {daily.data ? <LoadChart days={daily.data} /> : <Loading label="Loading chart" />}
          <dl className={blocks.facts}>
            <div>
              <dt>Last 7 days</dt>
              <dd>{t.training.km_last_7d ?? 0} km</dd>
            </div>
            <div>
              <dt>Last 28 days</dt>
              <dd>{t.training.km_last_28d ?? 0} km</dd>
            </div>
            <div>
              <dt>This week vs. usual</dt>
              <dd>{t.training.acute_chronic_ratio ?? '–'}×</dd>
            </div>
          </dl>
          <p className={blocks.explain}>{describeAcwr(t.training.acute_chronic_ratio)}</p>
          <Note>
            {NOTES.form} {NOTES.acwr}
          </Note>
        </Section>
      </div>

      <LastWeekLink date={t.date} />

      <div className={styles.columns}>
        <LastNight sleep={t.day.sleep} bands={bands} />
        <EnergyAndActivity day={t.day} bands={bands} />
      </div>

      <WhenToRun />

      <Section title="Ask Claude">
        <AskClaude requests={todayRequests(t.date)} />
      </Section>

      {t.last_run ? (
        <Section title="Last run">
          <RunSummary run={t.last_run} />
        </Section>
      ) : null}

      <Section title="Body">
          <dl className={blocks.facts}>
            <div>
              <dt>Weight trend</dt>
              <dd>{t.body.weight_trend_kg ?? '–'} kg</dd>
            </div>
            <div>
              <dt>Body fat trend</dt>
              <dd>{t.body.body_fat_trend_pct ?? '–'}%</dd>
            </div>
            {fitnessAge?.fitness_age ? (
              <div>
                <dt>Fitness age</dt>
                <dd>
                  {fitnessAge.fitness_age}
                  {fitnessAge.actual_age ? <small className={styles.unit}> (actual {fitnessAge.actual_age})</small> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          {lever ? (
            <p className={blocks.explain}>
              Garmin’s biggest lever for your fitness age: {lever.label.toLowerCase()}, {lever.value}
              {lever.unit} now, {lever.target}
              {lever.unit} as its target.
            </p>
          ) : null}
          <Note>
            {NOTES.weight} {NOTES.fitnessAge}
          </Note>
        </Section>
    </div>
  );
}

type Day = TodayResponse['day'];
type Bands = BaselineBandsResponse | undefined;

/** Last night beyond its length: the score, how it divided into stages, and the two overnight vital signs. */
function LastNight({ sleep, bands }: { sleep: Day['sleep']; bands: Bands }) {
  if (!sleep) {
    return (
      <Section title="Last night">
        <p className={blocks.empty}>No sleep recorded for last night yet.</p>
      </Section>
    );
  }
  return (
    <Section title="Last night">
      <dl className={blocks.facts}>
        <div>
          <dt>Sleep score</dt>
          <dd>
            {sleep.score ?? '–'}
            {sleep.score_qualifier ? <small className={styles.unit}> {sleep.score_qualifier.toLowerCase()}</small> : null}
          </dd>
        </div>
        <div>
          <dt>Asleep</dt>
          <dd>
            {sleep.bedtime ?? '–'}
            <small className={styles.unit}> to </small>
            {sleep.wake_time ?? '–'}
          </dd>
        </div>
        <div>
          <dt>Woke up</dt>
          <dd>
            {sleep.awake_count ?? '–'}
            <small className={styles.unit}> {sleep.awake_count === 1 ? 'time' : 'times'}</small>
          </dd>
        </div>
      </dl>
      <SleepStages stages={sleep.stages_h} />
      <Note>{NOTES.sleepScore}</Note>
      <Lane
        label="Breathing rate"
        valueText={sleep.breathing_rate ? `${sleep.breathing_rate} /min` : '–'}
        description={relativeToNormal(sleep.breathing_rate, bands?.breathing_rate?.typical, 'breaths/min', 1)}
        value={sleep.breathing_rate}
        band={bands?.breathing_rate}
        concernWhen="above"
        concernBeyond={bands?.breathing_rate ? bands.breathing_rate.typical + 1 : null}
      >
        <Note>{NOTES.breathing}</Note>
      </Lane>
      <Lane
        label="Blood oxygen (SpO2)"
        valueText={sleep.spo2_avg_pct ? `${sleep.spo2_avg_pct}%` : '–'}
        description={`${relativeToNormal(sleep.spo2_avg_pct, bands?.spo2_pct?.typical, 'points', 1)}${sleep.spo2_lowest_pct ? `. Lowest ${sleep.spo2_lowest_pct}%` : ''}`}
        value={sleep.spo2_avg_pct}
        band={bands?.spo2_pct}
        concernWhen="below"
        concernBeyond={bands?.spo2_pct ? bands.spo2_pct.typical - 2 : null}
      >
        <Note>{NOTES.spo2}</Note>
      </Lane>
    </Section>
  );
}

/** How much energy the night gave back, how hard yesterday was on the nervous system, and everyday movement. */
function EnergyAndActivity({ day, bands }: { day: Day; bands: Bands }) {
  const { energy, activity } = day;
  const intensityLeft = activity.intensity_goal_week && activity.intensity_minutes_week !== null ? activity.intensity_goal_week - activity.intensity_minutes_week : null;
  return (
    <Section title="Energy and activity">
      <Lane
        label="Body Battery this morning"
        valueText={energy.body_battery_morning !== null ? String(energy.body_battery_morning) : '–'}
        description={relativeToNormal(energy.body_battery_morning, bands?.body_battery_morning?.typical, 'points', 3)}
        value={energy.body_battery_morning}
        band={bands?.body_battery_morning}
        concernWhen="below"
      >
        <Note>{NOTES.bodyBattery}</Note>
      </Lane>
      <Lane
        label="Stress yesterday"
        valueText={energy.stress_yesterday_avg !== null ? String(energy.stress_yesterday_avg) : '–'}
        description={`${relativeToNormal(energy.stress_yesterday_avg, bands?.stress_avg?.typical, 'points', 2)}${energy.stress_yesterday_high_min ? `. ${energy.stress_yesterday_high_min} min of high stress` : ''}`}
        value={energy.stress_yesterday_avg}
        band={bands?.stress_avg}
        concernWhen="above"
      >
        <Note>{NOTES.stress}</Note>
      </Lane>
      <dl className={blocks.facts}>
        <div>
          <dt>Steps today</dt>
          <dd>{activity.steps_today?.toLocaleString('en-GB') ?? '–'}</dd>
        </div>
        <div>
          <dt>Steps yesterday</dt>
          <dd>{activity.steps_yesterday?.toLocaleString('en-GB') ?? '–'}</dd>
        </div>
        <div>
          <dt>Intensity minutes this week</dt>
          <dd>
            {activity.intensity_minutes_week ?? '–'}
            {activity.intensity_goal_week ? <small className={styles.unit}> / {activity.intensity_goal_week}</small> : null}
          </dd>
        </div>
      </dl>
      <p className={blocks.explain}>
        {intensityLeft === null ? '' : intensityLeft <= 0 ? 'Weekly movement target reached.' : `${intensityLeft} intensity minutes to this week’s target.`}
        {activity.calories_yesterday ? ` Yesterday you burned about ${activity.calories_yesterday.toLocaleString('en-GB')} kcal.` : ''}
      </p>
      <Note>{NOTES.intensityMinutes}</Note>
    </Section>
  );
}

/** On Mondays and Tuesdays, a pointer to last week's report: the natural moment to look back. */
function LastWeekLink({ date }: { date: string }) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (weekday !== 1 && weekday !== 2) return null;
  const lastMonday = addDays(date, -(weekday === 1 ? 7 : 8));
  return (
    <p className={styles.lastWeek}>
      <Link to={`/week?start=${lastMonday}`}>Last week’s report is ready</Link>: how training, recovery and sleep went, and a button to have Claude review it.
    </p>
  );
}
