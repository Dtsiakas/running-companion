import { m } from '../lib/i18n.ts';
import type { ReportLine, WeeklyReport } from '@companion/insights';
import { Link } from 'react-router';
import { shortDay } from '../lib/dates.ts';
import styles from './WeekReport.module.css';

const TONE = { good: '✓', concern: '▲', neutral: '' } as const;

/**
 * The week in short: a headline, then grouped lines, each marked when it's good (✓) or worth attention (▲).
 * Plain sentences first, because the numbers below on the Week page are there to check them.
 */
export function WeekReport({ report }: { report: WeeklyReport }) {
  const groups: Array<[string, ReportLine[]]> = [
    [m.week.groups.training, report.training],
    [m.week.groups.recovery, report.recovery],
    [m.week.groups.life, report.life],
    [m.week.groups.body, report.body],
  ];
  return (
    <div className={styles.report}>
      <p className={styles.headline}>{report.headline}</p>

      {report.bests.length ? (
        <ul className={styles.bests}>
          {report.bests.map((best) => (
            <li key={best.distance}>
              <Link to={`/runs/${best.activity_id}`}>
                {best.scope === 'all-time' ? m.week.allTimeBest : m.week.yearBest}: {m.week.bestIn(best.distance, best.time)}
              </Link>
              <span className={styles.when}> ({shortDay(best.date)})</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.groups}>
        {groups
          .filter(([, lines]) => lines.length)
          .map(([title, lines]) => (
            <section key={title} className={styles.group}>
              <h3>{title}</h3>
              <ul>
                {lines.map((line) => (
                  <li key={line.text} data-tone={line.tone}>
                    <span className={styles.mark} aria-label={line.tone === 'neutral' ? undefined : line.tone === 'good' ? m.week.good : m.week.attention}>
                      {TONE[line.tone]}
                    </span>
                    {line.text}
                  </li>
                ))}
              </ul>
              {title === m.week.groups.training && report.key_sessions.length ? (
                <ul className={styles.sessions}>
                  {report.key_sessions.map((session) => (
                    <li key={session.activity_id}>
                      <Link to={`/runs/${session.activity_id}`}>{session.name}</Link> <span className={styles.when}>{shortDay(session.date)}</span>: {session.verdict}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
      </div>

      {report.signals.length ? (
        <p className={styles.signals}>
          {m.week.raised(report.signals.map((s) => m.week.raisedItem(s.title.toLowerCase(), s.days)).join(', '))}
        </p>
      ) : null}
    </div>
  );
}
