import { m } from '../lib/i18n.ts';
import type { Pattern, PatternResult } from '@companion/insights';
import styles from './Patterns.module.css';

/**
 * "What works for you": comparisons from your own history. Findings first, in full; then, folded away, what was
 * checked and showed no clear effect (also worth knowing), and what is still waiting for enough days.
 */
export function Patterns({ patterns }: { patterns: Pattern[] }) {
  const findings = patterns.filter((p) => p.status === 'effect');
  const none = patterns.filter((p) => p.status === 'no_effect');
  const waiting = patterns.filter((p) => p.status === 'not_enough');
  return (
    <div className={styles.patterns}>
      <p className={styles.intro}>{m.patterns.intro}</p>
      {findings.length ? findings.map((pattern) => <PatternCard key={pattern.id} pattern={pattern} />) : <p className={styles.intro}>{m.patterns.none}</p>}
      {none.length ? (
        <details className={styles.more}>
          <summary>{m.patterns.noEffect(none.length)}</summary>
          {none.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </details>
      ) : null}
      {waiting.length ? (
        <details className={styles.more}>
          <summary>{m.patterns.waiting(waiting.length)}</summary>
          <p className={styles.intro}>{m.patterns.waitingIntro}</p>
          {waiting.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </details>
      ) : null}
    </div>
  );
}

function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <article className={styles.card}>
      <h3 className={styles.title}>{pattern.title}</h3>
      <p className={styles.comparison}>{pattern.comparison}</p>
      <ul className={styles.results}>
        {pattern.results.map((result) => (
          <ResultRow key={result.outcome} result={result} />
        ))}
      </ul>
      {pattern.caveat ? <p className={styles.caveat}>{pattern.caveat}</p> : null}
    </article>
  );
}

function ResultRow({ result }: { result: PatternResult }) {
  return (
    <li className={styles.result} data-status={result.status}>
      <span className={styles.outcome}>{result.outcome}</span>
      <span className={styles.difference}>
        {result.difference}
        {result.strength ? <span className={styles.strength}> {result.strength === 'strong' ? m.patterns.strong : m.patterns.moderate}</span> : null}
      </span>
      {result.status !== 'not_enough' ? (
        <span className={styles.sample}>{m.patterns.days(result.a.n, result.b.n)}</span>
      ) : null}
    </li>
  );
}
