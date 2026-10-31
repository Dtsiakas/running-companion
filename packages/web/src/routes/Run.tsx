import type { ActivityResponse } from '@companion/queries';
import { Link, useParams } from 'react-router';
import { fuelPlan } from '@companion/insights/fuel';
import { lazy, Suspense } from 'react';
import { useActivity, useActivityRecords, useBody, useMapConfig, useRoute } from '../api/hooks.ts';
import { PlanView } from '../components/FuelPlanner.tsx';
import { AskClaude } from '../components/AskClaude.tsx';
import { runDebriefRequest } from '../lib/prompts.ts';
import { IntensityBar } from '../components/charts/IntensityBar.tsx';
import { RunCharts } from '../components/charts/RunCharts.tsx';
import { Note } from '../components/Note.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { longDay, todayLocal } from '../lib/dates.ts';
import { paceGap, stripPace } from '../lib/format.ts';
import { current, f, m } from '../lib/i18n.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Run.module.css';
import { scrollRegion } from '../lib/a11y.ts';
import { NONE } from '@companion/i18n';

type Activity = ActivityResponse;

// The map library is about 40 KB; it loads only when a run with GPS is opened.
const RouteMap = lazy(() => import('../components/map/RouteMap.tsx'));
type Fact = [label: string, value: string | number | null | undefined, unit?: string];

/**
 * One run in full. Order follows the questions you ask after a run: how did it go (headline numbers),
 * what happened along the way (charts), did I run the workout as planned, then the detail (laps, form, efficiency).
 */
export function Run() {
  const { id } = useParams();
  const activity = useActivity(id);
  const records = useActivityRecords(id);

  return (
    <div className={blocks.page}>
      <Link to="/runs" className={blocks.back}>
        {m.run.allRuns}
      </Link>
      {activity.isPending ? (
        <Loading />
      ) : activity.isError ? (
        <ErrorState error={activity.error} retry={() => void activity.refetch()} />
      ) : (
        <RunBody run={activity.data}>{records.data ? <RunCharts records={records.data} /> : records.isError ? <ErrorState error={records.error} /> : <Loading label={m.run.loadingCharts} />}</RunBody>
      )}
    </div>
  );
}

