/**
 * Ready-made requests for Claude. The app can't call Claude itself on a subscription, so these open Claude with the
 * request written out; Claude then reads the data through the Running Companion connector and answers in the chat.
 *
 * Every request names the connector, says Garmin is the coach, and asks for plain language: the same rules as the app.
 */
import { shortDay, weekRange } from './dates.ts';

export interface ClaudeRequest {
  id: string;
  label: string;
  /** One line under the button: what you get. */
  hint: string;
  prompt: string;
}

const RULES =
  'Use my Running Companion connector for the data. Garmin is my coach: complement its plan, don’t replace it. ' +
  'Explain what the numbers mean for me in plain language, and say when something rests on an estimate.';

export function todayRequests(date: string): ClaudeRequest[] {
  return [
    {
      id: 'train-today',
      label: 'Should I train hard today?',
      hint: 'Recovery, last night and recent load, against Garmin’s plan',
      prompt: `${RULES}\n\nIt's ${shortDay(date)}. Look at my recovery status, last night's sleep, HRV, resting heart rate, Body Battery, yesterday's stress and my training load. Should I do today's Garmin workout as planned, ease it, or take it easy? Give a short answer first, then the reasons.`,
    },
    {
      id: 'health-check',
      label: 'Health check',
      hint: 'Two weeks of sleep, HRV, heart rate, breathing and stress',
      prompt: `${RULES}\n\nDo a health check of my last 14 days: sleep (duration, score, stages, bedtimes), HRV, resting heart rate, overnight breathing rate and SpO2, stress and Body Battery. Is anything drifting away from my normal, and what might explain it? What's going well? Don't present anything as a diagnosis; tell me if something is worth showing a doctor.`,
    },
    {
      id: 'plan-week',
      label: 'Plan my week',
      hint: 'What to watch this week',
      prompt: `${RULES}\n\nHelp me plan the week starting ${weekStartLabel(date)}. Based on my current fitness, fatigue, form, recovery trends and recent weeks, what should I watch out for, where is there room to push, and how should I handle sleep, recovery and fuel around the hard days? Keep it practical and short.`,
    },
    {
      id: 'fuel',
      label: 'Fuel my next long run',
      hint: 'Food and drink before, during and after',
      prompt: `${RULES}\n\nMy next long run is coming up. Look at my recent long runs (duration, pace, heart rate, temperature, calories) and my weight, and give me a fuel and hydration plan: what to eat before, carbohydrate and fluid during, and recovery after. Use the sports-nutrition guidelines you know and say they're general guidance. Ask me the planned distance or duration if you need it.`,
    },
  ];
}

export function weekReviewRequest(weekStart: string, weekEnd: string): ClaudeRequest {
  return {
    id: 'weekly-review',
    label: 'Write my weekly review',
    hint: 'Training, recovery and one focus for next week',
    prompt: `${RULES}\n\nWrite my weekly review for ${weekRange(weekStart, weekEnd)} Start from get_weekly_report for that week (the computed facts, signals and key sessions) and compare with the weeks before it; add whatever else you need. Cover: how training went, how recovery held up, what explains the good and the bad days, and one clear focus for next week. Under 400 words, with headings.`,
  };
}

export function runDebriefRequest(activityId: number, name: string, date: string): ClaudeRequest {
  return {
    id: 'run-debrief',
    label: 'Debrief this run',
    hint: 'Execution, effort and what it says about your fitness',
    prompt: `${RULES}\n\nDebrief my run "${name}" on ${shortDay(date)} (activity ${activityId}). Look at the planned workout against what I did step by step, pace and heart rate over the run, efficiency and decoupling, running form, the conditions, and how recovered I was going in. Compare it with similar runs from the last few months. What went well, what to adjust next time, and what it says about my fitness.`,
  };
}

/**
 * Opens Claude with the request. claude.ai/new?q= prefills the message on the web; some apps open the link without
 * the text, so the request is also copied to the clipboard and the caller tells the user they can paste it.
 */
export async function askClaude(request: ClaudeRequest): Promise<'copied' | 'not-copied'> {
  // Both start inside the click: browsers only allow opening a tab, and writing the clipboard, during the user's
  // gesture. Awaiting the clipboard first could lose the gesture and get the new tab blocked.
  let copying: Promise<void> | null = null;
  try {
    // The clipboard API is missing on non-HTTPS pages; the link alone still works there.
    copying = navigator.clipboard.writeText(request.prompt);
  } catch {
    copying = null;
  }
  window.open(`https://claude.ai/new?q=${encodeURIComponent(request.prompt)}`, '_blank', 'noopener');
  try {
    if (!copying) return 'not-copied';
    await copying;
    return 'copied';
  } catch {
    // Clipboard access can be refused; the link still carries the request.
    return 'not-copied';
  }
}

function weekStartLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function sleepRequests(): ClaudeRequest[] {
  return [
    {
      id: 'sleep-plan',
      label: 'Help me sleep more',
      hint: 'A step-by-step bedtime plan',
      prompt: `${RULES}\n\nLook at my sleep with get_sleep_stress_report and get_insights: bedtimes and wake times, sleep debt against Garmin's need, how regular my timing is, REM and deep sleep, and what my own data says affects my sleep (late bedtimes, short nights, evening runs, stressful days). Then give me a realistic plan to sleep more: move bedtime about 30 minutes at a time, hold each step for a few nights, and fit it around my runs. Keep it short and practical.`,
    },
    {
      id: 'why-tired',
      label: 'Why am I tired?',
      hint: 'Body Battery, stress and sleep together',
      prompt: `${RULES}\n\nI feel tired. Using get_sleep_stress_report and get_today, look at the last two weeks: is Body Battery charging less than it drains, are the nights too short or too late, is daytime stress up, has training load jumped? Tell me the most likely reasons, in order, and one or two things to change first. Nothing presented as a diagnosis; tell me if anything is worth showing a doctor.`,
    },
  ];
}

/** The form review only when there's running-form data to review (watches without running dynamics have none). */
export function progressRequests(year: number, hasForm = true): ClaudeRequest[] {
  const requests: ClaudeRequest[] = [
    {
      id: 'year-review',
      label: `Write my ${year} in review`,
      hint: 'The year’s story, from your data',
      prompt: `${RULES}\n\nWrite my running year in review for ${year}. Start from get_progress with year ${year} (and form: true), then add whatever else helps: how the volume and consistency built up, the personal bests and when they came, how fitness, resting heart rate, HRV, sleep and weight moved over the year, the hardest stretches and what got me through them, and what the year sets up for next year. Warm but honest, under 500 words, with headings.`,
    },
    {
      id: 'form-review',
      label: 'Review my running form',
      hint: 'Cadence, contact time and bounce over months',
      prompt: `${RULES}\n\nLook at my running form over the months with get_progress (form: true): cadence, step length, ground contact time, vertical ratio and oscillation on easy runs, all adjusted to the same pace. What has changed, what has stayed the same, and is any of it worth working on (for example with strides, drills or strength work)? Be careful with Garmin's power, which can jump with firmware updates, and remember these are watch estimates.`,
    },
  ];
  return hasForm ? requests : requests.filter((r) => r.id !== 'form-review');
}
