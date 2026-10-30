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
import { describeAcwr, describeForm, greenDetail, recentlyRecorded, relativeToNormal, signed, statusText, type Status } from '../lib/insights.ts';
import { f, m } from '../lib/i18n.ts';
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
  // What this watch records at all. A stream with nothing in the last month gets a sentence, not empty gauges.
  const records = {
    hrv: recentlyRecorded(t.data_freshness.hrv, t.date),
    sleep: recentlyRecorded(t.data_freshness.sleep, t.date, 14),
  };
  const detail =
    status === 'green'
      ? greenDetail({ hrv: t.recovery.hrv_7d_ms !== null, restingHr: t.recovery.resting_hr_3d !== null, sleep: t.recovery.sleep_h !== null })
      : status
        ? statusText(status).detail
        : null;
  const hasBody = t.body.weight_trend_kg !== null || t.body.body_fat_trend_pct !== null || !!fitnessAge?.fitness_age;

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
          {statusText(status).label}
        </p>
        <h1 className={styles.headline}>{statusText(status).title}</h1>
        {t.reasons.length ? (
          <ul className={styles.reasons}>
            {t.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.detail}>{detail ?? m.insight.status.none.detail}</p>
        )}
      </section>

      {signals.data?.length ? (
        <Section title={m.today.worthKnowing}>
          <Signals signals={signals.data} />
        </Section>
      ) : null}

      <div className={styles.columns}>
        <Section title={m.today.recovery}>
          {records.hrv ? (
            <Lane
              label={m.today.hrv7d}
              valueText={t.recovery.hrv_7d_ms ? `${f.number(t.recovery.hrv_7d_ms)} ms` : '–'}
              description={relativeToNormal(t.recovery.hrv_7d_ms, t.recovery.hrv_normal_ms)}
              value={t.recovery.hrv_7d_ms}
              band={bands?.hrv_ms}
              concernWhen="below"
            >
              <Note>{m.notes.hrv}</Note>
            </Lane>
          ) : null}
          <Lane
            label={m.today.restingHr}
            valueText={t.recovery.resting_hr_3d ? `${Math.round(t.recovery.resting_hr_3d)} bpm` : '–'}
            description={relativeToNormal(t.recovery.resting_hr_3d, t.recovery.resting_hr_normal, 'bpm')}
            value={t.recovery.resting_hr_3d}
            band={bands?.resting_hr}
            concernWhen="above"
          >
            <Note>{m.notes.restingHr}</Note>
          </Lane>
          <Lane
            label={m.today.sleepLastNight}
            valueText={hoursMinutes(t.recovery.sleep_h)}
            description={
              !records.sleep
                ? m.today.noSleepRecently
                : t.recovery.sleep_h === null
                  ? m.today.noSleepYet
                  : `${relativeToNormal(t.recovery.sleep_h, bands?.sleep_h?.typical, 'h')}${sleepNeed ? `. ${m.today.garminNeed(hoursMinutes(sleepNeed))}` : ''}`
            }
            value={t.recovery.sleep_h}
            band={bands?.sleep_h}
            concernWhen="below"
            target={sleepNeed ? { value: sleepNeed, label: m.today.need } : null}
          >
            <Note>{m.notes.sleep}</Note>
          </Lane>
        </Section>

        <Section title={m.today.training}>
          <div className={styles.formRow}>
            <p className={styles.bigNumber}>
              {signed(t.training.form)}
              <small>{m.today.form}</small>
            </p>
            <p className={blocks.explain}>{describeForm(t.training.form)}</p>
          </div>
          {daily.data ? <LoadChart days={daily.data} /> : <Loading label={m.today.loadingChart} />}
          <dl className={blocks.facts}>
            <div>
              <dt>{m.today.last7}</dt>
              <dd>{f.distance(t.training.km_last_7d ?? 0)}</dd>
            </div>
            <div>
              <dt>{m.today.last28}</dt>
              <dd>{f.distance(t.training.km_last_28d ?? 0)}</dd>
            </div>
            <div>
              <dt>{m.today.vsUsual}</dt>
              <dd>{f.number(t.training.acute_chronic_ratio, 2)}×</dd>
            </div>
          </dl>
          <p className={blocks.explain}>{describeAcwr(t.training.acute_chronic_ratio)}</p>
          <Note>
            {m.notes.form} {m.notes.acwr}
          </Note>
        </Section>
      </div>

      <LastWeekLink date={t.date} />

      <div className={styles.columns}>
        {records.sleep ? <LastNight sleep={t.day.sleep} bands={bands} /> : null}
        <EnergyAndActivity day={t.day} bands={bands} />
      </div>

      <WhenToRun />

      <Section title={m.today.askClaude}>
        <AskClaude requests={todayRequests(t.date)} />
      </Section>

      {t.last_run ? (
        <Section title={m.today.lastRun}>
          <RunSummary run={t.last_run} />
        </Section>
      ) : null}

      {hasBody ? (
        <Section title={m.today.body}>
          <dl className={blocks.facts}>
            {t.body.weight_trend_kg !== null ? (
              <div>
                <dt>{m.today.weightTrend}</dt>
                <dd>{f.weight(t.body.weight_trend_kg)}</dd>
              </div>
            ) : null}
            {t.body.body_fat_trend_pct !== null ? (
              <div>
                <dt>{m.today.bodyFatTrend}</dt>
                <dd>{f.percent(t.body.body_fat_trend_pct, 1)}</dd>
              </div>
            ) : null}
            {fitnessAge?.fitness_age ? (
              <div>
                <dt>{m.today.fitnessAge}</dt>
                <dd>
                  {fitnessAge.fitness_age}
                  {fitnessAge.actual_age ? <small className={styles.unit}> {m.today.actualAge(fitnessAge.actual_age)}</small> : null}
                </dd>
              </div>
            ) : null}
          </dl>
          {lever ? (
            <p className={blocks.explain}>{m.today.lever(lever.label.toLowerCase(), `${f.number(lever.value, 1)}${lever.unit}`, `${f.number(lever.target, 1)}${lever.unit}`)}</p>
          ) : null}
          <Note>
            {m.notes.weight} {m.notes.fitnessAge}
          </Note>
        </Section>
      ) : null}
    </div>
  );
}

