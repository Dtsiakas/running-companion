import { define } from '../define.ts';

/** Heat and the run forecast. */
export const weather = define(
  {
    heat: {
      none: 'Ideal running weather',
      mild: 'Slightly warm',
      moderate: 'Warm: easy days slower, hard days harder',
      high: 'Hot: adjust pace, drink more',
      extreme: 'Very hot: easy running only',
    },
    whenToRun: 'When to run',
    today: 'Today',
    tomorrow: 'Tomorrow',
    heatCostAbout: (pct: number) => `heat cost about ${pct}%`,
    noHeatCost: 'no heat cost',
    rainAllDay: 'Rain likely all day.',
    avoid: (from: string, temp: string, pct: number, label: string) => `Avoid around ${from}: ${temp}, about ${pct}% slower. ${label}.`,
    fine: (temp: string) => `Up to ${temp}: no hour costs much.`,
    source: (place: string, time: string, stale: boolean) => `Forecast for ${place} from Open-Meteo, updated ${time}${stale ? ' (couldn’t refresh: the forecast service is unreachable)' : ''}.`,
    usualPlace: 'where you usually run',
    note: 'The heat cost is how much slower the same effort runs at that hour (temperature plus dew point). The best window is the coolest stretch of up to three hours with under a 50% chance of rain, between 06:00 and 22:00. Garmin’s workout for the day stays the plan; this is only when to fit it in.',
  },
  {
    heat: {
      none: 'Ιδανικός καιρός για τρέξιμο',
      mild: 'Λίγο ζεστά',
      moderate: 'Ζεστά: τα χαλαρά πιο αργά, τα δύσκολα πιο δύσκολα',
      high: 'Καύσωνας: προσάρμοσε τον ρυθμό, πίνε περισσότερο',
      extreme: 'Πολύ ζεστά: μόνο χαλαρό τρέξιμο',
    },
    whenToRun: 'Πότε να τρέξεις',
    today: 'Σήμερα',
    tomorrow: 'Αύριο',
    heatCostAbout: (pct: number) => `κόστος ζέστης περίπου ${pct}%`,
    noHeatCost: 'χωρίς κόστος ζέστης',
    rainAllDay: 'Πιθανή βροχή όλη μέρα.',
    avoid: (from: string, temp: string, pct: number, label: string) => `Απόφυγε γύρω στις ${from}: ${temp}, περίπου ${pct}% πιο αργά. ${label}.`,
    fine: (temp: string) => `Έως ${temp}: καμία ώρα δεν κοστίζει πολύ.`,
    source: (place: string, time: string, stale: boolean) => `Πρόγνωση για ${place} από το Open-Meteo, ενημέρωση ${time}${stale ? ' (δεν ανανεώθηκε: η υπηρεσία πρόγνωσης δεν είναι διαθέσιμη)' : ''}.`,
    usualPlace: 'το μέρος όπου τρέχεις συνήθως',
    note: 'Το κόστος ζέστης είναι πόσο πιο αργή γίνεται η ίδια προσπάθεια εκείνη την ώρα (θερμοκρασία συν σημείο δρόσου). Το καλύτερο παράθυρο είναι το πιο δροσερό διάστημα έως τριών ωρών με πιθανότητα βροχής κάτω από 50%, ανάμεσα στις 06:00 και τις 22:00. Η προπόνηση του Garmin για τη μέρα παραμένει το πλάνο· αυτό λέει μόνο πότε να τη χωρέσεις.',
  },
);
