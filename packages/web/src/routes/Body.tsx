import { useBody } from '../api/hooks.ts';
import { WeightChart } from '../components/charts/WeightChart.tsx';
import { FuelPlanner } from '../components/FuelPlanner.tsx';
import { Note } from '../components/Note.tsx';
import { Section } from '../components/Section.tsx';
import { ErrorState, Loading } from '../components/States.tsx';
import { todayLocal } from '../lib/dates.ts';
import { m } from '../lib/i18n.ts';
import blocks from '../styles/blocks.module.css';
import styles from './Body.module.css';

const MARK = { good: '✓', concern: '▲', neutral: '' } as const;
const kcal = (value: number) => `${value.toLocaleString('en-GB')} kcal`;

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
      <h1 className={blocks.title}>Body</h1>

      {weight ? (
        <Section title="Weight">
          <dl className={blocks.stats}>
            <div>
              <dt>Trend</dt>
              <dd>{weight.trend_kg} kg</dd>
            </div>
            {weight.goal_kg !== null ? (
              <div>
                <dt>Goal</dt>
                <dd>{weight.goal_kg} kg</dd>
                {weight.to_goal_kg !== null && Math.abs(weight.to_goal_kg) >= 0.5 ? (
                  <dd className={blocks.change}>{Math.abs(weight.to_goal_kg)} kg to go</dd>
                ) : null}
              </div>
            ) : null}
            {weight.change_4w_kg !== null ? (
              <div>
                <dt>Last 4 weeks</dt>
                <dd>
                  {weight.change_4w_kg > 0 ? '+' : weight.change_4w_kg < 0 ? '−' : ''}
                  {Math.abs(weight.change_4w_kg)} kg
                </dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.assessment} data-tone={weight.tone}>
            {MARK[weight.tone] ? <span aria-hidden="true">{MARK[weight.tone]} </span> : null}
            {weight.assessment}
            {weight.projected_goal_date
              ? ` At this pace you’d reach ${weight.goal_kg} kg around ${new Date(`${weight.projected_goal_date}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.`
              : ''}
          </p>
          <WeightChart series={body.data.weight_series} weighIns={body.data.weigh_ins} goal={weight.goal_kg} />
          <Note>
            {m.notes.weight} The goal is the one you set in Garmin Connect. For a runner, losing no more than about 0.5–1% of body weight a week keeps training,
            recovery and muscle intact; faster tends to cost all three.
          </Note>
        </Section>
      ) : !composition ? (
        <Section title="Weight">
          <p className={blocks.explain}>
            No weigh-ins yet. Weight, body composition, and the food and fuel amounts that depend on body weight come from a Garmin smart scale, or from weights
            you enter in Garmin Connect.
          </p>
        </Section>
      ) : null}

      <div className={blocks.columns}>
        {composition || age?.fitness_age ? (
          <Section title={composition ? 'Composition' : 'Fitness age'}>
            <dl className={blocks.facts}>
              {composition ? (
                <>
                  <div>
                    <dt>Body fat</dt>
                    <dd>
                      {composition.body_fat_pct}%
                      {composition.body_fat_change_pts !== null ? (
                        <small className={styles.change}> {signedText(composition.body_fat_change_pts, ' pts')}</small>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Muscle mass</dt>
                    <dd>
                      {composition.muscle_kg} kg
                      {composition.muscle_change_kg !== null ? (
                        <small className={styles.change}> {signedText(composition.muscle_change_kg, ' kg')}</small>
                      ) : null}
                    </dd>
                  </div>
                </>
              ) : null}
              {age?.fitness_age ? (
                <div>
                  <dt>Fitness age</dt>
                  <dd>
                    {age.fitness_age}
                    {age.actual_age ? <small className={styles.change}> actual {age.actual_age}</small> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
            {weight && !composition ? <p className={blocks.empty}>No body composition in the last two weeks.</p> : null}
            {composition?.muscle_loss_flag ? (
              <p className={styles.assessment} data-tone="concern">
                <span aria-hidden="true">▲ </span>Muscle mass is down over the month. Enough protein (see below) and some strength work protect it, especially
                while losing weight.
              </p>
            ) : null}
            {age?.biggest_lever ? (
              <p className={blocks.explain}>
                Garmin’s biggest lever for your fitness age: {age.biggest_lever.label.toLowerCase()}, {age.biggest_lever.value}
                {age.biggest_lever.unit} now, {age.biggest_lever.target}
                {age.biggest_lever.unit} as its target.
              </p>
            ) : null}
            <Note>
              {composition?.note ?? ''} {m.notes.fitnessAge}
            </Note>
          </Section>
        ) : null}

        <Section title="Energy">
          <dl className={blocks.facts}>
            {(
              [
                ['Rest day', energy.rest],
                ['Training day', energy.training],
                ['Big day', energy.big],
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
            <p className={blocks.explain}>
              Your bigger days burn about {kcal(extra)} more than a rest day: that difference is what to add on those days, mostly as carbohydrate.
            </p>
          ) : null}
          <Note>{energy.note} A big day has a training load of 100 or more (a long run or a hard session).</Note>
        </Section>
      </div>

      {nutrition ? (
        <Section title="What to eat">
          <dl className={blocks.facts}>
            <div>
              <dt>Protein per day</dt>
              <dd>
                {nutrition.protein_g[0]}–{nutrition.protein_g[1]} g
              </dd>
            </div>
            <div>
              <dt>Protein per meal</dt>
              <dd>
                {nutrition.protein_per_meal_g[0]}–{nutrition.protein_per_meal_g[1]} g
              </dd>
            </div>
          </dl>
          <div className={blocks.tableWrap}>
            <table className={blocks.table}>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Carbohydrate</th>
                  <th scope="col">For example</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Rest or easy</th>
                  <td>
                    {nutrition.carbs_g.rest[0]}–{nutrition.carbs_g.rest[1]} g
                  </td>
                  <td className={styles.wrap}>Normal meals, some carbohydrate at each</td>
                </tr>
                <tr>
                  <th scope="row">About an hour</th>
                  <td>
                    {nutrition.carbs_g.moderate[0]}–{nutrition.carbs_g.moderate[1]} g
                  </td>
                  <td className={styles.wrap}>A bigger portion of rice, pasta, bread or potatoes</td>
                </tr>
                <tr>
                  <th scope="row">Hard or long</th>
                  <td>
                    {nutrition.carbs_g.hard[0]}–{nutrition.carbs_g.hard[1]} g
                  </td>
                  <td className={styles.wrap}>Carbohydrate at every meal plus snacks, and fuel during long runs</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Note>
            Ranges for your weight ({nutrition.weight_kg} kg) from the sports-nutrition position stands ({nutrition.source}). Protein keeps and builds muscle
            and is spread best over 3–5 meals; carbohydrate fuels training and is what to adjust day to day. These are ranges for healthy adults in training,
            not a diet. A sports dietitian can tailor them, and if you ever find eating or weight hard to think about, talking to someone helps.
          </Note>
        </Section>
      ) : null}

      {nutrition ? (
        <Section title="Fuel a run">
          <FuelPlanner weightKg={nutrition.weight_kg} sweat={{ typical: sweat.typical_ml_per_hour, warm: sweat.warm_ml_per_hour }} />
          <Note>
            Fluid amounts use your own sweat rate: about {sweat.typical_ml_per_hour ?? '–'} ml an hour on your runs of the last six months
            {sweat.warm_ml_per_hour ? ` (${sweat.warm_ml_per_hour} ml on warm ones)` : ''}, from Garmin’s estimates. Aim to lose less than 2% of body weight on
            a run, not to replace everything you sweat. Practise new foods and gels on training runs, never first on race day.
          </Note>
        </Section>
      ) : null}
    </div>
  );
}

function signedText(value: number, unit: string): string {
  if (value === 0) return 'no change in a month';
  return `${value > 0 ? '+' : '−'}${Math.abs(value)}${unit} in a month`;
}
