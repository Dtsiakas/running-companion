import { current, m } from '../lib/i18n.ts';
import { fuelPlan, type FuelPlan } from '@companion/insights/fuel';
import { useState } from 'react';
import styles from './FuelPlanner.module.css';

const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];

/** Pick a run's length (and whether it's hard, and warm); the plan updates as you choose. Runs in the browser. */
export function FuelPlanner({ weightKg, sweat }: { weightKg: number; sweat: { typical: number | null; warm: number | null } }) {
  const [minutes, setMinutes] = useState(90);
  const [hard, setHard] = useState(false);
  const [warm, setWarm] = useState(false);
  const plan = fuelPlan({ weightKg, minutes, hard, sweatMlPerHour: (warm ? sweat.warm : null) ?? sweat.typical }, current());

  return (
    <div className={styles.planner}>
      <div className={styles.controls}>
        <label className={styles.duration}>
          <span>{m.fuel.runLength}</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {m.fuel.duration(d)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> {m.fuel.hardSession}
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={warm} onChange={(e) => setWarm(e.target.checked)} /> {m.fuel.warmDay}
        </label>
      </div>
      <PlanView plan={plan} />
    </div>
  );
}

export function PlanView({ plan }: { plan: FuelPlan }) {
  return (
    <div className={styles.plan}>
      {(
        [
          [m.fuel.before, plan.before],
          [m.fuel.during, plan.during],
          [m.fuel.after, plan.after],
        ] as const
      ).map(([title, lines]) => (
        <section key={title}>
          <h3>{title}</h3>
          <ul>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
