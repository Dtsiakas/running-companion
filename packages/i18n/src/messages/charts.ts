import { define } from '../define.ts';

/** Words inside charts, maps and bars. */
export const charts = define(
  {
    intensity: { low: 'Easy', moderate: 'Moderate', high: 'Hard', noData: 'No heart-rate data for this period.' },
    run: {
      pace: 'Pace',
      heartRate: 'Heart rate',
      power: 'Power',
      elevation: 'Elevation',
      noRecords: 'No second-by-second data for this run.',
      hint: 'Touch or hover a chart to see the values at that point.',
      minutes: (n: number) => `${n} min`,
    },
    map: { start: 'Start', finish: 'Finish' },
    load: {
      fitness: 'Fitness',
      fatigue: 'Fatigue',
      form: 'Form',
      loadThatDay: (load: string) => `Load that day ${load}`,
      restDay: 'Rest day',
      label: (fitness: string, fatigue: string, days: number) => `Fitness ${fitness} and fatigue ${fatigue} over the last ${days} days`,
    },
    stages: { deep: 'Deep', rem: 'REM', light: 'Light', awake: 'Awake' },
  },
  {
    intensity: { low: 'Χαλαρά', moderate: 'Μέτρια', high: 'Έντονα', noData: 'Δεν υπάρχουν δεδομένα καρδιακού ρυθμού για αυτή την περίοδο.' },
    run: {
      pace: 'Ρυθμός',
      heartRate: 'Καρδιακός ρυθμός',
      power: 'Ισχύς',
      elevation: 'Υψόμετρο',
      noRecords: 'Δεν υπάρχουν δεδομένα ανά δευτερόλεπτο για αυτό το τρέξιμο.',
      hint: 'Άγγιξε ή πέρασε τον δείκτη πάνω από ένα γράφημα για να δεις τις τιμές σε εκείνο το σημείο.',
      minutes: (n: number) => `${n} λεπτά`,
    },
    map: { start: 'Αφετηρία', finish: 'Τερματισμός' },
    load: {
      fitness: 'Φυσική κατάσταση',
      fatigue: 'Κούραση',
      form: 'Φόρμα',
      loadThatDay: (load: string) => `Φορτίο εκείνης της μέρας ${load}`,
      restDay: 'Μέρα ξεκούρασης',
      label: (fitness: string, fatigue: string, days: number) => `Φυσική κατάσταση ${fitness} και κούραση ${fatigue} τις τελευταίες ${days} ημέρες`,
    },
    stages: { deep: 'Βαθύς', rem: 'REM', light: 'Ελαφρύς', awake: 'Ξύπνιος' },
  },
);
