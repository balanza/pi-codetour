# @balanza/pi-codetour

A [pi](https://github.com/earendil-works/pi) extension that turns the agent into
a **guided code tour**: when you ask how something works, pi can open an editor
in a terminal split and point it at the exact file/line it is talking about,
while you browse an interactive list of the relevant spots.

## How it works

```
you ask a question
      │
      ▼
pi calls the `code_tour` tool with a list of "stops"
      │
      ▼
extension splits the terminal (wezterm → tmux) and launches an editor (nvim)
      │
      ▼
you get an interactive list of stops; moving the cursor drives the editor
```

- **Split**: the bigger dimension of the pi pane is split, so a wide terminal
  splits side-by-side and a tall terminal splits top/bottom.
- **Multiplexer**: WezTerm if available, otherwise tmux.
- **Editor**: Neovim (LazyVim), driven over a `--listen` socket and opened
  **read-only** (`-R` + `:view`) since this is a navigation pane. The editor
  layer is abstracted so more editors can be added later.
- **Lifecycle**: the editor pane is created on the first tour and **closed when
  you quit the tour**; the next tour reopens a fresh one.

## Install

```bash
pi install npm:@balanza/pi-codetour
```

## Usage

Or load it directly during development:

```bash
pi --extension ~/pi-codetour/index.ts
```

Then just ask the agent to explain part of the codebase. When it wants to show
you code it will open the tour. Navigate with `↑`/`↓` (the editor follows),
`enter` to focus the editor pane, `esc`/`q` to return to the chat (which also
closes the editor pane).

Re-open the most recent tour any time with `/codetour`.

## Development

```bash
npm run lint        # Biome lint + format check
npm run format      # apply Biome fixes
npm test            # node:test suite over the pi-free engine
npm run typecheck   # tsc --noEmit (needs the pi host packages present)
```

CI (`.github/workflows/ci.yml`) runs lint, tests, and typecheck on every push
and pull request. The pure engine (`src/terminal.ts`, `src/editor.ts`) has no
pi imports and is unit-tested directly; `index.ts` and `src/tour-ui.ts` are the
pi adapter layer and are covered by the typecheck step.

## Releasing

Publishing to npm is automated by `.github/workflows/release.yml`, which runs on
any pushed `v*.*.*` tag. One-time setup:

1. Create an npm **automation** access token and add it as the repo secret
   `NPM_TOKEN` (Settings → Secrets and variables → Actions).
2. Point `repository.url` in `package.json` at this GitHub repo — required for
   the [npm provenance](https://docs.npmjs.com/generating-provenance-statements)
   attestation. (Drop `publishConfig.provenance` and the `id-token` permission
   in the workflow if you don't want provenance.)

Then cut a release. The version is derived from the conventional commits made
since the last `v*` tag:

- any **breaking change** (`type!:` or a `BREAKING CHANGE:` footer) → major
- otherwise any **`feat`** → minor
- otherwise → patch

```bash
npm run version:next     # print the next version without changing anything
npm run version:next -- --json   # same, as JSON
npm run release          # bump package.json + create the vX.Y.Z commit & tag
git push --follow-tags   # the Release workflow publishes the matching version
```

The `--json` form prints the full decision as one compact line, so it pipes
directly into `jq`:

```bash
$ npm run version:next -- --json | jq -r .nextVersion
0.2.0
```

```json
{"lastVersion":"0.1.0","nextVersion":"0.2.0","numCommits":13,"bump":"minor","source":"package.json","lastTag":null}
```

(The project `.npmrc` sets `loglevel=silent` so npm's `> pkg@version script`
banner stays off stdout; CI overrides it with `NPM_CONFIG_LOGLEVEL=notice`.)

`bump` is `null` when there are no commits since the last tag (then
`nextVersion` equals `lastVersion`).

The workflow re-runs lint/test/typecheck, verifies the tag matches
`package.json` version, publishes with `--access public`, and creates a GitHub
release for the tag with auto-generated notes and the npm tarball attached.
