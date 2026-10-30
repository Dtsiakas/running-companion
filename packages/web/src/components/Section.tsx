import styles from './Section.module.css';

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
