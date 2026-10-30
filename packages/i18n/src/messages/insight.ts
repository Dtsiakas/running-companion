import { define, plural } from '../define.ts';

/** Plain-language readings of the numbers on Today and elsewhere: status, "against your normal", form, load. */
export const insight = define(
  {
    status: {
      green: { label: 'Recovered', title: 'Recovered. Go with today’s plan.', detail: 'Your recovery signals are within your normal range.' },
      amber: { label: 'One signal off', title: 'One signal is off. Follow the plan, don’t add extra.', detail: 'One recovery system is outside your normal range.' },
      red: { label: 'Two signals off', title: 'Two signals are off. Consider an easier day than planned.', detail: 'Two independent recovery systems are outside your normal range at the same time.' },
      none: { label: 'No status yet', title: 'Not enough recovery data yet.', detail: 'Sync after a night with the watch on to get a status.' },
    },
    measured: { hrv: 'HRV', restingHr: 'resting heart rate', sleep: 'sleep', load: 'training load' },
    /** `list` is already joined ("HRV, sleep and training load"). */
    greenDetail: (list: string, count: number) => `${list.charAt(0).toUpperCase()}${list.slice(1)} ${count === 1 ? 'is' : count === 2 ? 'are' : 'are all'} within your normal range.`,
    relative: {
      noNormal: 'Not enough data for a normal yet',
      atNormal: 'Right at your normal',
      above: (amount: string) => `${amount} above your normal`,
      below: (amount: string) => `${amount} below your normal`,
    },
    amount: {
      minutes: (n: number) => `${n} min`,
      bpm: (n: string) => `${n} bpm`,
      points: (n: number) => `${n} ${plural(n, 'point', 'points')}`,
      breaths: (n: string) => `${n} breaths/min`,
    },
    form: {
      fresh: 'Fresh: fatigue is below your fitness, a good state before a race or hard test.',
      balanced: 'Balanced: training and recovery are in step.',
      productive: 'Productive training: you are carrying fatigue, which is how fitness is built.',
      deep: 'Deep fatigue: fatigue is far above fitness. Recovery deserves priority.',
    },
    acwr: {
      light: 'Lighter than your recent average.',
      steady: 'Steady: in line with your recent weeks.',
      building: 'Building: above your recent weeks. Fine for a while, watch recovery.',
      spike: 'A spike: well above your recent weeks, the range most linked to overuse injuries.',
    },
  },
  {
    status: {
      green: { label: 'Αποκατάσταση', title: 'Έχεις αποκατασταθεί. Ακολούθησε το σημερινό πλάνο.', detail: 'Τα σήματα αποκατάστασης είναι μέσα στο συνηθισμένο σου εύρος.' },
      amber: { label: 'Ένα σήμα εκτός', title: 'Ένα σήμα είναι εκτός. Ακολούθησε το πλάνο, χωρίς επιπλέον.', detail: 'Ένα σύστημα αποκατάστασης είναι εκτός του συνηθισμένου σου εύρους.' },
      red: { label: 'Δύο σήματα εκτός', title: 'Δύο σήματα είναι εκτός. Σκέψου μια πιο ελαφριά μέρα από το πλάνο.', detail: 'Δύο ανεξάρτητα συστήματα αποκατάστασης είναι ταυτόχρονα εκτός του συνηθισμένου σου εύρους.' },
      none: { label: 'Χωρίς κατάσταση ακόμα', title: 'Δεν υπάρχουν ακόμα αρκετά δεδομένα αποκατάστασης.', detail: 'Συγχρόνισε μετά από μια νύχτα με το ρολόι για να δεις κατάσταση.' },
    },
    measured: { hrv: 'το HRV', restingHr: 'οι παλμοί ηρεμίας', sleep: 'ο ύπνος', load: 'το προπονητικό φορτίο' },
    greenDetail: (list: string, count: number) => `${list.charAt(0).toUpperCase()}${list.slice(1)} ${count === 1 ? 'είναι' : count === 2 ? 'είναι' : 'είναι όλα'} μέσα στο συνηθισμένο σου εύρος.`,
    relative: {
      noNormal: 'Δεν υπάρχουν ακόμα αρκετά δεδομένα για το συνηθισμένο σου',
      atNormal: 'Ακριβώς στο συνηθισμένο σου',
      above: (amount: string) => `${amount} πάνω από το συνηθισμένο σου`,
      below: (amount: string) => `${amount} κάτω από το συνηθισμένο σου`,
    },
    amount: {
      minutes: (n: number) => `${n} λεπτά`,
      bpm: (n: string) => `${n} bpm`,
      points: (n: number) => `${n} ${plural(n, 'μονάδα', 'μονάδες')}`,
      breaths: (n: string) => `${n} αναπνοές/λεπτό`,
    },
    form: {
      fresh: 'Ξεκούραστος: η κούραση είναι κάτω από τη φυσική σου κατάσταση, καλή θέση πριν από αγώνα ή δύσκολο τεστ.',
      balanced: 'Ισορροπία: προπόνηση και αποκατάσταση συμβαδίζουν.',
      productive: 'Παραγωγική προπόνηση: κουβαλάς κούραση, και έτσι χτίζεται η φυσική κατάσταση.',
      deep: 'Βαθιά κούραση: η κούραση είναι πολύ πάνω από τη φυσική κατάσταση. Προτεραιότητα στην αποκατάσταση.',
    },
    acwr: {
      light: 'Πιο ελαφριά από τον πρόσφατο μέσο όρο σου.',
      steady: 'Σταθερά: στα επίπεδα των πρόσφατων εβδομάδων σου.',
      building: 'Ανοδικά: πάνω από τις πρόσφατες εβδομάδες σου. Εντάξει για λίγο, πρόσεχε την αποκατάσταση.',
      spike: 'Απότομη αύξηση: πολύ πάνω από τις πρόσφατες εβδομάδες σου, το εύρος που συνδέεται περισσότερο με τραυματισμούς από υπέρχρηση.',
    },
  },
);
