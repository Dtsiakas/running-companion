import { app } from './app.ts';
import { charts } from './charts.ts';
import { insight } from './insight.ts';
import { notes } from './notes.ts';
import { run } from './run.ts';
import { settings } from './settings.ts';
import { signals } from './signals.ts';
import { today } from './today.ts';

/** Every area of text. Add an area here when you add its file. */
export const AREAS = { app, settings, insight, notes, today, run, charts, signals };
