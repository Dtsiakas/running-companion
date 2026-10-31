# Contributing

Bug reports, ideas and pull requests are welcome. Before a larger change, open an issue first so we can agree on the
approach; it saves you work if the idea needs to change shape.

## Getting started

Node 26 (`.nvmrc`), then:

```sh
npm ci
npm run build
npm run demo          # the whole app on generated data: http://localhost:8788
npm run dev:web       # the dashboard with instant reload, against a running server
```

The demo needs no Garmin account, and `npm run demo -- --missing hrv,scale` shows how a screen copes with less data.
Please check changes there, in both themes, at phone width, and in Greek.

Before a pull request: `npm run typecheck`, `npm test` and `npm run build`. CI runs the same, and also builds and
starts the Docker image.

## How the code is written

- **TypeScript that Node can run as is.** The server has no build step: no enums, parameter properties or namespaces
  (`erasableSyntaxOnly` rejects them).
- **Few dependencies.** Node's built-ins first (`node:sqlite`, `fetch`, `node:test`, `zlib`). A new dependency needs a
  reason.
- **Styles** are CSS Modules using the design tokens in `packages/web/src/styles/tokens.css`. Inline styles only for
  values computed from data (a position on a scale, a share of a bar), and colours always from the tokens.
- **Text** lives in `packages/i18n/src/messages/`, English and Greek together; the typecheck fails if one is missing.
  Numbers, units and dates go through `f` (`packages/i18n/src/format.ts`), never `toFixed` or a hard-coded unit. Greek
  uses the informal "εσύ". If you don't speak Greek, write the English and leave a note in the pull request.
- **Database changes** are a new numbered file in `packages/db/migrations/`. Never edit one that's been released.
- **Metrics** say where their formula comes from and what it assumes, in a comment and in the README's table.
- **Honest numbers.** The app explains associations, not causes, shows sample sizes, and hides a section rather than
  showing a guess when the data isn't there.
- **Tests** use synthetic or demo data only. Never commit real health data, keys or a `data/` folder.

## Releases

See [Releases](README.md#releases) in the README. Changes worth mentioning go under `Unreleased` in `CHANGELOG.md` in
the same pull request.

## License

Contributions are under the project's license, AGPL-3.0-or-later.
