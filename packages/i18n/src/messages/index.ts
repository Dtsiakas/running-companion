import { app } from './app.ts';
import { ask } from './ask.ts';
import { body } from './body.ts';
import { charts } from './charts.ts';
import { fuel } from './fuel.ts';
import { insight } from './insight.ts';
import { notes } from './notes.ts';
import { pages } from './pages.ts';
import { patterns } from './patterns.ts';
import { progress } from './progress.ts';
import { report } from './report.ts';
import { run } from './run.ts';
import { settings } from './settings.ts';
import { signals } from './signals.ts';
import { sleep } from './sleep.ts';
import { status } from './status.ts';
import { today } from './today.ts';
import { trends } from './trends.ts';
import { weather } from './weather.ts';
import { week } from './week.ts';

/** Every area of text. Add an area here when you add its file. */
export const AREAS = { app, settings, insight, notes, today, run, charts, signals, weather, week, sleep, body, fuel, progress, trends, patterns, status, report, pages, ask };
