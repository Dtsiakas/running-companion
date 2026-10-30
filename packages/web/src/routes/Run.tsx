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
import { CATEGORY_LABEL, paceGap, STEP_LABEL } from '../lib/format.ts';
import { NOTES } from '../lib/insights.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Run.module.css';

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
        All runs
      </Link>
      {activity.isPending ? (
        <Loading />
      ) : activity.isError ? (
        <ErrorState error={activity.error} retry={() => void activity.refetch()} />
      ) : (
        <RunBody run={activity.data}>{records.data ? <RunCharts records={records.data} /> : records.isError ? <ErrorState error={records.error} /> : <Loading label="Loading charts" />}</RunBody>
      )}
    </div>
  );
}

function RunBody({ run, children: charts }: { run: Activity; children: React.ReactNode }) {
  const d = run.details;
  const kind = run.planned_workout ? `Planned: ${run.planned_workout}` : CATEGORY_LABEL[run.category ?? 'other'];
  const startTime = run.start_local?.slice(11, 16);

  return (
    <>
      <header className={styles.header}>
        <h1 className={blocks.title}>{run.name ?? 'Run'}</h1>
        <p className={styles.meta}>
          {run.date ? longDay(run.date) : ''}
          {startTime ? ` at ${startTime}` : ''}, {kind}
          {run.treadmill ? ', treadmill' : ''}
        </p>
      </header>

      <dl className={blocks.stats}>
        <Stat label="Distance" value={run.distance_km} unit="km" />
        <Stat label="Time" value={run.duration} />
        <Stat label="Pace" value={run.pace?.replace('/km', '')} unit="/km" />
        <Stat label="Heart rate" value={run.avg_hr} unit={run.max_hr ? `max ${run.max_hr}` : 'bpm'} />
        <Stat label="Load" value={run.load_trimp} />
        {run.avg_power_w ? <Stat label="Power" value={run.avg_power_w} unit="W" /> : null}
      </dl>
      {run.treadmill ? <p className={blocks.explain}>Treadmill pace comes from the wrist and is often off; heart rate and load are still reliable.</p> : null}

      <RunRoute id={run.activity_id!} />
      {run.weather ? <Conditions run={run} weather={run.weather} /> : null}
      <Section title="Over the run">{charts}</Section>

      {run.executed_steps?.length ? (
        <Section title="Planned vs actual">
          <PlannedVsActual steps={run.executed_steps} />
          <Note>{NOTES.plannedVsActual}</Note>
        </Section>
      ) : null}

      <Section title="Laps">
        <Laps laps={run.laps} />
      </Section>

      <div className={blocks.columns}>
        <Section title="Effort">
          <IntensityBar intensity={run.intensity_pct} />
          <Facts
            facts={[
              ['Aerobic effect', d.aerobic_te],
              ['Anaerobic effect', d.anaerobic_te],
              ['Your effort (RPE)', run.rpe, '/ 10'],
            ]}
          />
          {run.garmin_te ? <p className={blocks.explain}>Garmin rated it {run.garmin_te.replace(/_/g, ' ').toLowerCase()}.</p> : null}
          <Note>
            {NOTES.intensity} {NOTES.trainingEffect}
          </Note>
        </Section>

        <Section title="Efficiency">
          <Facts
            facts={[
              ['Metres per beat', run.m_per_beat],
              ['Pace at reference HR', run.pace_at_ref_hr?.replace('/km', ''), '/km'],
              ['Decoupling', run.decoupling_pct, '%'],
              ['Elevation gain', d.elevation_gain_m, 'm'],
              ['Grade-adjusted pace', d.avg_gap_pace?.replace('/km', ''), '/km'],
              ['Temperature', d.temperature_c, '°C'],
            ]}
          />
          <Note>
            {NOTES.efficiency} {NOTES.paceAtRefHr} {NOTES.decoupling}
          </Note>
        </Section>
      </div>

      <div className={blocks.columns}>
        <Section title="Running form">
          <Facts
            facts={[
              ['Cadence', run.cadence_spm, 'spm'],
              ['Step length', d.avg_step_length_m, 'm'],
              ['Ground contact', d.avg_gct_ms, 'ms'],
              ['Vertical ratio', d.avg_vertical_ratio_pct, '%'],
              ['Vertical oscillation', d.avg_vertical_oscillation_mm === null ? null : Math.round(d.avg_vertical_oscillation_mm) / 10, 'cm'],
            ]}
          />
          <Note>{NOTES.runningForm}</Note>
        </Section>

        {run.best_efforts.length ? (
          <Section title="Fastest efforts in this run">
            <table className={blocks.table}>
              <thead>
                <tr>
                  <th scope="col">Distance</th>
                  <th scope="col">Time</th>
                  <th scope="col">Pace</th>
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

      <Section title="Ask Claude">
        <AskClaude requests={[runDebriefRequest(run.activity_id!, run.name ?? 'Run', run.date!)]} />
      </Section>
    </>
  );
}

function RunRoute({ id }: { id: number }) {
  const route = useRoute(String(id));
  const map = useMapConfig();
  if (!route.data || !map.data) return null;
  return (
    <Section title="Route">
      <Suspense fallback={<Loading label="Loading map" />}>
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
    <Section title="Conditions">
      <dl className={blocks.facts}>
        <div>
          <dt>Air</dt>
          <dd>
            {weather.temp_c}°C<small className={styles.below}>dew point {weather.dew_point_c}°C, humidity {weather.humidity_pct}%</small>
          </dd>
        </div>
        <div>
          <dt>Heat cost</dt>
          <dd>
            {weather.heat.pct > 0 ? `about ${weather.heat.pct}%` : 'none'}
            <small className={styles.below}>{weather.heat.label}</small>
          </dd>
        </div>
        {weather.cool_pace ? (
          <div>
            <dt>Same effort, cool day</dt>
            <dd>
              {weather.cool_pace.replace('/km', '')}
              <small className={styles.unit}> /km</small>
              <small className={styles.below}>you ran {run.pace}</small>
            </dd>
          </div>
        ) : null}
        {weather.wind_kmh !== null ? (
          <div>
            <dt>Wind</dt>
            <dd>
              {weather.wind_kmh}
              <small className={styles.unit}> km/h</small>
            </dd>
          </div>
        ) : null}
      </dl>
      {weather.heat.level !== 'none' && weather.heat.level !== 'mild' ? (
        <p className={blocks.explain}>
          <span aria-hidden="true">{HEAT_MARK[weather.heat.level]} </span>
          Heat made this run harder than its pace suggests: heart rate runs higher and pace slower at the same effort. Compare it with cool-day runs by the cool-weather pace, not the pace on the watch.
        </p>
      ) : null}
      <Note>
        Weather from Open-Meteo for the place and hour of the run{weather.source === 'forecast' ? ' (from the forecast model, because the weather archive takes about five days to publish)' : ''}. The watch’s own sensor read {watch ?? '–'}°C: it sits against your wrist and
        reads warm. The heat cost follows a common coaching rule (temperature plus dew point in °F; above 100 every 10 points costs roughly another 0.5–2% of pace). It assumes you’re used to the heat;
        early in summer the cost is higher.
      </Note>
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
  const plan = fuelPlan({ weightKg, minutes: run.duration_min, hard: HARD.has(run.category ?? '') || (run.load_trimp ?? 0) >= 100, sweatMlPerHour: sweatRate ?? body.data?.sweat.typical_ml_per_hour ?? null });

  return (
    <Section title="Fuel and fluids">
      <dl className={blocks.facts}>
        {run.calories ? (
          <div>
            <dt>Energy</dt>
            <dd>{run.calories.toLocaleString('en-GB')} kcal</dd>
          </div>
        ) : null}
        {water ? (
          <div>
            <dt>Sweat lost</dt>
            <dd>
              {(water / 1000).toFixed(1)} l{lossPct !== null ? <small className={styles.below}>{lossPct.toFixed(1)}% of body weight</small> : null}
            </dd>
          </div>
        ) : null}
        {sweatRate ? (
          <div>
            <dt>Sweat rate</dt>
            <dd>
              {sweatRate.toLocaleString('en-GB')} <small className={styles.unit}>ml/h</small>
            </dd>
          </div>
        ) : null}
      </dl>
      {lossPct !== null && lossPct >= 2 ? <p className={blocks.explain}>Over 2% of body weight: enough to cost pace and raise heart rate late in a run. On runs like this, drink along the way.</p> : null}
      <h3 className={styles.subhead}>For a run like this</h3>
      <PlanView plan={plan} />
      <Note>Sweat loss is Garmin’s estimate from heart rate, duration and temperature, not a measurement. Weighing yourself before and after a run (without clothes, after towelling off) gives the real number: each kilo lost is about a litre of sweat.</Note>
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
  const present = facts.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!present.length) return <p className={blocks.empty}>Not recorded for this run.</p>;
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
    <div className={blocks.tableWrap}>
      <table className={blocks.table}>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Planned</th>
            <th scope="col">Target pace</th>
            <th scope="col">Your pace</th>
            <th scope="col">Result</th>
            <th scope="col">Heart rate</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={i}>
              <th scope="row">{STEP_LABEL[step.intensity ?? ''] ?? 'Step'}</th>
              <td>{step.planned ?? '–'}</td>
              <td>{step.target_pace?.replace(/\/km/g, '') ?? 'No target'}</td>
              <td>{step.pace?.replace('/km', '') ?? '–'}</td>
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
  if (step.on_target === 'on') return <span className={styles.verdict}>On target</span>;
  const gap = Math.abs(paceGap(step.speed_mps, step.target_speed_mps as [number, number]));
  return (
    <span className={styles.verdict} data-off>
      {gap} s/km {step.on_target === 'fast' ? 'fast' : 'slow'}
    </span>
  );
}

function Laps({ laps }: { laps: Activity['laps'] }) {
  if (!laps.length) return <p className={blocks.empty}>No laps recorded.</p>;
  const hasPower = laps.some((lap) => lap.avg_power_w !== null);
  return (
    <div className={blocks.tableWrap}>
      <table className={blocks.table}>
        <thead>
          <tr>
            <th scope="col">Lap</th>
            <th scope="col">Distance</th>
            <th scope="col">Time</th>
            <th scope="col">Pace</th>
            <th scope="col">Heart rate</th>
            {hasPower ? <th scope="col">Power</th> : null}
            <th scope="col">Cadence</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((lap) => (
            <tr key={lap.lap}>
              <th scope="row">{lap.lap}</th>
              <td>{lap.distance_km ?? '–'} km</td>
              <td>{lap.time ?? '–'}</td>
              <td>{lap.pace?.replace('/km', '') ?? '–'}</td>
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
