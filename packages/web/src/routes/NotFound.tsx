import { Link } from 'react-router';
import styles from './NotFound.module.css';

export function NotFound() {
  return (
    <div className={styles.page}>
      <h1>Page not found</h1>
      <p>
        This address doesn’t match any screen. Go to <Link to="/">Today</Link>.
      </p>
    </div>
  );
}
