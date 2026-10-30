import { f, m } from '../lib/i18n.ts';
import type { ForecastDay, RunForecast } from '@companion/weather';
import { useForecast } from '../api/hooks.ts';
import { Note } from './Note.tsx';
import { Section } from './Section.tsx';
import blocks from '../styles/blocks.module.css';
import styles from './WhenToRun.module.css';

/**
 * Today's and tomorrow's best window to run where you usually run, and the hour to avoid when heat makes it costly.
 * Hidden when there's no forecast (weather not synced yet, or Open-Meteo unreachable with nothing cached).
 */
export function WhenToRun() {
  const forecast = useForecast();
  if (!forecast.data) return null;
  const days = forecast.data.days.filter((d) => d.hours.length);
  if (!days.length) return null;
  return (
    <Section title={m.weather.whenToRun}>
      <div className={styles.days}>
        {days.map((day, i) => (
          <DayPlan key={day.date} day={day} label={i === 0 && day.date === forecast.data!.days[0]!.date ? m.weather.today : m.weather.tomorrow} />
        ))}
      </div>
      <Note>
        <Source forecast={forecast.data} /> {m.weather.note}
      </Note>
    </Section>
  );
}

function DayPlan({ day, label }: { day: ForecastDay; label: string }) {
  const hottest = Math.max(...day.hours.map((h) => h.temp_c ?? -Infinity));
  return (
    <article className={styles.day}>
      <h3 className={styles.label}>{label}</h3>
      {day.best ? (
        <p className={styles.best}>
          <strong>
            {day.best.from}–{day.best.to}
          </strong>
          <span>
            {f.temperature(day.best.temp_c)}, {day.best.heat.pct > 0 ? m.weather.heatCostAbout(day.best.heat.pct) : m.weather.noHeatCost}
          </span>
        </p>
      ) : (
        <p className={blocks.explain}>{m.weather.rainAllDay}</p>
      )}
      {day.avoid ? (
        <p className={styles.avoid}>
          <span aria-hidden="true">▲ </span>
          {m.weather.avoid(day.avoid.from, f.temperature(day.avoid.temp_c), day.avoid.heat.pct, m.weather.heat[day.avoid.heat.level])}
        </p>
      ) : Number.isFinite(hottest) ? (
        <p className={styles.fine}>{m.weather.fine(f.temperature(hottest))}</p>
      ) : null}
    </article>
  );
}

function Source({ forecast }: { forecast: RunForecast }) {
  return <>{m.weather.source(forecast.place.name ?? m.weather.usualPlace, f.time(new Date(forecast.fetched_at)), !!forecast.stale)}</>;
}
