#!/usr/bin/env bash
# Prepares the files the desktop installer ships, in <out>/app (default dist-desktop/app):
#
#   package.json, LICENSE      the app's identity (name and version are read from package.json)
#   packages/web/dist          the built dashboard
#   packages/<name>            the app's own packages (sources, migrations), without tests
#   node_modules               what the server needs at runtime, third-party packages only
#
# The app's packages can't live inside node_modules: Node refuses to run TypeScript from there. Instead of links
# (node_modules/@companion/* → packages/*), which an installer can't carry, the launcher loads a resolve hook
# (packages/cli/src/resolve-packages.ts). The dashboard is shipped built, so its own dependencies (React, charts, maps, fonts) aren't: the runtime
# install leaves the web workspace out. The launcher is packages/cli/src/desktop.ts.
#
# Run from the repository root, on any OS with bash (CI uses Linux): nothing in the app is native code, so the same
# files run on Windows.
set -euo pipefail

out=$(mkdir -p "${1:-dist-desktop}" && cd "${1:-dist-desktop}" && pwd)
rm -rf "$out/app" "$out/runtime"
mkdir -p "$out/app/packages/web" "$out/runtime/packages"

# 1. The dashboard, built with everything installed.
npm ci --no-audit --no-fund --loglevel=error
npm run --silent build -w @companion/web -- --logLevel warn

# 2. The server's runtime dependencies: every workspace but the web one, production dependencies only, versions from
#    the lockfile.
node -e '
  const pkg = require("./package.json");
  pkg.workspaces = require("fs").readdirSync("packages").filter((name) => name !== "web").map((name) => "packages/" + name);
  delete pkg.devDependencies;
  require("fs").writeFileSync(process.argv[1], JSON.stringify(pkg, null, 2));
' "$out/runtime/package.json"
cp package-lock.json "$out/runtime/"
for dir in packages/*/; do
  name=$(basename "$dir")
  [ "$name" = web ] && continue
  mkdir -p "$out/runtime/packages/$name"
  (cd "$dir" && tar --exclude=./test --exclude=./node_modules -cf - .) | (cd "$out/runtime/packages/$name" && tar -xf -)
done
(cd "$out/runtime" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

# 3. The app folder.
cp package.json LICENSE "$out/app/"
cp -r packages/web/dist "$out/app/packages/web/dist"
for dir in "$out"/runtime/packages/*/; do cp -r "$dir" "$out/app/packages/"; done
rm -rf "$out/runtime/node_modules/@companion" "$out/runtime/node_modules/.bin" "$out/runtime/node_modules/.package-lock.json"
cp -r "$out/runtime/node_modules" "$out/app/node_modules"
rm -rf "$out/runtime"

if find "$out/app" -type l | grep -q .; then
  echo "Links left in the app folder: an installer can't carry them." >&2
  find "$out/app" -type l >&2
  exit 1
fi
if find "$out/app/node_modules" -name '*.node' | grep -q .; then
  echo "Native modules found: they would be built for the wrong platform." >&2
  find "$out/app/node_modules" -name '*.node' >&2
  exit 1
fi
echo "Staged $(du -sh "$out/app" | cut -f1) in $out/app"
