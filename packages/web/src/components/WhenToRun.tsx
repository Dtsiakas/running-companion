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
    <Section title="When to run">
      <div className={styles.days}>
        {days.map((day, i) => (
          <DayPlan key={day.date} day={day} label={i === 0 && day.date === forecast.data!.days[0]!.date ? 'Today' : 'Tomorrow'} />
        ))}
      </div>
      <Note>
        <Source forecast={forecast.data} /> The heat cost is how much slower the same effort runs at that hour (temperature plus dew point). The best window is the coolest stretch of up to three hours
        with under a 50% chance of rain, between 06:00 and 22:00. Garmin’s workout for the day stays the plan; this is only when to fit it in.
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
            {day.best.temp_c}°C, {day.best.heat.pct > 0 ? `heat cost about ${day.best.heat.pct}%` : 'no heat cost'}
          </span>
        </p>
      ) : (
        <p className={blocks.explain}>Rain likely all day.</p>
      )}
      {day.avoid ? (
        <p className={styles.avoid}>
          <span aria-hidden="true">▲ </span>
          Avoid around {day.avoid.from}: {day.avoid.temp_c}°C, about {day.avoid.heat.pct}% slower. {day.avoid.heat.label}.
        </p>
      ) : Number.isFinite(hottest) ? (
        <p className={styles.fine}>Up to {Math.round(hottest)}°C: no hour costs much.</p>
      ) : null}
    </article>
  );
}

function Source({ forecast }: { forecast: RunForecast }) {
  const time = new Date(forecast.fetched_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      Forecast for {forecast.place.name ?? 'where you usually run'} from Open-Meteo, updated {time}
      {forecast.stale ? ' (couldn’t refresh: the forecast service is unreachable)' : ''}.
    </>
  );
}
