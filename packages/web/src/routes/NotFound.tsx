import { m } from '../lib/i18n.ts';
import { Link } from 'react-router';
import styles from './NotFound.module.css';

export function NotFound() {
  return (
    <div className={styles.page}>
      <h1>{m.app.notFound.title}</h1>
      <p>
        {m.app.notFound.before} <Link to="/">{m.app.notFound.link}</Link>
        {m.app.notFound.after}
      </p>
    </div>
  );
}
