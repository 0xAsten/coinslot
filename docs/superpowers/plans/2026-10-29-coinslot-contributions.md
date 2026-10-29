# Coin Slot Contributions + Showcase Round 2 Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone's agent add a game to Coin Slot through a PR that a scaffold shapes, CI screens and the author approves, and make the showcase list games, authors and footage straight from the repo; then ship the page with an icon and share card.

**Architecture:** Each plugin carries its own autoplayer in `plugins/<id>/hooks/showcase.ts`. A discovery module reads `.claude-plugin/marketplace.json` + each `plugin.json` and dynamically imports `sim`/`render`/`showcase`, so the recorder, the liveness tests and the page's `games.json` all follow the repo with no second list. A scaffold (`bun run new-game`) writes every glue file from templates; a contribution checker verifies a PR touches only its own plugin, keeps the scaffolded files byte-identical, and that hand-written files never reach `$`, the network or code execution. `AGENTS.md` carries the rules an agent follows; the page's second screen hands readers a prompt pointing at it.

**Tech Stack:** TypeScript 5.9.3, Bun 1.3.14, GitHub Actions, Cloudflare Workers static assets (wrangler via `npx`).

**Spec:** `docs/superpowers/specs/2026-10-28-coinslot-design.md` §14 (this round), §8 and §10. Builds on Plan 3 (`docs/superpowers/plans/2026-10-29-coinslot-showcase.md`, branch `showcase`); Plan 3's Task 6 (deploy) is folded into Task 7 here.

## Global Constraints

- Everything in Plan 3's Global Constraints still holds, except: the tile list comes from the repo (not a fixed six), and each tile shows `by <author.name>` under its name.
- Author name source: `plugin.json` → `author.name`, nothing else. A plugin without it fails the contribution check and is skipped by discovery with an error.
- Tile order = order of `plugins` in `.claude-plugin/marketplace.json`. Only plugins listed there are discovered; directories starting with `_` are never games.
- Byline copy, verbatim: `by <name>`.
- About sentence, verbatim: `Original arcade games that run inside Claude Code while it works.` (also the `<meta name="description">` and `og:description`).
- Contribution prompt, verbatim (the reader replaces `<YOUR NAME>`):
  `Build an original arcade game for Coin Slot (github.com/beasaltfish/coinslot). Fork the repo, read AGENTS.md at its root, and follow it to add one game. Use "<YOUR NAME>" as the author in plugin.json. Run the checks it lists until they pass, then open a pull request to beasaltfish/coinslot.`
