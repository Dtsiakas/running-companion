import { fuelPlan, type FuelPlan } from '@companion/insights/fuel';
import { useState } from 'react';
import styles from './FuelPlanner.module.css';

const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];

/** Pick a run's length (and whether it's hard, and warm); the plan updates as you choose. Runs in the browser. */
export function FuelPlanner({ weightKg, sweat }: { weightKg: number; sweat: { typical: number | null; warm: number | null } }) {
  const [minutes, setMinutes] = useState(90);
  const [hard, setHard] = useState(false);
  const [warm, setWarm] = useState(false);
  const plan = fuelPlan({ weightKg, minutes, hard, sweatMlPerHour: (warm ? sweat.warm : null) ?? sweat.typical });

  return (
    <div className={styles.planner}>
      <div className={styles.controls}>
        <label className={styles.duration}>
          <span>Run length</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ''}`}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard session
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={warm} onChange={(e) => setWarm(e.target.checked)} /> Warm day
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
          ['Before', plan.before],
          ['During', plan.during],
          ['After', plan.after],
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
