/**
 * Lets Node find the app's own packages (@companion/*) in packages/ without node_modules links. The installed desktop
 * app loads it with NODE_OPTIONS=--import=<this file>, so it applies to the server and every process it starts.
 *
 * Why not links: an installer can't carry them, making them on first start (junctions on Windows) proved unreliable
 * on real machines, and the packages can't be copied into node_modules either, because Node won't run TypeScript
 * from there. A resolve hook needs none of that: it maps each name to the file its package.json exports.
 *
 * Imports nothing of the app's own, so it can't depend on what it's there to resolve.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGES = join(import.meta.dirname, '..', '..');

/** name → { "." → file URL, "./fuel" → file URL, … } */
const packages = new Map<string, Map<string, string>>();
for (const dir of readdirSync(PACKAGES)) {
  const manifest = join(PACKAGES, dir, 'package.json');
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { name: string; exports?: string | Record<string, string> };
  const exports = typeof pkg.exports === 'string' ? { '.': pkg.exports } : (pkg.exports ?? {});
  packages.set(pkg.name, new Map(Object.entries(exports).map(([subpath, file]) => [subpath, pathToFileURL(join(PACKAGES, dir, file)).href])));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const match = /^(@companion\/[^/]+)(\/.+)?$/.exec(specifier);
    const url = match ? packages.get(match[1]!)?.get(`.${match[2] ?? ''}`) : undefined;
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});
