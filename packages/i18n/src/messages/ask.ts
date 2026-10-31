import { define } from '../define.ts';

/**
 * The "Ask Claude" buttons. Only the button text is translated: the request itself stays in English, the language the
 * connector's tools and guide are written in, and ends with a line asking Claude to answer in the reader's language.
 */
export const ask = define(
  {
    answerIn: '',
    units: { metric: '', imperial: 'Give distances in miles, paces per mile, temperatures in °F and weights in pounds.' },
    trainToday: { label: 'Should I train hard today?', hint: 'Recovery, last night and recent load, against Garmin’s plan' },
    healthCheck: { label: 'Health check', hint: 'Two weeks of sleep, HRV, heart rate, breathing and stress' },
    planWeek: { label: 'Plan my week', hint: 'What to watch this week' },
    fuel: { label: 'Fuel my next long run', hint: 'Food and drink before, during and after' },
    weeklyReview: { label: 'Write my weekly review', hint: 'Training, recovery and one focus for next week' },
    runDebrief: { label: 'Debrief this run', hint: 'Execution, effort and what it says about your fitness' },
    sleepPlan: { label: 'Help me sleep more', hint: 'A step-by-step bedtime plan' },
    whyTired: { label: 'Why am I tired?', hint: 'Body Battery, stress and sleep together' },
    yearReview: { label: (year: number) => `Write my ${year} in review`, hint: 'The year’s story, from your data' },
    formReview: { label: 'Review my running form', hint: 'Cadence, contact time and bounce over months' },
  },
  {
    answerIn: 'Answer in Greek.',
    units: { metric: '', imperial: 'Give distances in miles, paces per mile, temperatures in °F and weights in pounds.' },
    trainToday: { label: 'Να προπονηθώ δυνατά σήμερα;', hint: 'Αποκατάσταση, χθεσινή νύχτα και πρόσφατο φορτίο, σε σχέση με το πλάνο του Garmin' },
    healthCheck: { label: 'Έλεγχος υγείας', hint: 'Δύο εβδομάδες ύπνου, HRV, παλμών, αναπνοής και στρες' },
    planWeek: { label: 'Σχεδίασε την εβδομάδα μου', hint: 'Τι να προσέξω αυτή την εβδομάδα' },
    fuel: { label: 'Διατροφή για το επόμενο μεγάλο τρέξιμο', hint: 'Φαγητό και υγρά πριν, κατά τη διάρκεια και μετά' },
    weeklyReview: { label: 'Γράψε την εβδομαδιαία ανασκόπηση', hint: 'Προπόνηση, αποκατάσταση και ένας στόχος για την επόμενη εβδομάδα' },
    runDebrief: { label: 'Ανάλυση αυτού του τρεξίματος', hint: 'Εκτέλεση, προσπάθεια και τι λέει για τη φυσική σου κατάσταση' },
    sleepPlan: { label: 'Βοήθησέ με να κοιμάμαι περισσότερο', hint: 'Ένα πλάνο ύπνου βήμα βήμα' },
    whyTired: { label: 'Γιατί είμαι κουρασμένος;', hint: 'Body Battery, στρες και ύπνος μαζί' },
    yearReview: { label: (year: number) => `Η χρονιά μου, ${year}`, hint: 'Η ιστορία της χρονιάς, από τα δεδομένα σου' },
    formReview: { label: 'Ανάλυση της τεχνικής μου', hint: 'Βηματισμός, χρόνος επαφής και αναπήδηση σε βάθος μηνών' },
  },
);
