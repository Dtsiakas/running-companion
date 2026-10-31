import { define } from '../define.ts';

/** Why today's status isn't green (packages/metrics/src/daily.ts stores the numbers; these sentences show them). */
export const status = define(
  {
    hrv_low: (value: string, normal: string) => `7-day HRV ${value} ms is below your normal ${normal} ms`,
    rhr_high: (value: string, normal: string) => `Resting HR ${value} bpm is above your normal ${normal} bpm`,
    short_sleep: (value: string, normal: string) => `Slept ${value} h, well under your usual ${normal} h`,
    load_spike: (value: string) => `This week's load is ${value}× your 4-week average`,
    deep_fatigue: (value: string) => `Form is ${value}: fatigue is well above fitness`,
  },
  {
    hrv_low: (value: string, normal: string) => `Το HRV 7 ημερών (${value} ms) είναι κάτω από το συνηθισμένο σου (${normal} ms)`,
    rhr_high: (value: string, normal: string) => `Οι παλμοί ηρεμίας (${value} bpm) είναι πάνω από το συνηθισμένο σου (${normal} bpm)`,
    short_sleep: (value: string, normal: string) => `Κοιμήθηκες ${value} ώρες, αρκετά λιγότερο από τις συνηθισμένες ${normal}`,
    load_spike: (value: string) => `Το φορτίο αυτής της εβδομάδας είναι ${value}× του μέσου όρου 4 εβδομάδων`,
    deep_fatigue: (value: string) => `Η φόρμα είναι ${value}: η κούραση είναι πολύ πάνω από τη φυσική κατάσταση`,
  },
);