type Day = TodayResponse['day'];
type Bands = BaselineBandsResponse | undefined;

/** Last night beyond its length: the score, how it divided into stages, and the two overnight vital signs. */
function LastNight({ sleep, bands }: { sleep: Day['sleep']; bands: Bands }) {
  if (!sleep) {
    return (
      <Section title={m.today.lastNight}>
        <p className={blocks.empty}>{m.today.noSleepYet}.</p>
      </Section>
    );
  }
  return (
    <Section title={m.today.lastNight}>
      <dl className={blocks.facts}>
        <div>
          <dt>{m.today.sleepScore}</dt>
          <dd>
            {sleep.score ?? '–'}
            {sleep.score_qualifier ? <small className={styles.unit}> {m.today.qualifier[sleep.score_qualifier] ?? sleep.score_qualifier.toLowerCase()}</small> : null}
          </dd>
        </div>
        <div>
          <dt>{m.today.asleep}</dt>
          <dd>
            {sleep.bedtime ?? '–'}
            <small className={styles.unit}> {m.today.to} </small>
            {sleep.wake_time ?? '–'}
          </dd>
        </div>
        <div>
          <dt>{m.today.wokeUp}</dt>
          <dd>
            {sleep.awake_count ?? '–'}
            <small className={styles.unit}> {m.today.times(sleep.awake_count ?? 0)}</small>
          </dd>
        </div>
      </dl>
      <SleepStages stages={sleep.stages_h} />
      <Note>{m.notes.sleepScore}</Note>
      <Lane
        label={m.today.breathingRate}
        valueText={sleep.breathing_rate ? `${f.number(sleep.breathing_rate, 1)} ${m.today.perMinute}` : '–'}
        description={relativeToNormal(sleep.breathing_rate, bands?.breathing_rate?.typical, 'breaths', 1)}
        value={sleep.breathing_rate}
        band={bands?.breathing_rate}
        concernWhen="above"
        concernBeyond={bands?.breathing_rate ? bands.breathing_rate.typical + 1 : null}
      >
        <Note>{m.notes.breathing}</Note>
      </Lane>
      <Lane
        label={m.today.spo2}
        valueText={sleep.spo2_avg_pct ? `${sleep.spo2_avg_pct}%` : '–'}
        description={`${relativeToNormal(sleep.spo2_avg_pct, bands?.spo2_pct?.typical, 'points', 1)}${sleep.spo2_lowest_pct ? `. ${m.today.lowest(f.percent(sleep.spo2_lowest_pct))}` : ''}`}
        value={sleep.spo2_avg_pct}
        band={bands?.spo2_pct}
        concernWhen="below"
        concernBeyond={bands?.spo2_pct ? bands.spo2_pct.typical - 2 : null}
      >
        <Note>{m.notes.spo2}</Note>
      </Lane>
    </Section>
  );
}

