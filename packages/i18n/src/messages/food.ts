import { define, plural } from '../define.ts';

/** The food log: the Today card, the Body section and the server's feedback (packages/insights/src/nutrition.ts). */
export const food = define(
  {
    title: 'Food',
    today: 'Food today',
    empty: 'Nothing logged today. Send Claude a photo or a description of a meal and ask it to log it.',
    soFar: 'So far today',
    protein: 'Protein',
    carbs: 'Carbohydrate',
    fat: 'Fat',
    target: (range: string) => `target ${range}`,
    remove: 'Remove',
    removeLabel: (what: string) => `Remove ${what}`,
    last14: 'Last 14 days',
    eaten: 'Eaten',
    burned: 'Burned',
    notLogged: 'not logged',
    partial: 'probably not everything',
    estimateNote:
      'Amounts are Claude’s estimates from photos and descriptions, often 20–30% off for a single meal: read them as trends. Days with less than 1,200 kcal logged are treated as not fully logged and left out of the feedback. Targets: protein 1.4–2.0 g per kg, carbohydrate by the day’s training (rest, about an hour, hard), from the sports-nutrition position stands.',
    feedback: {
      notEnough: 'Log a few full days of meals for feedback on how you eat around your training.',
      proteinLow: (days: number, total: number, low: string) => `Protein was below ${low} on ${days} of your last ${total} fully logged days. Spreading 25–40 g over each meal is the easiest way to get there.`,
      carbsLowHard: (days: number) => `Carbohydrate was below the range for a hard day on ${days} ${plural(days, 'hard day', 'hard days')}. Hard sessions and long runs run on carbohydrate; low days show up as heavy legs and slower recovery.`,
      beforeLong: (date: string, carbs: string, low: string) => `The day before your long run on ${date} you logged ${carbs} of carbohydrate, below ${low}. A bigger carbohydrate day before long runs makes them easier.`,
      underFueled: (days: number, gap: string) =>
        `On ${days} training ${plural(days, 'day', 'days')} you ate about ${gap} less than you burned. A big gap on training days slows recovery and, over weeks, affects health and performance; eat more on those days, mostly carbohydrate.`,
      good: 'Protein and carbohydrate were in range on most fully logged days.',
    },
  },
  {
    title: 'Φαγητό',
    today: 'Φαγητό σήμερα',
    empty: 'Δεν έχει καταγραφεί τίποτα σήμερα. Στείλε στο Claude μια φωτογραφία ή μια περιγραφή ενός γεύματος και ζήτα του να το καταγράψει.',
    soFar: 'Μέχρι τώρα σήμερα',
    protein: 'Πρωτεΐνη',
    carbs: 'Υδατάνθρακες',
    fat: 'Λιπαρά',
    target: (range: string) => `στόχος ${range}`,
    remove: 'Αφαίρεση',
    removeLabel: (what: string) => `Αφαίρεση: ${what}`,
    last14: 'Τελευταίες 14 μέρες',
    eaten: 'Έφαγες',
    burned: 'Έκαψες',
    notLogged: 'χωρίς καταγραφή',
    partial: 'μάλλον όχι όλα',
    estimateNote:
      'Οι ποσότητες είναι εκτιμήσεις του Claude από φωτογραφίες και περιγραφές, συχνά με απόκλιση 20–30% για ένα γεύμα: διάβασέ τις ως τάσεις. Μέρες με λιγότερες από 1.200 kcal καταγραμμένες θεωρούνται ελλιπείς και δεν μετράνε στα σχόλια. Στόχοι: πρωτεΐνη 1,4–2,0 g ανά κιλό, υδατάνθρακες ανάλογα με την προπόνηση της μέρας (ξεκούραση, περίπου μία ώρα, δύσκολη), από τις θέσεις των επιστημονικών εταιρειών αθλητικής διατροφής.',
    feedback: {
      notEnough: 'Κατάγραψε μερικές ολόκληρες μέρες γευμάτων για σχόλια σχετικά με το πώς τρως γύρω από την προπόνηση.',
      proteinLow: (days: number, total: number, low: string) => `Η πρωτεΐνη ήταν κάτω από ${low} σε ${days} από τις τελευταίες ${total} πλήρως καταγραμμένες μέρες. 25–40 g σε κάθε γεύμα είναι ο πιο εύκολος τρόπος να φτάσεις εκεί.`,
      carbsLowHard: (days: number) => `Οι υδατάνθρακες ήταν κάτω από το εύρος για δύσκολη μέρα σε ${days} ${plural(days, 'δύσκολη μέρα', 'δύσκολες μέρες')}. Οι δύσκολες προπονήσεις και τα μεγάλα τρεξίματα θέλουν υδατάνθρακες· όταν λείπουν, τα πόδια βαραίνουν και η αποκατάσταση αργεί.`,
      beforeLong: (date: string, carbs: string, low: string) => `Την προηγούμενη μέρα του μεγάλου τρεξίματος στις ${date} κατέγραψες ${carbs} υδατάνθρακες, κάτω από ${low}. Περισσότεροι υδατάνθρακες την προηγούμενη μέρα κάνουν τα μεγάλα τρεξίματα πιο εύκολα.`,
      underFueled: (days: number, gap: string) =>
        `Σε ${days} ${plural(days, 'μέρα', 'μέρες')} προπόνησης έφαγες περίπου ${gap} λιγότερα από όσα έκαψες. Μεγάλη διαφορά τις μέρες προπόνησης καθυστερεί την αποκατάσταση και, σε βάθος εβδομάδων, επηρεάζει υγεία και απόδοση· τρώγε περισσότερο εκείνες τις μέρες, κυρίως υδατάνθρακες.`,
      good: 'Η πρωτεΐνη και οι υδατάνθρακες ήταν μέσα στο εύρος τις περισσότερες πλήρως καταγραμμένες μέρες.',
    },
  },
);
