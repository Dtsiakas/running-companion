import { INTL_TAG, type Locale } from './locale.ts';

const KM_PER_MILE = 1.609344;
const LB_PER_KG = 2.2046226;
const FT_PER_M = 3.2808399;
const ML_PER_FL_OZ = 29.5735;

/** The placeholder for a missing value, everywhere. */
export const NONE = '–';

/**
 * Numbers, units and dates for one locale. Everything the app shows passes through here, so metric/imperial and the
 * decimal comma are decided in one place. Values in the database and the API stay metric (metres, m/s, kg, °C);
 * only what a person reads is converted.
 */
export function createFormat(locale: Locale) {
  const tag = INTL_TAG[locale.lang];
  const imperial = locale.units === 'imperial';
  const numberFormats = new Map<number, Intl.NumberFormat>();
  const nf = (digits: number) => {
    let format = numberFormats.get(digits);
    if (!format) numberFormats.set(digits, (format = new Intl.NumberFormat(tag, { minimumFractionDigits: 0, maximumFractionDigits: digits })));
    return format;
  };
  const missing = (value: number | null | undefined): value is null | undefined => value === null || value === undefined || !Number.isFinite(value);
  const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
  const asDate = (date: string) => new Date(`${date}T12:00:00`);
  const dateFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, options);
  const long = dateFormat({ weekday: 'long', day: 'numeric', month: 'long' });
  const short = dateFormat({ weekday: 'short', day: 'numeric', month: 'short' });
  const dayMonth = dateFormat({ day: 'numeric', month: 'short' });
  const dayMonthYear = dateFormat({ day: 'numeric', month: 'short', year: 'numeric' });
  const weekdayShort = dateFormat({ weekday: 'short' });
  const monthLong = dateFormat({ month: 'long', year: 'numeric' });
  const monthName = dateFormat({ month: 'long' });
  const monthLetter = dateFormat({ month: 'narrow' });
  const time = dateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  const clock = (seconds: number | null | undefined): string => {
    if (missing(seconds)) return NONE;
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };

  // Hour and minute marks: "7h 26m" in English, "7ώ 26λ" in Greek.
  const H = locale.lang === 'el' ? 'ώ' : 'h';
  const M = locale.lang === 'el' ? 'λ' : 'm';
  const MIN = locale.lang === 'el' ? 'λεπτά' : 'min';

  const format = {
    locale,
    tag,
    imperial,

    /** 1234.5 → "1,234.5" (English) or "1.234,5" (Greek). */
    number: (value: number | null | undefined, digits = 0): string => (missing(value) ? NONE : nf(digits).format(round(value, digits))),
    /** A signed number with a real minus sign: "+3", "−2.5". */
    signed: (value: number | null | undefined, digits = 0): string => {
      if (missing(value)) return NONE;
      const text = nf(digits).format(Math.abs(round(value, digits)));
      return round(value, digits) > 0 ? `+${text}` : round(value, digits) < 0 ? `−${text}` : text;
    },
    percent: (value: number | null | undefined, digits = 0): string => (missing(value) ? NONE : `${nf(digits).format(round(value, digits))}%`),

    // Distance ---------------------------------------------------------------------------------------------------
    distanceUnit: imperial ? 'mi' : 'km',
    /** Kilometres in the reader's unit, as a number (for charts and sums). */
    distanceValue: (km: number | null | undefined): number | null => (missing(km) ? null : imperial ? km / KM_PER_MILE : km),
    /** "12.3 km" / "7.6 mi" */
    distance: (km: number | null | undefined, digits = 1): string => (missing(km) ? NONE : `${nf(digits).format(round(imperial ? km / KM_PER_MILE : km, digits))} ${imperial ? 'mi' : 'km'}`),
    /** A distance in the reader's unit back to kilometres (milestones, targets). */
    toKm: (value: number): number => (imperial ? value * KM_PER_MILE : value),
    /** One unit of distance in metres: 1000 or 1609.344. */
    unitMetres: imperial ? KM_PER_MILE * 1000 : 1000,

    // Pace -------------------------------------------------------------------------------------------------------
    paceUnit: imperial ? '/mi' : '/km',
    /** Seconds per km or mile. */
    paceSeconds: (speedMps: number | null | undefined): number | null => (missing(speedMps) || speedMps <= 0 ? null : (imperial ? KM_PER_MILE * 1000 : 1000) / speedMps),
    /** "5:22" (no unit) from m/s. */
    paceValue: (speedMps: number | null | undefined): string => (missing(speedMps) || speedMps <= 0 ? NONE : clock((imperial ? KM_PER_MILE * 1000 : 1000) / speedMps)),
    /** "5:22/km" / "8:38/mi" from m/s. */
    pace: (speedMps: number | null | undefined): string => (missing(speedMps) || speedMps <= 0 ? NONE : `${clock((imperial ? KM_PER_MILE * 1000 : 1000) / speedMps)}${imperial ? '/mi' : '/km'}`),
    /** A pace in seconds per km, in the reader's unit: "4:21/km" or "7:00/mi". */
    paceFromSecondsPerKm: (seconds: number | null | undefined): string => (missing(seconds) ? NONE : `${clock(imperial ? seconds * KM_PER_MILE : seconds)}${imperial ? '/mi' : '/km'}`),
    /** A pace difference in seconds per km, converted ("4 s/km" / "6 s/mi"). */
    paceDelta: (secondsPerKm: number, digits = 0): string => `${nf(digits).format(round(Math.abs(imperial ? secondsPerKm * KM_PER_MILE : secondsPerKm), digits))} s${imperial ? '/mi' : '/km'}`,

    // Other units ---------------------------------------------------------------------------------------------------
    temperatureUnit: imperial ? '°F' : '°C',
    temperatureValue: (celsius: number | null | undefined): number | null => (missing(celsius) ? null : imperial ? celsius * 1.8 + 32 : celsius),
    temperature: (celsius: number | null | undefined, digits = 0): string => (missing(celsius) ? NONE : `${nf(digits).format(round(imperial ? celsius * 1.8 + 32 : celsius, digits))}${imperial ? '°F' : '°C'}`),
    /** A temperature difference (no 32° offset). */
    temperatureDelta: (celsius: number, digits = 0): string => `${nf(digits).format(round(imperial ? celsius * 1.8 : celsius, digits))}${imperial ? '°F' : '°C'}`,
    weightUnit: imperial ? 'lb' : 'kg',
    weightValue: (kg: number | null | undefined): number | null => (missing(kg) ? null : imperial ? kg * LB_PER_KG : kg),
    weight: (kg: number | null | undefined, digits = 1): string => (missing(kg) ? NONE : `${nf(digits).format(round(imperial ? kg * LB_PER_KG : kg, digits))} ${imperial ? 'lb' : 'kg'}`),
    elevationUnit: imperial ? 'ft' : 'm',
    elevation: (metres: number | null | undefined): string => (missing(metres) ? NONE : `${nf(0).format(Math.round(imperial ? metres * FT_PER_M : metres))} ${imperial ? 'ft' : 'm'}`),
    /** Fluids: "500 ml" / "17 fl oz". */
    volume: (ml: number | null | undefined): string => (missing(ml) ? NONE : imperial ? `${nf(0).format(Math.round(ml / ML_PER_FL_OZ))} fl oz` : `${nf(0).format(Math.round(ml / 10) * 10)} ml`),
    /** Litres for larger amounts: "1.2 l" / "41 fl oz". */
    litres: (ml: number | null | undefined): string => (missing(ml) ? NONE : imperial ? `${nf(0).format(Math.round(ml / ML_PER_FL_OZ))} fl oz` : `${nf(1).format(round(ml / 1000, 1))} l`),
    speed: (kmh: number | null | undefined): string => (missing(kmh) ? NONE : imperial ? `${nf(0).format(Math.round(kmh / KM_PER_MILE))} mph` : `${nf(0).format(Math.round(kmh))} km/h`),

    // Time ---------------------------------------------------------------------------------------------------------
    /** "4:21" or "1:02:05" */
    clock,
    /** 7.43 → "7h 26"; under an hour, "47 min" (not "0h 47"). */
    hoursMinutes: (hours: number | null | undefined): string => {
      if (missing(hours)) return NONE;
      const total = Math.round(hours * 60);
      return total < 60 ? `${total} ${MIN}` : `${Math.floor(total / 60)}${H} ${String(total % 60).padStart(2, '0')}`;
    },
    /** 6.6 → "6h 36m"; under an hour, "47 min". */
    hours: (hours: number | null | undefined): string => {
      if (missing(hours)) return NONE;
      const total = Math.round(hours * 60);
      return total < 60 ? `${total} ${MIN}` : `${Math.floor(total / 60)}${H} ${String(total % 60).padStart(2, '0')}${M}`;
    },
    /** A span of minutes: "45 min" or "3h 07m". */
    span: (minutes: number | null | undefined): string => {
      if (missing(minutes)) return NONE;
      const m = Math.abs(Math.round(minutes));
      return m < 60 ? `${m} ${MIN}` : `${Math.floor(m / 60)}${H} ${String(m % 60).padStart(2, '0')}${M}`;
    },
    /** "45 min" */
    minutes: (minutes: number | null | undefined): string => (missing(minutes) ? NONE : `${nf(0).format(Math.round(minutes))} ${MIN}`),
    /** Minutes after midnight → "23:15" */
    clockTime: (minutes: number | null | undefined): string => {
      if (missing(minutes)) return NONE;
      const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    },

    // Dates (YYYY-MM-DD) ---------------------------------------------------------------------------------------------
    /** "Saturday 31 October" / "Σάββατο 31 Οκτωβρίου" */
    longDay: (date: string) => long.format(asDate(date)),
    /** "Sat 31 Oct" */
    shortDay: (date: string) => short.format(asDate(date)),
    /** "31 Oct" */
    dayMonth: (date: string) => dayMonth.format(asDate(date)),
    /** "31 Oct 2026" */
    dayMonthYear: (date: string) => dayMonthYear.format(asDate(date)),
    /** "Sat" */
    weekday: (date: string) => weekdayShort.format(asDate(date)),
    /** "October 2026" */
    monthYear: (date: string) => monthLong.format(asDate(date)),
    /** "October" */
    monthName: (date: string) => monthName.format(asDate(date)),
    /** "O" */
    monthLetter: (date: string) => monthLetter.format(asDate(date)),
    /** "14:06" */
    time: (at: Date) => time.format(at),
    /** "26 Oct – 1 Nov 2026" */
    weekRange: (start: string, end: string): string => {
      const s = asDate(start);
      const e = asDate(end);
      const from = s.getMonth() === e.getMonth() ? dateFormat({ day: 'numeric' }).format(s) : dayMonth.format(s);
      return `${from} – ${dayMonthYear.format(e)}`;
    },
    /** "Sat 31 Oct, 14:06" style list joining: "a, b and c" / "α, β και γ". */
    list: (items: string[]): string => new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }).format(items),
  };
  return format;
}

export type Format = ReturnType<typeof createFormat>;
