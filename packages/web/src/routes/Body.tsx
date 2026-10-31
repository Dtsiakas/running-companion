import { useBody } from '../api/hooks.ts';
import { WeightChart } from '../components/charts/WeightChart.tsx';
import { FuelPlanner } from '../components/FuelPlanner.tsx';
import { Note } from '../components/Note.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { todayLocal } from '../lib/dates.ts';
import { f, m } from '../lib/i18n.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Body.module.css';
import { scrollRegion } from '../lib/a11y.ts';

const MARK = { good: '✓', concern: '▲', neutral: '' } as const;
const kcal = (value: number) => `${f.number(value)} kcal`;

/**
 * Weight, body composition, energy and food. Ranges and plans follow the published sports-nutrition position stands,
 * scaled to your weight and your own sweat rate; they're guidance, not a diet.
 */
export function Body() {
  const body = useBody(todayLocal());
  if (body.isPending) return <Loading />;
  if (body.isError) return <ErrorState error={body.error} retry={() => void body.refetch()} />;
  const { weight, composition, fitness_age: age, energy, nutrition, sweat } = body.data;
  const extra =
    energy.rest && energy.big ? energy.big.kcal - energy.rest.kcal : energy.rest && energy.training ? energy.training.kcal - energy.rest.kcal : null;

  return (
    <div className={blocks.page}>
      <h1 className={blocks.title}>{m.body.title}</h1>

      {weight ? (
        <Section title={m.body.weight}>
          <dl className={blocks.stats}>
            <div>
              <dt>{m.body.trend}</dt>
              <dd>{f.weight(weight.trend_kg)}</dd>
            </div>
            {weight.goal_kg !== null ? (
              <div>
                <dt>{m.body.goal}</dt>
                <dd>{f.weight(weight.goal_kg)}</dd>
                {weight.to_goal_kg !== null && Math.abs(weight.to_goal_kg) >= 0.5 ? (
                  <dd className={blocks.change}>{m.body.toGo(f.weight(Math.abs(weight.to_goal_kg)))}</dd>
                ) : null}
              </div>
            ) : null}
            {weight.change_4w_kg !== null ? (
              <div>
                <dt>{m.body.last4}</dt>
                <dd>
                  {f.signed(f.weightValue(weight.change_4w_kg), 1)} {f.weightUnit}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.assessment} data-tone={weight.tone}>
            {MARK[weight.tone] ? <span aria-hidden="true">{MARK[weight.tone]} </span> : null}
            {weight.assessment}
            {weight.projected_goal_date && weight.goal_kg !== null ? m.body.projected(f.weight(weight.goal_kg), f.dayMonthYear(weight.projected_goal_date)) : ''}
          </p>
          <WeightChart series={body.data.weight_series} weighIns={body.data.weigh_ins} goal={weight.goal_kg} />
          <Note>
            {m.notes.weight} {m.body.weightNote}
          </Note>
        </Section>
      ) : !composition ? (
        <Section title={m.body.weight}>
          <p className={blocks.explain}>{m.body.noWeighIns}</p>
        </Section>
      ) : null}

      <div className={blocks.columns}>
        {composition || age?.fitness_age ? (
          <Section title={composition ? m.body.composition : m.body.fitnessAge}>
            <dl className={blocks.facts}>
              {composition ? (
                <>
                  <div>
                    <dt>{m.body.bodyFat}</dt>
                    <dd>
                      {f.percent(composition.body_fat_pct, 1)}
                      {composition.body_fat_change_pts !== null ? (
                        <small className={styles.change}> {signedText(composition.body_fat_change_pts, ` ${m.body.pts}`)}</small>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>{m.body.muscle}</dt>
                    <dd>
                      {f.weight(composition.muscle_kg)}
                      {composition.muscle_change_kg !== null ? (
                        <small className={styles.change}> {signedText(f.weightValue(composition.muscle_change_kg)!, ` ${f.weightUnit}`)}</small>
                      ) : null}
                    </dd>
                  </div>
                </>
              ) : null}
              {age?.fitness_age ? (
                <div>
                  <dt>{m.body.fitnessAge}</dt>
                  <dd>
                    {age.fitness_age}
                    {age.actual_age ? <small className={styles.change}> {m.body.actual(age.actual_age)}</small> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
            {weight && !composition ? <p className={blocks.empty}>{m.body.noComposition}</p> : null}
            {composition?.muscle_loss_flag ? (
              <p className={styles.assessment} data-tone="concern">
                <span aria-hidden="true">▲ </span>
                {m.body.muscleLoss}
              </p>
            ) : null}
            {age?.biggest_lever ? (
              <p className={blocks.explain}>
                {m.body.lever(
                  age.biggest_lever.label.toLowerCase(),
                  `${f.number(age.biggest_lever.value, 1)}${age.biggest_lever.unit}`,
                  `${f.number(age.biggest_lever.target, 1)}${age.biggest_lever.unit}`,
                )}
              </p>
            ) : null}
            <Note>
              {composition?.note ?? ''} {m.notes.fitnessAge}
            </Note>
          </Section>
        ) : null}

        <Section title={m.body.energy}>
          <dl className={blocks.facts}>
            {(
              [
                [m.body.restDay, energy.rest],
                [m.body.trainingDay, energy.training],
                [m.body.bigDay, energy.big],
              ] as const
            ).map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{kcal(value.kcal)}</dd>
                </div>
              ) : null,
            )}
          </dl>
          {extra ? (
            <p className={blocks.explain}>{m.body.extra(kcal(extra))}</p>
          ) : null}
          <Note>
            {energy.note} {m.body.bigDayNote}
          </Note>
        </Section>
      </div>

      {nutrition ? (
        <Section title={m.body.whatToEat}>
          <dl className={blocks.facts}>
            <div>
              <dt>{m.body.proteinDay}</dt>
              <dd>
                {nutrition.protein_g[0]}–{nutrition.protein_g[1]} g
              </dd>
            </div>
            <div>
              <dt>{m.body.proteinMeal}</dt>
              <dd>
                {nutrition.protein_per_meal_g[0]}–{nutrition.protein_per_meal_g[1]} g
              </dd>
            </div>
          </dl>
          <div className={blocks.tableWrap} {...scrollRegion(m.body.whatToEat)}>
            <table className={blocks.table}>
              <thead>
                <tr>
                  <th scope="col">{m.body.day}</th>
                  <th scope="col">{m.body.carbs}</th>
                  <th scope="col">{m.body.example}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{m.body.restOrEasy}</th>
                  <td>
                    {nutrition.carbs_g.rest[0]}–{nutrition.carbs_g.rest[1]} g
                  </td>
                  <td className={styles.wrap}>{m.body.restExample}</td>
                </tr>
                <tr>
                  <th scope="row">{m.body.hour}</th>
                  <td>
                    {nutrition.carbs_g.moderate[0]}–{nutrition.carbs_g.moderate[1]} g
                  </td>
                  <td className={styles.wrap}>{m.body.hourExample}</td>
                </tr>
                <tr>
                  <th scope="row">{m.body.hard}</th>
                  <td>
                    {nutrition.carbs_g.hard[0]}–{nutrition.carbs_g.hard[1]} g
                  </td>
                  <td className={styles.wrap}>{m.body.hardExample}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Note>
            {m.body.eatNote(f.weight(nutrition.weight_kg), nutrition.source)}
          </Note>
        </Section>
      ) : null}

      {nutrition ? (
        <Section title={m.body.fuelRun}>
          <FuelPlanner weightKg={nutrition.weight_kg} sweat={{ typical: sweat.typical_ml_per_hour, warm: sweat.warm_ml_per_hour }} />
          <Note>
            {m.body.fuelNote(f.volume(sweat.typical_ml_per_hour), sweat.warm_ml_per_hour ? f.volume(sweat.warm_ml_per_hour) : null)}
          </Note>
        </Section>
      ) : null}
    </div>
  );
}

function signedText(value: number, unit: string): string {
  if (Math.round(value * 10) === 0) return m.body.noChange;
  return m.body.inAMonth(`${f.signed(value, 1)}${unit}`);
}