/** How much energy the night gave back, how hard yesterday was on the nervous system, and everyday movement. */
function EnergyAndActivity({ day, bands }: { day: Day; bands: Bands }) {
  const { energy, activity } = day;
  const intensityLeft =
    activity.intensity_goal_week && activity.intensity_minutes_week !== null ? activity.intensity_goal_week - activity.intensity_minutes_week : null;
  return (
    <Section title={m.today.energy}>
      <Lane
        label={m.today.bodyBattery}
        valueText={energy.body_battery_morning !== null ? String(energy.body_battery_morning) : '–'}
        description={relativeToNormal(energy.body_battery_morning, bands?.body_battery_morning?.typical, 'points', 3)}
        value={energy.body_battery_morning}
        band={bands?.body_battery_morning}
        concernWhen="below"
      >
        <Note>{m.notes.bodyBattery}</Note>
      </Lane>
      <Lane
        label={m.today.stressYesterday}
        valueText={energy.stress_yesterday_avg !== null ? String(energy.stress_yesterday_avg) : '–'}
        description={`${relativeToNormal(energy.stress_yesterday_avg, bands?.stress_avg?.typical, 'points', 2)}${energy.stress_yesterday_high_min ? `. ${m.today.highStress(energy.stress_yesterday_high_min)}` : ''}`}
        value={energy.stress_yesterday_avg}
        band={bands?.stress_avg}
        concernWhen="above"
      >
        <Note>{m.notes.stress}</Note>
      </Lane>
      <dl className={blocks.facts}>
        <div>
          <dt>{m.today.stepsToday}</dt>
          <dd>{f.number(activity.steps_today)}</dd>
        </div>
        <div>
          <dt>{m.today.stepsYesterday}</dt>
          <dd>{f.number(activity.steps_yesterday)}</dd>
        </div>
        <div>
          <dt>{m.today.intensityWeek}</dt>
          <dd>
            {activity.intensity_minutes_week ?? '–'}
            {activity.intensity_goal_week ? <small className={styles.unit}> / {activity.intensity_goal_week}</small> : null}
          </dd>
        </div>
      </dl>
      <p className={blocks.explain}>
        {intensityLeft === null ? '' : intensityLeft <= 0 ? m.today.targetReached : m.today.intensityLeft(intensityLeft)}
        {activity.calories_yesterday ? ` ${m.today.burned(f.number(activity.calories_yesterday))}` : ''}
      </p>
      <Note>{m.notes.intensityMinutes}</Note>
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
      <Link to={`/week?start=${lastMonday}`}>{m.today.lastWeekLink}</Link>
      {m.today.lastWeekRest}
    </p>
  );
}
