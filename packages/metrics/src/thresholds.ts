/**
 * Heart-rate anchors every metric depends on. Derived from Garmin's current profile values,
 * and applied to the whole history so trends are measured against one fixed yardstick.
 */
export interface Thresholds {
  maxHr: number;
  /** Fallback resting HR when a day has no measurement. */
  restingHr: number;
  /** Lactate threshold HR (LT2): roughly the hardest effort you can sustain for about an hour. */
  lthr: number;
  /**
   * First lactate/ventilatory threshold (LT1): the top of truly easy running.
   * Without a lab test, ~88% of LTHR is a common approximation.
   */
  lt1Hr: number;
  /** Fixed HR for "pace at a given heart rate": ~85% of LTHR, a typical easy-run heart rate. */
  refHr: number;
}

export interface ProfileValues {
  max_hr: number | null;
  resting_hr_used: number | null;
  lactate_threshold_hr: number | null;
}

export function thresholdsFromProfile(profile: ProfileValues | undefined): Thresholds {
  const maxHr = profile?.max_hr ?? 190;
  const lthr = profile?.lactate_threshold_hr ?? Math.round(maxHr * 0.9);
  return {
    maxHr,
    restingHr: profile?.resting_hr_used ?? 50,
    lthr,
    lt1Hr: Math.round(lthr * 0.88),
    refHr: Math.round(lthr * 0.85),
  };
}