function RunBody({ run, children: charts }: { run: Activity; children: React.ReactNode }) {
  const d = run.details;
  const kind = run.planned_workout ? m.run.planned(run.planned_workout) : m.run.category[run.category ?? 'other'];
  const startTime = run.start_local?.slice(11, 16);

  return (
    <>
      <header className={styles.header}>
        <h1 className={blocks.title}>{run.name ?? m.run.run}</h1>
        <p className={styles.meta}>
          {run.date ? longDay(run.date) : ''}
          {startTime ? ` ${m.run.at(startTime)}` : ''}. {kind}
          {run.treadmill ? `, ${m.run.treadmill}` : ''}.
        </p>
      </header>

      <dl className={blocks.stats}>
        <Stat label={m.run.distance} value={f.number(f.distanceValue(run.distance_km), 2, true)} unit={f.distanceUnit} />
        <Stat label={m.run.time} value={run.duration} />
        <Stat label={m.run.pace} value={stripPace(run.pace)} unit={f.paceUnit} />
        <Stat label={m.run.heartRate} value={run.avg_hr} unit={run.max_hr ? m.run.max(run.max_hr) : 'bpm'} />
        <Stat label={m.run.load} value={run.load_trimp} />
        {run.avg_power_w ? <Stat label={m.run.power} value={run.avg_power_w} unit="W" /> : null}
      </dl>
      {run.treadmill ? <p className={blocks.explain}>{m.run.treadmillNote}</p> : null}

      <RunRoute id={run.activity_id!} />
      {run.weather ? <Conditions run={run} weather={run.weather} /> : null}
      <Section title={m.run.overTheRun}>{charts}</Section>

      {run.executed_steps?.length ? (
        <Section title={m.run.plannedVsActual}>
          <PlannedVsActual steps={run.executed_steps} />
          <Note>{m.notes.plannedVsActual}</Note>
        </Section>
      ) : null}

      <Section title={m.run.laps}>
        <Laps laps={run.laps} />
      </Section>

      <div className={blocks.columns}>
        <Section title={m.run.effort}>
          <IntensityBar intensity={run.intensity_pct} />
          <Facts
            facts={[
              [m.run.aerobic, f.number(d.aerobic_te, 1)],
              [m.run.anaerobic, f.number(d.anaerobic_te, 1)],
              [m.run.yourRpe, run.rpe, '/ 10'],
            ]}
          />
          {run.garmin_te ? <p className={blocks.explain}>{m.run.garminRated(m.run.teLabel[run.garmin_te] ?? run.garmin_te.replace(/_/g, ' ').toLowerCase())}</p> : null}
          <Note>
            {m.notes.intensity} {m.notes.trainingEffect}
          </Note>
        </Section>

        <Section title={m.run.efficiency}>
          <Facts
            facts={[
              [m.run.metresPerBeat, f.number(run.m_per_beat, 3)],
              [m.run.paceAtRefHr, stripPace(run.pace_at_ref_hr), f.paceUnit],
              [m.run.decoupling, f.number(run.decoupling_pct, 1), '%'],
              [m.run.elevationGain, d.elevation_gain_m === null ? null : f.elevation(d.elevation_gain_m)],
              [m.run.gap, stripPace(d.avg_gap_pace), f.paceUnit],
              [m.run.temperature, d.temperature_c === null ? null : f.temperature(d.temperature_c)],
            ]}
          />
          <Note>
            {m.notes.efficiency} {m.notes.paceAtRefHr} {m.notes.decoupling}
          </Note>
        </Section>
      </div>

      <div className={blocks.columns}>
        <Section title={m.run.form}>
          <Facts
            facts={[
              [m.run.cadence, run.cadence_spm, 'spm'],
              [m.run.stepLength, f.number(d.avg_step_length_m, 2), 'm'],
              [m.run.groundContact, f.number(d.avg_gct_ms), 'ms'],
              [m.run.verticalRatio, f.number(d.avg_vertical_ratio_pct, 1), '%'],
              [m.run.verticalOscillation, d.avg_vertical_oscillation_mm === null ? null : f.number(d.avg_vertical_oscillation_mm / 10, 1), 'cm'],
            ]}
          />
          <Note>{m.notes.runningForm}</Note>
        </Section>

        {run.best_efforts.length ? (
          <Section title={m.run.fastest}>
            <table className={blocks.table}>
              <thead>
                <tr>
                  <th scope="col">{m.run.distance}</th>
                  <th scope="col">{m.run.time}</th>
                  <th scope="col">{m.run.pace}</th>
                </tr>
              </thead>
              <tbody>
                {run.best_efforts.map((effort) => (
                  <tr key={effort.distance}>
                    <th scope="row">{effort.distance}</th>
                    <td>{effort.time}</td>
                    <td>{effort.pace}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ) : null}
      </div>

      <RunFuel run={run} />

      <Section title={m.run.askClaude}>
        <AskClaude requests={[runDebriefRequest(run.activity_id!, run.name ?? m.run.run, run.date!)]} />
      </Section>
    </>
  );
}

function RunRoute({ id }: { id: number }) {
  const route = useRoute(String(id));
  const map = useMapConfig();
  if (!route.data || !map.data) return null;
  return (
    <Section title={m.run.route}>
      <Suspense fallback={<Loading label={m.run.loadingMap} />}>
        <RouteMap route={route.data} config={map.data} />
      </Suspense>
    </Section>
  );
}

const HEAT_MARK = { none: '✓', mild: '', moderate: '▲', high: '▲', extreme: '▲' } as const;

/** Air temperature and humidity at the run, what they cost, and the pace that effort is worth in cool weather. */
function Conditions({ run, weather }: { run: Activity; weather: NonNullable<Activity['weather']> }) {
  const watch = run.details.temperature_c;
  return (
    <Section title={m.run.conditions.title}>
      <dl className={blocks.facts}>
        <div>
          <dt>{m.run.conditions.air}</dt>
          <dd>
            {f.temperature(weather.temp_c)}
            <small className={styles.below}>{m.run.conditions.dewHumidity(f.temperature(weather.dew_point_c, 1), f.percent(weather.humidity_pct))}</small>
          </dd>
        </div>
        <div>
          <dt>{m.run.conditions.heatCost}</dt>
          <dd>
            {weather.heat.pct > 0 ? m.run.conditions.about(weather.heat.pct) : m.run.conditions.none}
            <small className={styles.below}>{m.weather.heat[weather.heat.level]}</small>
          </dd>
        </div>
        {weather.cool_pace ? (
          <div>
            <dt>{m.run.conditions.coolPace}</dt>
            <dd>
              {stripPace(weather.cool_pace)}
              <small className={styles.unit}> {f.paceUnit}</small>
              <small className={styles.below}>{m.run.conditions.youRan(run.pace ?? '–')}</small>
            </dd>
          </div>
        ) : null}
        {weather.wind_kmh !== null ? (
          <div>
            <dt>{m.run.conditions.wind}</dt>
            <dd>{f.speed(weather.wind_kmh)}</dd>
          </div>
        ) : null}
      </dl>
      {weather.heat.level !== 'none' && weather.heat.level !== 'mild' ? (
        <p className={blocks.explain}>
          <span aria-hidden="true">{HEAT_MARK[weather.heat.level]} </span>
          {m.run.conditions.harder}
        </p>
      ) : null}
      <Note>{m.run.conditions.note(weather.source === 'forecast', f.temperature(watch))}</Note>
    </Section>
  );
}

const HARD = new Set(['tempo', 'threshold', 'intervals', 'sprint', 'test']);

/**
 * What the run cost in energy and fluid, and how to fuel one like it next time. Weight comes from the Body report
 * (same cache entry as the Body page); the sweat rate is this run's own, so a hot day plans like a hot day.
 */
function RunFuel({ run }: { run: Activity }) {
  const body = useBody(todayLocal());
  const weightKg = body.data?.nutrition?.weight_kg;
  if (!weightKg || !run.duration_min) return null;
  const hours = run.duration_min / 60;
  const water = run.water_estimated_ml;
  const lossPct = water ? (water / 1000 / weightKg) * 100 : null;
  const sweatRate = water && hours > 0.25 ? Math.round(water / hours / 10) * 10 : null;
  const plan = fuelPlan({ weightKg, minutes: run.duration_min, hard: HARD.has(run.category ?? '') || (run.load_trimp ?? 0) >= 100, sweatMlPerHour: sweatRate ?? body.data?.sweat.typical_ml_per_hour ?? null }, current());

  return (
    <Section title={m.run.fuel.title}>
      <dl className={blocks.facts}>
        {run.calories ? (
          <div>
            <dt>{m.run.fuel.energy}</dt>
            <dd>{f.number(run.calories)} kcal</dd>
          </div>
        ) : null}
        {water ? (
          <div>
            <dt>{m.run.fuel.sweatLost}</dt>
            <dd>
              {f.litres(water)}
              {lossPct !== null ? <small className={styles.below}>{m.run.fuel.ofBodyWeight(f.percent(lossPct, 1))}</small> : null}
            </dd>
          </div>
        ) : null}
        {sweatRate ? (
          <div>
            <dt>{m.run.fuel.sweatRate}</dt>
            <dd>
              {f.volume(sweatRate)}
              <small className={styles.unit}> {m.run.fuel.perHour}</small>
            </dd>
          </div>
        ) : null}
      </dl>
      {lossPct !== null && lossPct >= 2 ? <p className={blocks.explain}>{m.run.fuel.over2}</p> : null}
      <h3 className={styles.subhead}>{m.run.fuel.forARunLikeThis}</h3>
      <PlanView plan={plan} />
      <Note>{m.run.fuel.note}</Note>
    </Section>
  );
}

function Stat({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value ?? '–'}
        {unit && value !== null && value !== undefined ? <small className={styles.unit}> {unit}</small> : null}
      </dd>
    </div>
  );
}

/** Label and value pairs; facts the watch didn't record are left out rather than shown as dashes. */
function Facts({ facts }: { facts: Fact[] }) {
  // NONE ('–') is what a formatter returns for a missing number: no point showing a dash with a unit after it.
  const present = facts.filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== NONE);
  if (!present.length) return <p className={blocks.empty}>{m.run.notRecorded}</p>;
  return (
    <dl className={blocks.facts}>
      {present.map(([label, value, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value}
            {unit ? <small className={styles.unit}> {unit}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PlannedVsActual({ steps }: { steps: NonNullable<Activity['executed_steps']> }) {
  return (
    <div className={blocks.tableWrap} {...scrollRegion(m.run.plannedVsActual)}>
      <table className={blocks.table}>
        <thead>
          <tr>
            <th scope="col">{m.run.stepCol}</th>
            <th scope="col">{m.run.plannedCol}</th>
            <th scope="col">{m.run.targetPace}</th>
            <th scope="col">{m.run.yourPace}</th>
            <th scope="col">{m.run.result}</th>
            <th scope="col">{m.run.heartRate}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={i}>
              <th scope="row">{m.run.step[step.intensity ?? ''] ?? m.run.step.other}</th>
              <td>{step.planned ?? '–'}</td>
              <td>{step.target_pace?.replaceAll(f.paceUnit, '') ?? m.run.noTarget}</td>
              <td>{stripPace(step.pace)}</td>
              <td>
                <Verdict step={step} />
              </td>
              <td>{step.avg_hr ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "On target", or how far outside the range: seconds per km faster or slower than its nearest edge. */
function Verdict({ step }: { step: NonNullable<Activity['executed_steps']>[number] }) {
  if (!step.on_target || !step.speed_mps || !step.target_speed_mps) return <>–</>;
  if (step.on_target === 'on') return <span className={styles.verdict}>{m.run.onTarget}</span>;
  const gap = Math.abs(paceGap(step.speed_mps, step.target_speed_mps as [number, number]));
  return (
    <span className={styles.verdict} data-off>
      {m.run.off(f.paceDelta(gap), step.on_target === 'fast')}
    </span>
  );
}

function Laps({ laps }: { laps: Activity['laps'] }) {
  if (!laps.length) return <p className={blocks.empty}>{m.run.noLaps}</p>;
  const hasPower = laps.some((lap) => lap.avg_power_w !== null);
  return (
    <div className={blocks.tableWrap} {...scrollRegion(m.run.laps)}>
      <table className={blocks.table}>
        <thead>
          <tr>
            <th scope="col">{m.run.lap}</th>
            <th scope="col">{m.run.distance}</th>
            <th scope="col">{m.run.time}</th>
            <th scope="col">{m.run.pace}</th>
            <th scope="col">{m.run.heartRate}</th>
            {hasPower ? <th scope="col">{m.run.power}</th> : null}
            <th scope="col">{m.run.cadence}</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => (
            <tr key={lap.lap}>
              <th scope="row">{lap.lap}</th>
              <td>{f.distance(lap.distance_km, 2, true)}</td>
              <td>{lap.time ?? '–'}</td>
              <td>{stripPace(lap.pace)}</td>
              <td>{lap.avg_hr ?? '–'}</td>
              {hasPower ? <td>{lap.avg_power_w ?? '–'}</td> : null}
              <td>{lap.cadence_spm ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
