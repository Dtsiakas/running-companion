/**
 * Insights: what the numbers add up to. Signals say what deserves attention today; patterns say what tends to help
 * or hurt you, from your own history. Both only read, and both state their numbers, so you can check them.
 */
export { getPatterns, type Pattern, type PatternResult } from './patterns.ts';
export { getSignals, type Signal } from './signals.ts';
export { getWeeklyReport, type ReportLine, type WeeklyReport } from './report.ts';
export { getBodyReport, type BodyReport } from './body.ts';
export { dailyRanges, fuelPlan, GUIDANCE_SOURCE, type DailyRanges, type FuelPlan } from './fuel.ts';
export { getSleepReport, STAGE_IDEAL, type Night, type SleepReport } from './sleep.ts';
export { getStressReport, type BatteryDay, type StressReport } from './stress.ts';
export { getProgress, getYearReview, weekOf, type Milestone, type Progress, type YearReview } from './progress.ts';
export { getFormTrend, type FormMeasure, type FormSeries, type FormTrend } from './form.ts';
