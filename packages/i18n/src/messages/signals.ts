import { define } from '../define.ts';

/**
 * Today's signals (written by the server: packages/insights/src/signals.ts). Numbers arrive formatted, with their
 * units, so the sentences only place them.
 */
export const signals = define(
  {
    level: { warning: 'Act today', watch: 'Keep an eye on', positive: 'Going well' },
    illness: {
      rhr: (bpm: string, above: string) => `resting heart rate ${bpm} bpm, ${above} above your normal`,
      hrv: (ms: string, normal: string) => `HRV ${ms} ms, well below your normal of ${normal}`,
      breathing: (rate: string, above: string) => `breathing rate ${rate}/min overnight, ${above} above your normal`,
      strongTitle: 'Your body may be fighting something',
      title: 'Signs your body is under strain',
      detail: (markers: string) => `Last night: ${markers}. When these move together, it often comes a day or two before feeling sick, though hard training, alcohol or a bad night can do it too.`,
      action: 'Keep today easy or rest, sleep and drink well, and skip intensity if you feel off. This is a pattern in your data, not a diagnosis: see a doctor if you feel unwell for more than a few days.',
    },
    overreaching: {
      title: 'Fatigue is building faster than you recover',
      hrvDown: 'your 7-day HRV is below normal',
      rhrUp: (bpm: string) => `resting heart rate is ${bpm} bpm above normal`,
      detail: (days: number, reasons: string) => `Form has been −25 or lower on ${days} of the last 7 days, and ${reasons}. Heavy training is fine while recovery keeps up; here it isn’t.`,
      action: 'Ease off for a few days: keep runs easy and short, or follow Garmin’s plan but skip anything extra. It usually turns around within 3–5 easier days.',
    },
    loadSpike: {
      spikeTitle: 'Training load jumped',
      title: 'Training load is building quickly',
      detail: (ratio: string, spike: boolean) => `This week’s load is ${ratio}× your average week of the last four. ${spike ? 'Above 1.5× is the range most linked to overuse injuries.' : 'Fine for a while, as long as recovery keeps up.'}`,
      action: 'Hold volume steady for a week instead of adding more, and keep the easy runs truly easy.',
    },
    longRun: {
      title: 'A big step up in long-run distance',
      detail: (recent: string, pct: number, before: string) => `Your longest run this week was ${recent}, ${pct}% longer than anything in the four weeks before (${before}). Tendons adapt more slowly than heart and lungs.`,
      action: 'Watch for calf, shin or Achilles soreness in the next days, and keep the next long run at this distance until it feels routine.',
    },
    easyDrift: {
      title: 'Easy runs aren’t staying easy',
      detail: (drifted: number, runs: number, pct: number, hot: boolean) =>
        `${drifted} of your last ${runs} easy runs spent more than a quarter of the time above your first threshold (about ${pct}% on average).${hot ? ' It has been warm, and heat alone pushes heart rate up.' : ''}`,
      action: 'Slow the easy runs down until heart rate stays under your first threshold most of the time, even if the pace feels too slow. That’s where most endurance comes from.',
    },
    balance: {
      goodTitle: 'Well-balanced training',
      good: (pct: number) => `${pct}% of your running time in the last four weeks was easy. That’s the balance endurance programmes aim for.`,
      lowTitle: 'Little easy running lately',
      low: (pct: number) => `Only ${pct}% of your running time in the last four weeks was easy, below the 70–80% that endurance progress usually rests on. Much of the rest sits in the moderate zone, which tires you without the benefit of truly hard sessions.`,
      lowAction: 'Keep Garmin’s hard sessions hard and make everything else slower.',
    },
    sleepDebt: {
      title: 'Sleep debt is adding up',
      detail: (hours: string) => `Over the last 7 nights you slept ${hours} hours less than Garmin estimated you needed. Recovery, mood and how hard runs feel all suffer from it.`,
      action: 'An earlier night or two clears it faster than sleeping in.',
    },
    bedtimes: {
      title: 'Bedtimes vary a lot',
      detail: (mean: string, sd: number, from: string, to: string) =>
        `Over the last two weeks your bedtime averaged ${mean} but typically varied by ${sd} minutes either way (from ${from} to ${to}). A steadier bedtime usually improves deep sleep and HRV.`,
      action: 'Pick a bedtime you can keep on most nights, especially before hard sessions.',
    },
    stress: {
      title: 'Stress has been high for days',
      detail: (days: string, normal: number) =>
        `All-day stress was above your normal range on each of the last three days (${days}; a typical day for you is ${normal}). Garmin’s stress rises with work and life stress, but also with illness, heat, caffeine and alcohol.`,
      action: 'If it’s life rather than training, an easy run or a walk often helps more than a hard session.',
    },
    fuelling: {
      title: 'Weight is dropping while recovery slips',
      detail: (pct: string) => `Your weight trend is down ${pct} in three weeks, while HRV or resting heart rate has moved the wrong way. That combination often means eating too little for the training.`,
      action: 'Eat more around training, mostly carbohydrate on the hard and long days (see Body for your ranges). If it keeps happening, a sports dietitian can help.',
    },
    battery: {
      title: 'Running down',
      detail: (days: number, net: string, today: number, usual: number) =>
        `Body Battery drained more than it charged on ${days} of the last 5 days (${net} in total), and this morning started at ${today} against your usual ${usual}.`,
      action: 'The fix is usually on the charging side: an earlier night or two, and a calm hour before bed. Easy runs only until mornings are back near normal.',
    },
    strong: {
      title: 'Recovery is strong',
      detail: 'Your 7-day HRV is clearly above your normal and resting heart rate is at or below it: your body is absorbing the training well.',
    },
  },
  {
    level: { warning: 'Δράσε σήμερα', watch: 'Πρόσεξέ το', positive: 'Πάει καλά' },
    illness: {
      rhr: (bpm: string, above: string) => `παλμοί ηρεμίας ${bpm} bpm, ${above} πάνω από το συνηθισμένο σου`,
      hrv: (ms: string, normal: string) => `HRV ${ms} ms, αρκετά κάτω από το συνηθισμένο σου (${normal})`,
      breathing: (rate: string, above: string) => `ρυθμός αναπνοής ${rate}/λεπτό τη νύχτα, ${above} πάνω από το συνηθισμένο σου`,
      strongTitle: 'Ίσως το σώμα σου παλεύει με κάτι',
      title: 'Σημάδια ότι το σώμα σου πιέζεται',
      detail: (markers: string) => `Χθες βράδυ: ${markers}. Όταν αυτά κινούνται μαζί, συχνά προηγούνται μιας ασθένειας κατά μία ή δύο μέρες, αν και η σκληρή προπόνηση, το αλκοόλ ή μια κακή νύχτα κάνουν το ίδιο.`,
      action: 'Κράτα τη σημερινή μέρα χαλαρή ή ξεκουράσου, κοιμήσου και πιες αρκετά, και παράλειψε την ένταση αν δεν νιώθεις καλά. Είναι μοτίβο στα δεδομένα σου, όχι διάγνωση: δες γιατρό αν δεν νιώθεις καλά για περισσότερες από λίγες μέρες.',
    },
    overreaching: {
      title: 'Η κούραση χτίζεται πιο γρήγορα απ’ ό,τι αναρρώνεις',
      hrvDown: 'το HRV 7 ημερών είναι κάτω από το συνηθισμένο',
      rhrUp: (bpm: string) => `οι παλμοί ηρεμίας είναι ${bpm} bpm πάνω από το συνηθισμένο`,
      detail: (days: number, reasons: string) => `Η φόρμα ήταν −25 ή χαμηλότερα σε ${days} από τις τελευταίες 7 ημέρες, και ${reasons}. Η βαριά προπόνηση είναι εντάξει όσο η αποκατάσταση προλαβαίνει· εδώ δεν προλαβαίνει.`,
      action: 'Χαλάρωσε για λίγες μέρες: τρεξίματα χαλαρά και σύντομα, ή ακολούθησε το πλάνο του Garmin χωρίς τίποτα επιπλέον. Συνήθως αλλάζει μέσα σε 3–5 πιο ελαφριές μέρες.',
    },
    loadSpike: {
      spikeTitle: 'Το προπονητικό φορτίο εκτινάχθηκε',
      title: 'Το προπονητικό φορτίο ανεβαίνει γρήγορα',
      detail: (ratio: string, spike: boolean) => `Το φορτίο αυτής της εβδομάδας είναι ${ratio}× της μέσης εβδομάδας των τεσσάρων τελευταίων. ${spike ? 'Πάνω από 1,5× είναι το εύρος που συνδέεται περισσότερο με τραυματισμούς από υπέρχρηση.' : 'Εντάξει για λίγο, όσο η αποκατάσταση προλαβαίνει.'}`,
      action: 'Κράτα τον όγκο σταθερό για μία εβδομάδα αντί να προσθέτεις, και κράτα τα χαλαρά τρεξίματα πραγματικά χαλαρά.',
    },
    longRun: {
      title: 'Μεγάλο άλμα στη μεγάλη απόσταση',
      detail: (recent: string, pct: number, before: string) => `Το μεγαλύτερο τρέξιμο αυτής της εβδομάδας ήταν ${recent}, ${pct}% μεγαλύτερο από οτιδήποτε τις προηγούμενες τέσσερις εβδομάδες (${before}). Οι τένοντες προσαρμόζονται πιο αργά από την καρδιά και τους πνεύμονες.`,
      action: 'Πρόσεξε για πόνο σε γάμπα, κνήμη ή αχίλλειο τις επόμενες μέρες, και κράτα το επόμενο μεγάλο τρέξιμο σε αυτή την απόσταση μέχρι να γίνει συνηθισμένο.',
    },
    easyDrift: {
      title: 'Τα χαλαρά τρεξίματα δεν μένουν χαλαρά',
      detail: (drifted: number, runs: number, pct: number, hot: boolean) =>
        `${drifted} από τα τελευταία ${runs} χαλαρά σου τρεξίματα πέρασαν πάνω από το ένα τέταρτο του χρόνου πάνω από το πρώτο κατώφλι (περίπου ${pct}% κατά μέσο όρο).${hot ? ' Κάνει ζέστη, και η ζέστη μόνη της ανεβάζει τους παλμούς.' : ''}`,
      action: 'Κατέβασε τον ρυθμό στα χαλαρά μέχρι οι παλμοί να μένουν τις περισσότερες φορές κάτω από το πρώτο κατώφλι, ακόμα κι αν ο ρυθμός μοιάζει πολύ αργός. Από εκεί έρχεται το μεγαλύτερο μέρος της αντοχής.',
    },
    balance: {
      goodTitle: 'Καλά ισορροπημένη προπόνηση',
      good: (pct: number) => `Το ${pct}% του χρόνου τρεξίματος τις τελευταίες τέσσερις εβδομάδες ήταν χαλαρό. Αυτή την ισορροπία στοχεύουν τα προγράμματα αντοχής.`,
      lowTitle: 'Λίγο χαλαρό τρέξιμο τελευταία',
      low: (pct: number) => `Μόνο το ${pct}% του χρόνου τρεξίματος τις τελευταίες τέσσερις εβδομάδες ήταν χαλαρό, κάτω από το 70–80% στο οποίο στηρίζεται συνήθως η πρόοδος στην αντοχή. Μεγάλο μέρος του υπόλοιπου είναι στη μέτρια ζώνη, που κουράζει χωρίς το όφελος των πραγματικά δύσκολων προπονήσεων.`,
      lowAction: 'Κράτα τις δύσκολες προπονήσεις του Garmin δύσκολες και κάνε όλα τα άλλα πιο αργά.',
    },
    sleepDebt: {
      title: 'Το έλλειμμα ύπνου μεγαλώνει',
      detail: (hours: string) => `Τις τελευταίες 7 νύχτες κοιμήθηκες ${hours} ώρες λιγότερο απ’ όσο εκτίμησε το Garmin ότι χρειαζόσουν. Η αποκατάσταση, η διάθεση και το πόσο δύσκολα μοιάζουν τα τρεξίματα επηρεάζονται όλα.`,
      action: 'Ένα ή δύο νωρίτερα βράδια το καλύπτουν πιο γρήγορα από το να κοιμάσαι μέχρι αργά.',
    },
    bedtimes: {
      title: 'Η ώρα που πέφτεις για ύπνο αλλάζει πολύ',
      detail: (mean: string, sd: number, from: string, to: string) =>
        `Τις τελευταίες δύο εβδομάδες έπεφτες για ύπνο κατά μέσο όρο στις ${mean}, αλλά συνήθως με απόκλιση ${sd} λεπτών προς κάθε πλευρά (από ${from} έως ${to}). Μια πιο σταθερή ώρα ύπνου συνήθως βελτιώνει τον βαθύ ύπνο και το HRV.`,
      action: 'Διάλεξε μια ώρα ύπνου που μπορείς να κρατάς τα περισσότερα βράδια, ειδικά πριν από δύσκολες προπονήσεις.',
    },
    stress: {
      title: 'Το στρες είναι υψηλό εδώ και μέρες',
      detail: (days: string, normal: number) =>
        `Το ημερήσιο στρες ήταν πάνω από το συνηθισμένο σου εύρος καθεμία από τις τρεις τελευταίες μέρες (${days}· μια τυπική μέρα για σένα είναι ${normal}). Το στρες του Garmin ανεβαίνει με το άγχος της δουλειάς και της ζωής, αλλά και με ασθένεια, ζέστη, καφεΐνη και αλκοόλ.`,
      action: 'Αν είναι η ζωή κι όχι η προπόνηση, ένα χαλαρό τρέξιμο ή μια βόλτα συχνά βοηθά περισσότερο από μια δύσκολη προπόνηση.',
    },
    fuelling: {
      title: 'Το βάρος πέφτει ενώ η αποκατάσταση υποχωρεί',
      detail: (pct: string) => `Η τάση του βάρους σου έπεσε ${pct} σε τρεις εβδομάδες, ενώ το HRV ή οι παλμοί ηρεμίας κινήθηκαν προς τη λάθος κατεύθυνση. Αυτός ο συνδυασμός συχνά σημαίνει ότι τρως πολύ λίγο για την προπόνηση.`,
      action: 'Φάε περισσότερο γύρω από την προπόνηση, κυρίως υδατάνθρακες στις δύσκολες και μεγάλες μέρες (δες το Σώμα για τα εύρη σου). Αν συνεχιστεί, ένας αθλητικός διατροφολόγος μπορεί να βοηθήσει.',
    },
    battery: {
      title: 'Αδειάζεις',
      detail: (days: number, net: string, today: number, usual: number) =>
        `Το Body Battery άδειασε περισσότερο απ’ όσο γέμισε σε ${days} από τις τελευταίες 5 μέρες (${net} συνολικά), και σήμερα το πρωί ξεκίνησε στο ${today} αντί για το συνηθισμένο ${usual}.`,
      action: 'Η λύση είναι συνήθως στη φόρτιση: ένα ή δύο νωρίτερα βράδια και μια ήρεμη ώρα πριν τον ύπνο. Μόνο χαλαρά τρεξίματα μέχρι τα πρωινά να επιστρέψουν κοντά στο συνηθισμένο.',
    },
    strong: {
      title: 'Η αποκατάσταση είναι δυνατή',
      detail: 'Το HRV 7 ημερών είναι καθαρά πάνω από το συνηθισμένο σου και οι παλμοί ηρεμίας στο συνηθισμένο ή χαμηλότερα: το σώμα σου απορροφά καλά την προπόνηση.',
    },
  },
);
