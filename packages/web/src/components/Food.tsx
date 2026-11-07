import { useState } from 'react';
import type { Nutrition } from '@companion/insights';
import { useDeleteMeal, useNutrition } from '../api/hooks.ts';
import { scrollRegion } from '../lib/a11y.ts';
import { shortDay } from '../lib/dates.ts';
import { f, m } from '../lib/i18n.ts';
import blocks from '../styles/blocks.module.css';
import { Note } from './Note.tsx';
import { Section } from './Section.tsx';
import styles from './Food.module.css';

const TONE = { good: '✓', concern: '▲', neutral: '' } as const;
const grams = (value: number) => `${f.number(value)} g`;
const range = ([low, high]: [number, number]) => `${f.number(low)}–${f.number(high)} g`;

/**
 * Today's food log on the Today screen: the totals against the day's targets and each meal. Meals are logged by
 * asking Claude; here they can only be removed.
 */
export function FoodToday({ date }: { date: string }) {
  const nutrition = useNutrition(date);
  if (!nutrition.data) return null;
  const { meals, totals, targets } = nutrition.data;
  return (
    <Section title={m.food.today}>
      {meals.length ? (
        <>
          <dl className={blocks.facts}>
            <div>
              <dt>{m.food.soFar}</dt>
              <dd>{f.number(totals.kcal)} kcal</dd>
            </div>
            <div>
              <dt>{m.food.protein}</dt>
              <dd>
                {grams(totals.protein_g)}
                {targets ? <small className={styles.target}> {m.food.target(range(targets.protein_g))}</small> : null}
              </dd>
            </div>
            <div>
              <dt>{m.food.carbs}</dt>
              <dd>
                {grams(totals.carbs_g)}
                {targets ? <small className={styles.target}> {m.food.target(range(targets.carbs_g))}</small> : null}
              </dd>
            </div>
          </dl>
          <Meals meals={meals} />
        </>
      ) : (
        <p className={blocks.empty}>{m.food.empty}</p>
      )}
    </Section>
  );
}

function Meals({ meals }: { meals: Nutrition['meals'] }) {
  const remove = useDeleteMeal();
  // Removing takes two taps: the first asks, the second removes. A stray tap on a phone shouldn't lose a meal.
  const [confirming, setConfirming] = useState<number | null>(null);
  return (
    <ul className={styles.meals}>
      {meals.map((meal) => (
        <li key={meal.meal_id}>
          <span className={styles.time}>{meal.time ?? ''}</span>
          <span className={styles.what}>
            {meal.description}
            <small>
              {f.number(meal.kcal)} kcal · {m.food.protein} {grams(meal.protein_g)} · {m.food.carbs} {grams(meal.carbs_g)} · {m.food.fat} {grams(meal.fat_g)}
            </small>
          </span>
          <button
            type="button"
            className={styles.remove}
            data-confirming={confirming === meal.meal_id || undefined}
            aria-label={m.food.removeLabel(meal.description)}
            disabled={remove.isPending}
            onClick={() => {
              if (confirming !== meal.meal_id) return setConfirming(meal.meal_id);
              setConfirming(null);
              remove.mutate(meal.meal_id);
            }}
            onBlur={() => setConfirming(null)}
          >
            {confirming === meal.meal_id ? `${m.food.remove}?` : m.food.remove}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The last two weeks on the Body screen: eaten against burned per day, and what the logged week adds up to. */
export function FoodHistory({ date }: { date: string }) {
  const nutrition = useNutrition(date);
  if (!nutrition.data) return null;
  const { days, feedback, note } = nutrition.data;
  if (!days.some((day) => day.meals > 0)) return null;
  return (
    <Section title={m.food.title}>
      <ul className={styles.feedback}>
        {feedback.map((line) => (
          <li key={line.text} data-tone={line.tone}>
            <span className={styles.mark} aria-hidden="true">
              {TONE[line.tone]}
            </span>
            {line.text}
          </li>
        ))}
      </ul>
      <div className={blocks.tableWrap} {...scrollRegion(m.food.last14)}>
        <table className={blocks.table}>
          <thead>
            <tr>
              <th scope="col">{m.food.last14}</th>
              <th scope="col">{m.food.eaten}</th>
              <th scope="col">{m.food.burned}</th>
              <th scope="col">{m.food.protein}</th>
              <th scope="col">{m.food.carbs}</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.date}>
                <th scope="row">{shortDay(day.date)}</th>
                {day.meals ? (
                  <>
                    <td>
                      {f.number(day.kcal)} kcal{day.partial ? <small className={styles.target}> {m.food.partial}</small> : null}
                    </td>
                    <td>{day.burned_kcal === null ? '–' : `${f.number(day.burned_kcal)} kcal`}</td>
                    <td>{grams(day.protein_g)}</td>
                    <td>{grams(day.carbs_g)}</td>
                  </>
                ) : (
                  <td colSpan={4} className={styles.target}>
                    {m.food.notLogged}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>{note}</Note>
    </Section>
  );
}
