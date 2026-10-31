/**
 * Accessibility audit of every dashboard screen with axe-core, in a real browser: light and dark, desktop and phone
 * width, English and Greek. Needs the demo running (npm run demo) and Playwright's Chromium
 * (npx playwright install chromium). CI runs it on every push.
 *
 *   node scripts/a11y-audit.ts [http://localhost:8788]
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:8788';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const PAGES = ['/', '/week', '/runs', '/trends', '/sleep', '/body', '/progress', '/settings'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
}

const browser = await chromium.launch();
let problems = 0;
try {
  // The newest run, so its page (charts, laps, map) is audited too.
  const runs = (await (await fetch(`${base}/api/activities?limit=1`)).json()) as Array<{ activity_id: number }>;
  const pages = runs[0] ? [...PAGES, `/runs/${runs[0].activity_id}`] : PAGES;

  for (const locale of ['en-GB', 'el-GR']) {
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const viewport of VIEWPORTS) {
        // bypassCSP: the app's policy rightly forbids injected scripts, and axe is one.
        const context = await browser.newContext({ locale, colorScheme, viewport, bypassCSP: true });
        const page = await context.newPage();
        // Map tiles come from the internet; the audit doesn't need them.
        await page.route(/tile\.openstreetmap|basemaps\.cartocdn/, (route) => route.abort());
        for (const path of pages) {
          await page.goto(base + path, { waitUntil: 'networkidle' });
          await page.addScriptTag({ content: axeSource });
          const violations = (await page.evaluate(async () => {
            const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: unknown[] }> } }).axe;
            return (await axe.run(document, { resultTypes: ['violations'] })).violations;
          })) as Violation[];
          for (const violation of violations) {
            problems++;
            const where = `${path} (${locale}, ${colorScheme}, ${viewport.name})`;
            console.log(`✗ ${where}: ${violation.id} [${violation.impact}] ${violation.help}`);
            for (const node of violation.nodes.slice(0, 3)) console.log(`    ${node.target.join(' ')}: ${node.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
          }
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (problems) {
  console.log(`\n${problems} accessibility problem${problems === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log('✓ No accessibility problems found.');