- Four steps on the page, verbatim: `1 Fork the repo` · `2 Paste the prompt into your agent` · `3 Your agent opens a pull request` · `4 After review, your game joins the wall`.
- Security rules for hand-written files (`sim.ts`, `render.ts`, `game.tsx`, `showcase.ts`, `*.test.ts(x)`, and `parseSave` in `save-store.ts`): no `$`, no value import from `claude-code` (`import type` only), imports only `./sim`, `./render`, `./shared/*`, `claude-code` (types), `claude-code/testing` (tests); none of these tokens: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `Function(`, `import(`, `require(`, `globalThis`, `process`, `Bun`, `Deno`, `navigator`, `localStorage`, `document`, `window`, `atob`, `String.fromCharCode`, `\u` escapes in identifiers.
- Scaffolded files (`hooks/hooks.json`, `hooks/register.tsx` except its `opened:` line, `hooks/link-apply.ts`, `hooks/save-store.ts` outside the `parseSave` block, `.claude-plugin/plugin.json` except `description`/`author`) must equal the scaffold output for that id/title. The free `opened:` line must be a single plain string literal (it is the game's how-to-play line).
- A contribution PR touches only `plugins/<id>/**` plus one appended entry in `.claude-plugin/marketplace.json`.
- Favicon: pixel-art coin entering a coin slot, `#ffd61f` on `#070d16`, inline SVG file `site/favicon.svg`.
- Share card: `og:title` `Coin Slot`, `og:image` absolute URL `${SITE_URL}/og.png` (1200×630), `twitter:card` `summary_large_image`. `SITE_URL` is a build-time env var; the build fails if it is missing for a deploy build.
- No ranking by clicks/likes this round.

## Review Focus

- A contributed game whose bot dies in the first second or whose `progress` never grows → the liveness test names that game and fails; other games' footage still builds (test in Task 1).
- A `plugin.json` with a missing/empty/very long `author.name` or HTML in it → discovery rejects missing/empty; the page renders the name as text (never `innerHTML`) and truncates with an ellipsis beyond 24 chars (tests in Tasks 1 and 2).
- More than six games → the wall grows by whole rows below the first screen, arrow keys move across all tiles, zoom covers the viewport (tests in Task 2 for `moveSel` with `count`).
- A PR that edits another game, `shared/`, `scripts/`, CI, or slips `$`/`fetch` through string tricks (`globalThis['fe'+'tch']`, bracket access on `$`) → the checker fails with the offending file and rule (tests in Task 4).
- A contributor copies an existing game's glue by hand instead of running the scaffold (wrong atom plugin literal) → checker fails on the scaffold-equality rule (test in Task 4).

---

### Task 1: Bots move into the plugins; discovery drives the recorder

**Files:**
- Create: `scripts/games.ts`, `scripts/games.test.ts`
- Create: `plugins/<id>/hooks/showcase.ts` × 6 (moved from `site/bots/<id>.ts`)
- Modify: `scripts/record-loops.ts`, `scripts/record-loops.test.ts`
- Move: `site/bots/bots.test.ts` → `scripts/liveness.test.ts`
- Delete: `site/bots/` (all files), `site/src/games.ts` stays until Task 2
- Modify: `site/tsconfig.json` (drop `bots` from include)

**Interfaces:**
- Produces, `plugins/<id>/hooks/showcase.ts` (every plugin):

```ts
import type { Game, Input } from './sim'
export const SHOWCASE = {
  seed: number,
  warmupS: number,
  bot(g: Game): Input,
  progress(g: Game): number,
  over(g: Game): boolean,
}
```
  It imports only `./sim` (types and constants). Bot logic, seeds and warmups move unchanged from `site/bots/`.
- Produces, `scripts/games.ts`:
  - `type GameMeta = { id: string; name: string; author: string }` — `name` = id uppercased with `-` → space.
  - `readGameMetas(root: string): GameMeta[]` — reads marketplace order, each `plugins/<id>/.claude-plugin/plugin.json`; throws `Error('<id>: plugin.json needs author.name')` when missing or blank (after trim).
  - `loadGames(root: string): Promise<GameEntry[]>` — same `GameEntry` shape as Plan 3 (`id, name, seed, warmupS, start, tick, render, progress, over`) plus `author`, built by dynamic `import()` of `plugins/<id>/hooks/{sim,render,showcase}.ts`.
- `record-loops.ts` uses `loadGames(root)` and additionally writes `<outDir>/../games.json` = `GameMeta[]`.

- [ ] **Step 1: Write the failing tests:**
  - `games.test.ts`: `readGameMetas(repoRoot)` returns the six ids in marketplace order with `author: 'beasaltfish'` and `name: 'BRICK BREAKER'` for `brick-breaker`; on a temp copy of the marketplace + one plugin.json with `author` removed → throws naming that id; with `author.name: '  '` → throws.
  - `liveness.test.ts`: the Plan 3 liveness test, now iterating `await loadGames(root)`; failure messages include the game id.
  - `record-loops.test.ts`: existing five tests now use `loadGames`; plus `writes games.json` — run the CLI into a temp dir and parse `games.json` → equals `readGameMetas(root)`.
- [ ] **Step 2:** `bun test scripts` → FAIL.
- [ ] **Step 3:** Implement; move each bot into its plugin's `showcase.ts` (`git mv` then edit imports to `./sim`); delete `site/bots/`.
- [ ] **Step 4:** `bun test site scripts` passes; site tsc clean; `bun run check` passes for every plugin (the new file must pass each plugin's tsc and `claude plugin validate`); recorded loops are byte-identical to Plan 3's (`bun scripts/record-loops.ts <tmp>` before and after, `cmp` each `.bin`).
- [ ] **Step 5: Commit** `feat: each game carries its own showcase bot; the repo is the game list`.

---

### Task 2: Page reads games.json; bylines; any number of tiles

**Files:**
- Modify: `site/src/main.ts`, `site/src/style.css`, `site/src/wall-logic.ts`, `site/src/wall-logic.test.ts`, `site/index.html`
- Delete: `site/src/games.ts` (keep `installCommand` + `MARKETPLACE` in a new `site/src/install.ts`)
- Create: `site/src/byline.ts`, `site/src/byline.test.ts`

**Interfaces:**
- Consumes: `games.json` at `./games.json` (Task 1), `GameMeta`.
- Produces:
  - `moveSel(sel: number, dir: Dir, cols: 2 | 3, count: number): number` — row-major over `count` tiles; left/right wrap inside the row (the last row may be short); up/down move by `cols`, wrapping within the column among rows that have that column.
  - `byline(name: string): string` — `by ${name}` with `name` trimmed and cut to 24 chars + `…` when longer.

- [ ] **Step 1: Write the failing tests:**
  - `wall-logic.test.ts`: replace the 6-tile cases with `count` variants: `moveSel(2,'right',3,6) === 0`, `moveSel(6,'right',3,7) === 6` (single tile in last row), `moveSel(4,'down',3,7) === 1`, `moveSel(0,'down',3,7) === 3`, `moveSel(3,'down',3,7) === 6`, `moveSel(6,'down',3,7) === 0`, `moveSel(1,'up',2,5) === 3`; exhaustive: for count 1..10, cols 2|3, every sel and dir → result in `0..count-1`.
  - `byline.test.ts`: `byline('beasaltfish') === 'by beasaltfish'`; 30-char name → 24 chars + `…`; `'  ada  '` → `'by ada'`.
- [ ] **Step 2:** `bun test site/src` → FAIL.
- [ ] **Step 3:** Implement. `main.ts` fetches `games.json` first (on failure render nothing but the about screen and log once); tiles are built from it; the byline is a `<span class="by">` set with `textContent`, small (≈70% of the name size), under the name. Grid: first screen still shows exactly two rows (desktop 3×2, mobile 2×3) at `100svh`; extra games continue in further rows of the same height below, before `#about`. Zoom grows the tile to the **viewport** rect (fixed positioning), not the grid rect. Update the about sentence and meta description per Global Constraints.
- [ ] **Step 4:** Tests pass; site tsc clean; `bun run build:site` writes `games.json`. Controller browser check: bylines visible; with a temporary 7th entry appended to `site/dist/games.json` (copy of snake) the wall shows a third row, arrows reach it, zoom covers the viewport.
- [ ] **Step 5: Commit** `feat(site): the wall lists every game in the repo, with its author`.

---

### Task 3: Scaffold

**Files:**
- Create: `scripts/new-game.ts`, `scripts/templates/*` (one file per scaffolded file), `scripts/new-game.test.ts`
- Modify: `package.json` (script `"new-game": "bun scripts/new-game.ts"`)

**Interfaces:**
- Produces:
  - `scaffoldFiles(id: string, title: string): Record<string, string>` — repo-relative path → content, for: `plugins/<id>/.claude-plugin/plugin.json` (version `0.1.0`, `license: MIT`, `description` and `author.name` as `TODO` placeholders), `hooks/hooks.json`, `hooks/register.tsx`, `hooks/link-apply.ts`, `hooks/save-store.ts` (with a `// --- parseSave: game-specific below ---` marker line before `parseSave`, whose template body returns `null`), and starter `hooks/sim.ts`, `hooks/render.ts`, `hooks/game.tsx`, `hooks/showcase.ts`, `hooks/sim.test.ts` (a tiny original game: a dot you steer to collect coins, so the scaffold passes every check as generated).
  - `SCAFFOLDED = ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.tsx', 'hooks/link-apply.ts', 'hooks/save-store.ts']` — the files the checker compares.
  - CLI: `bun run new-game <id> "<Title>"` — `id` must match `^[a-z][a-z0-9-]{2,30}$` and not exist; writes the files, appends `{ name, source, description: 'TODO' }` to marketplace.json, then runs `bun run bundle -- --plugin=<id>`. Command name `coinslot-<id>`, pane id `<id>`, atoms `{ plugin: '<id>', key }`.
- Templates are derived from `plugins/snake/hooks/{register.tsx,link-apply.ts,save-store.ts}` with id/title substituted.

- [ ] **Step 1: Write the failing tests** `new-game.test.ts`:
  - `scaffoldFiles('snake','Snake')` reproduces snake's `register.tsx` byte-for-byte except the `opened:` line, `link-apply.ts` byte-for-byte, and `save-store.ts` up to the parseSave marker (snake's file gets the marker added in Step 3, the only change to an existing plugin besides Task 1).
  - rejects ids `Snake`, `ab`, `snake` (exists), `../x`.
  - CLI into a temp copy of the repo (`cp -r` minus `node_modules`, `.git`) with id `demo-game` → files exist, marketplace has the entry last, `bun scripts/bundle-shared.ts --check --plugin=demo-game` exits 0.
- [ ] **Step 2:** `bun test scripts/new-game.test.ts` → FAIL.
- [ ] **Step 3:** Implement; add the marker line to all six existing `save-store.ts` files.
- [ ] **Step 4:** Tests pass. In the temp copy, `bun run check` passes for `demo-game` (validate + tsc + `claude plugin test`).
- [ ] **Step 5: Commit** `feat: bun run new-game scaffolds a game that passes every check`.

---

### Task 4: Contribution checker + CI

**Files:**
- Create: `scripts/check-contribution.ts`, `scripts/check-contribution.test.ts`, `.github/workflows/contribution.yml`

**Interfaces:**
- Consumes: `scaffoldFiles`, `SCAFFOLDED` (Task 3).
- Produces:
  - `type Violation = { file: string; rule: string; detail: string }`
  - `checkContribution(input: { changed: string[]; read(path: string): string; baseMarketplace: string; headMarketplace: string }): Violation[]`. Rules (names verbatim, used in messages): `one-plugin` (all changed paths under a single `plugins/<id>/`, except marketplace), `new-plugin-only` (that dir must not exist in `baseMarketplace`'s plugins; edits to existing games are for the author), `marketplace-append` (head = base + exactly one entry whose `name`/`source` match the dir), `scaffold-equal`, `author`, `no-dollar`, `import-allowlist`, `type-only-claude-code`, `banned-token`, `no-bracket-dollar`.
  - Scanning: strip comments and string/template literals before token checks, except that a string literal in a computed member access (`x['...']`) is itself a violation (`banned-token`, detail `computed access`). `parseSave` region of `save-store.ts` is scanned as hand-written.
  - CLI: `bun scripts/check-contribution.ts <baseRef>` — `changed` from `git diff --name-only <baseRef>...HEAD`; prints one line per violation, exit 1 if any.
- `contribution.yml`: on `pull_request` to `main`: checkout (fetch-depth 0), setup-bun 1.3.14, `bun install --frozen-lockfile`, `bun scripts/check-contribution.ts origin/main`, `bun test site scripts`, site tsc. (The `claude plugin validate/test` half of `bun run check` needs the Claude Code CLI; AGENTS.md makes the contributor run it, and the author reruns it before merging.)

- [ ] **Step 1: Write the failing tests** using in-memory inputs: a clean scaffolded `demo-game` → `[]`; each rule gets one violating fixture and asserts that rule name is reported: edit `plugins/snake/hooks/sim.ts`; edit `shared/shell.tsx`; marketplace reorders or adds two; `register.tsx` with `plugin: 'snake'`; empty author; `$.tool.call` in `sim.ts`; `import x from '../../shared/shell'`; `import { atom } from 'claude-code'` in `game.tsx`; `fetch(` in `render.ts`; `globalThis['fe'+'tch']` in `sim.ts`; `$['tool']` in `game.tsx`; `fetch` inside a comment or a plain string → **not** reported.
- [ ] **Step 2:** `bun test scripts/check-contribution.test.ts` → FAIL.
- [ ] **Step 3:** Implement checker and workflow.
- [ ] **Step 4:** Tests pass; `bun scripts/check-contribution.ts main` on the `showcase` branch reports `one-plugin` (expected: this branch is the author's, not a contribution) — confirms the CLI wiring. `actionlint` if available, else a careful read.
- [ ] **Step 5: Commit** `feat: CI screens contributed games before review`.

---

### Task 5: AGENTS.md, CONTRIBUTING.md, second screen

**Files:**
- Create: `AGENTS.md`, `CONTRIBUTING.md`
- Modify: `README.md` (a "Make a game" line linking CONTRIBUTING.md), `site/index.html`, `site/src/main.ts`, `site/src/style.css`

**Content decisions:**
- `AGENTS.md` (for agents; short imperative sections): what Coin Slot is; **make exactly one new game**; `bun install` then `bun run new-game <id> "<Title>"`; edit only `sim.ts`, `render.ts`, `game.tsx`, `showcase.ts`, tests, and `parseSave` below the marker, plus `description` and `author.name` in `plugin.json` and the `description` in your marketplace entry; the sim/render contract (pure, seeded, no `Date`/`Math.random`, JSON state, field is pixels `w = cols`, `h = rows × 2`, min 40×10, no hold-to-press mechanics); `showcase.ts` must keep the game alive 10 s (`over` < 10% of ticks, `progress` grows); originality (no trademarked names or look-alike characters); the security rules (copied from Global Constraints, phrased as "never"); checks to run: `bun run check`, `bun test site scripts`, `bun scripts/check-contribution.ts origin/main`; how to open the PR (fork, branch `game/<id>`, PR title `game: <Title>`). The author's own work on the repo is not covered by these rules — say so in one line at the top ("These rules are for contributed games").
- `CONTRIBUTING.md` (for people): the four steps, what review looks for (fun, originality, safety, footage), that merging lists the game on the site and in the marketplace, MIT license of contributions.
- Second screen (`#about`): the about sentence; heading `Make a game`; the four steps; the prompt in a read-only box with a copy button reusing `copyCommand` (same success/failure feedback as tiles: `✓ Copied`, select-on-failure); the two links. The `<YOUR NAME>` placeholder is visually highlighted.

- [ ] **Step 1:** Write both docs and the second screen.
- [ ] **Step 2:** `bun test site scripts`, site tsc, `bun run build:site` pass.
- [ ] **Step 3: Dry run (controller):** in a temp clone, dispatch a cheap subagent with only the verbatim prompt (author `Test Bot`) and no other context; it must produce a game that passes `bun run check`, `bun test site scripts` and `check-contribution` without asking questions. Fix AGENTS.md wherever it stalled; record findings in the ledger. (No PR is opened; the temp clone is deleted.)
- [ ] **Step 4: Commit** `docs: AGENTS.md and the Make a game screen`.

---

### Task 6: Favicon and share card

**Files:**
- Create: `site/favicon.svg`, `scripts/og-image.ts`, `scripts/og-image.test.ts`
- Modify: `scripts/build-site.ts`, `site/index.html`

**Interfaces:**
- `site/favicon.svg`: 16×16 `viewBox`, `shape-rendering="crispEdges"`, rects only: dark rounded panel `#070d16`, a slot (lighter bar), a `#ffd61f` coin half inside the slot with a 1px highlight.
- `scripts/og-image.ts`:
  - `encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array` — minimal PNG (IHDR, one IDAT via `Bun.deflateSync`/zlib wrapper, IEND, CRC32).
  - `renderOgImage(loops: Loop[]): Uint8Array` — 1200×630: the first six games' frame at 50% of the loop, 3×2, half-block cells as rects, on `#070d16`, with `COIN SLOT` in a built-in 5×7 pixel font (only the glyphs needed) centred on a dark band.
  - CLI: `bun scripts/og-image.ts <loopsDir> <out.png>`.
- `build-site.ts`: copy `favicon.svg`; run og-image into `site/dist/og.png`; substitute `%SITE_URL%` in `index.html`; when `SITE_URL` is unset, use `http://localhost:4173` and print a warning; `--deploy` flag makes unset `SITE_URL` an error.
- `index.html` head: `<link rel="icon" href="favicon.svg" type="image/svg+xml">`, `og:title`, `og:description`, `og:image` (`%SITE_URL%/og.png`), `og:url`, `twitter:card`.

- [ ] **Step 1: Write the failing tests** `og-image.test.ts`: `encodePng(2,1,…)` starts with the PNG signature and has IHDR width 2 / height 1; CRC of IEND chunk equals `0xAE426082`; `renderOgImage` output decodes (IHDR) to 1200×630.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** tests pass; open `site/dist/og.png` and `favicon.svg` and look at them (controller); build without `SITE_URL --deploy` exits non-zero.
- [ ] **Step 5: Commit** `feat(site): favicon and share card`.

---

### Task 7: Deploy (needs the author)

**Files:**
- Create: `site/wrangler.jsonc` — `{ "name": "coinslot", "compatibility_date": "2026-10-01", "assets": { "directory": "./dist" } }`
- Modify: `package.json` (`"deploy:site": "bun scripts/build-site.ts --deploy && cd site && npx wrangler deploy"`), `README.md` (site link)

- [ ] **Step 1:** Ask the author to approve the first public deploy and confirm the workers.dev subdomain.
- [ ] **Step 2:** First deploy to learn the URL, then `SITE_URL=<url> bun run deploy:site`.
- [ ] **Step 3:** Production check: desktop + the author on a real iPhone (sound after a tap, copy a command, copy the prompt, 2×3 layout); the share card in X's card validator or by pasting the link in a draft.
- [ ] **Step 4:** README link; commit `feat(site): deploy config`.
