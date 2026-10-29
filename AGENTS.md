# AGENTS.md

These rules are for contributed games. (The author's own work on this repo is not covered by them.)

Coin Slot is a set of original arcade games that run inside Claude Code while it works. Each game is a Claude Code plugin under `plugins/<id>/`. Your job: add **exactly one new game**, check it, open one pull request. Do not ask the human questions; everything you need is below.

## 1. Set up

```bash
bun install
bun run new-game <id> "<Title>"
```

- `<id>` matches `^[a-z][a-z0-9-]{2,30}$` (lowercase, digits, hyphens; 3-31 chars). It must not exist in `plugins/`. The wall shows it uppercased (`my-game` -> `MY GAME`).
- `<Title>` is non-empty and has no `'`, `\` or newline.
- This creates `plugins/<id>/`, appends an entry to `.claude-plugin/marketplace.json` (description `TODO`), and copies the shared runtime into `plugins/<id>/hooks/shared/`. The scaffold is a working starter game (steer a dot, collect coins). Read it first: `plugins/<id>/hooks/sim.ts`, `render.ts`, `game.tsx`, `showcase.ts`, `sim.test.ts`.

## 2. What you may edit

Only these. Anything else fails the checker.

| File | Rule |
| --- | --- |
| `plugins/<id>/hooks/sim.ts` | free (within the code rules below) |
| `plugins/<id>/hooks/render.ts` | free |
| `plugins/<id>/hooks/game.tsx` | free |
| `plugins/<id>/hooks/showcase.ts` | free |
| `plugins/<id>/hooks/*.test.ts` | your tests, sim/render only (see section 6) |
| `plugins/<id>/hooks/save-store.ts` | only below the line `// --- parseSave: game-specific below ---` |
| `plugins/<id>/hooks/register.tsx` | only the `opened:` line |
| `plugins/<id>/.claude-plugin/plugin.json` | only `description` and `author.name` |
| `.claude-plugin/marketplace.json` | only the one entry the scaffold appended: fill its `description` (a string, at most 200 characters). Do not touch other entries, `name` or `source`. |
| `plugins/<id>/README.md`, `CHANGELOG.md`, `assets/**.{png,jpg,jpeg,gif,webp}` | optional, inert |

Never edit `hooks/shared/*`, `hooks/hooks.json`, `hooks/link-apply.ts`, `types/index.d.ts`, anything in `shared/`, `scripts/`, `site/`, `vendor/`, `.github/`, or another game. Never add files outside `plugins/<id>/`, never add symlinks, never add dependencies.

`author.name` is the name the human gave you (the prompt says what to use). `description` should say what the game is and end with how Claude's activity shows up, like the other games: `An original arcade ... game for Claude Code. <One line of play>. Pauses when Claude finishes; Claude's tool calls drop <bonus>.`

## 3. The game contract

`sim.ts` and `render.ts` are pure. `game.tsx` wires them to the shell with a `GameSpec` (see `shared/shell.tsx`):

```ts
GameSpec<G, I> = {
  title: string; hint?: string; saveV?: number
  policy: { start: boolean; escape: boolean }
  create(cols, h, seed): G          // h is pixels = rows * 2
  resize(g, cols, h): G
  step(g, dt, input: I): G          // dt in seconds, ~1/30
  bonus(g): G                       // Claude made a tool call: reward the player
  render(g): Cells
  noInput(): I
  key(e, input): I
  pointer(e, input): I
  save?(g): JsonValue; load?(fresh, saved): G | null
}
```

Rules:

- **Pure and seeded.** No `Date`, no `Math.random`, no clock, no I/O. Keep the RNG seed inside the state (see `rand` in the scaffold's `sim.ts`, mulberry32). Same seed and same inputs give the same run.
- **State is plain JSON** (numbers, strings, booleans, arrays, plain objects, `null`). No `Infinity` (use a big number like `1e9`), no `undefined` fields, no class instances, no `Map`/`Set` inside the state.
- **The field is in pixels.** `w = cols`, `h = rows * 2` (each terminal cell shows two half-block pixels). The shell runs at a minimum of 40 columns by 10 rows, so your game must work from `w = 40`, `h = 20` upward and survive `resize` to any size at or above that.
- **No hold-to-press mechanics.** The terminal delivers key presses, not key releases. Design for taps (a tap sets a direction, jumps, fires) not for holding a key down.
- **Bonus.** `bonus(g)` is called each time Claude makes a tool call. Make it a reward (extra ball, power-up, golden target), capped so spamming it cannot break the game. The scaffold caps live bonuses at two.
- **Show the outcome.** The player must see score or progress and what to do (see `hint` and `render.ts`'s HUD).
- Only `render.ts` produces `Cells` (`{ cols, rows, ch, fg, bg }`, `rows = floor(h / 2)`). Colors are `0xRRGGBB` numbers.

### showcase.ts keeps the game alive

`showcase.ts` exports `SHOWCASE = { seed, warmupS, bot, progress, over }`. A bot plays your game for the site's preview loop, and `scripts/liveness.test.ts` enforces this bar on a 56x56 field (`start(56, 56, seed)`, i.e. 56 columns, 28 rows):

1. Run the bot through `warmupS` seconds at dt = 1/30.
2. Then simulate 300 ticks. `over` must be true on **fewer than 10%** of them (the bot must not die, or the game must restart itself).
3. `progress` after those 300 ticks must be **greater** than before them (it must grow: score, distance, bricks broken).
4. `render` must return a frame with `cols === 56` and `rows === 28`.

`bot(g)` returns an `Input` and may only read the game state. Make it a competent player, not a cheat.

## 4. Originality and safety

Originality:

- The game must be original. No trademarked names, titles, characters, logos, or look-alikes of them.
- Do not clone a famous game 1:1. Use your own framing and characters: in this repo, `jump-runner`'s runner is not a dinosaur, and `tap-flyer`'s flyer is not a bird between green pipes.
- Write your own art, names and text. Do not copy code or assets from elsewhere.

Safety (the checker enforces these; treat them as "never"):

- Never use the network, filesystem, process, environment, DOM or timers. Banned identifiers (anywhere in your code, including as property names): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `Function` (except as a type annotation), `globalThis`, `global`, `self`, `window`, `document`, `navigator`, `localStorage`, `process`, `Bun`, `Deno`, `require`, `atob`, `fromCharCode`, `fromCodePoint`, `Reflect`, `WebAssembly`, `Worker`, `importScripts`, `constructor`, `prototype`, `__proto__`, `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`. No `import.meta`, no `import(...)`, no `require(...)`, no unicode escapes in identifiers.
- Never use the `$` identifier or `$[...]` (the host handle). Only the shell touches it.
- Never reach outside this global allowlist: `Math`, `Number`, `Array`, `String`, `Boolean`, `Infinity`, `NaN`, `undefined`, `isFinite`, `isNaN`, `parseInt`, `parseFloat`, `JSON`, `Set`, `Map`, `Uint8Array`, `Uint16Array`, `Uint32Array`, `Int32Array`, `Float32Array`, `Float64Array`. Any other free identifier that is not declared in your own files is a violation. Do not use `declare`.
- Never import anything except: `./sim`, `./render`, `./shared/cells`, `./shared/envelope`, `./shared/overlay`, `./shared/shell`, `./shared/link`, and `claude-code`. Imports from `claude-code` must be **type-only** (`import type { ... } from 'claude-code'`). Tests may also import `claude-code/testing`.
- Never use `any` (including `as unknown`), `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or `/// <reference>` directives. Your code must have zero TypeScript errors (strict, `noUncheckedIndexedAccess`).
- Never use computed property names (`{ [k]: v }`), and never use the strings `constructor`, `prototype` or `__proto__` (or the other banned names above) even as string literals. Index expressions follow the next section.

### The index rule

Every `x[expr]` must be syntactically obviously safe. Allowed index expressions: a numeric literal (`xs[0]`), a unary `+`, `-` or `~` expression, a binary expression using only `- * / % | & ^ << >> >>> **` (note: **not** `+`), a `Math.*(...)` call, or a harmless string literal. A plain variable (`xs[i]`), `xs[i + 1]`, `xs[k.name]` and template strings are rejected, even if the type is a number.

So write indexes so they are obviously numbers:

```ts
xs[i | 0]                      // integer index in a variable
xs[+i]                         // same, unary plus
buf[(y * w + x) | 0]           // grid index
buf[(y * w + x + 1) | 0]       // use | 0 to make a "+" index legal
DX[g.dir | 0]!                 // noUncheckedIndexedAccess: add ! (or check for undefined)
xs[0]                          // literal
xs[Math.floor(t)]              // Math.* call
```

Lookups keyed by a string do not use an index at all:

```ts
const COLORS = new Map<string, number>([['red', 0xff0000]])
const c = COLORS.get(name)     // string key: Map.get, or a switch
for (const item of items) {}   // iterating: no index needed
```

## 5. save-store.ts: write a real `parseSave`

Claude Code drops and rebuilds the game whenever a dialog opens and closes. The run survives only if `parseSave` accepts the saved value. The scaffold's `parseSave` returns `null`, which means "no save": **the player loses their run every time a dialog opens.** You must replace it.

`parseSave(v: unknown): JsonValue | null` receives the shell's envelope `{ v, g }` where `g` is your whole `Game` (unless you defined `save`/`load`). It must check every field your sim reads (finite numbers, arrays of the right shape, nested objects) and return `null` for anything else. Only write below the marker line, and keep the imports above it as they are (they already include `JsonValue` and `isEnvelope`). Pattern, from `plugins/snake/hooks/save-store.ts`:

```ts
// --- parseSave: game-specific below ---
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function parseSave(v: unknown): JsonValue | null {
  if (!isEnvelope(v) || v.g === null || typeof v.g !== 'object') return null
  const g = v.g as Record<string, unknown>
  if (!finite(g.score) || !finite(g.seed) || !finite(g.gw) || !finite(g.gh) || !finite(g.dir)) return null
  if (!Array.isArray(g.snake) || g.snake.length === 0 || !Array.isArray(g.bonuses) || !Array.isArray(g.queue)) return null
  if (g.food !== null && (typeof g.food !== 'object' || g.food === undefined)) return null

  return { v: v.v, g: v.g as JsonValue }
}
```

Also validate array element shapes if your sim indexes into them (a saved `{ x: 'a' }` must not crash `step`). If you change the shape of the state, bump `saveV` in your `GameSpec`.

## 6. Tests

Write `plugins/<id>/hooks/sim.test.ts` (and optionally `render.test.ts`) in the style of the scaffold's `sim.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'
import { newGame, step } from './sim'
```

Cover rules, collisions, scoring, bonus cap, `resize` staying in bounds, determinism (same seed, same run) and the bot staying alive. Tests are sim/render tests only: do not write pane or save-store tests that touch `$`, `register.tsx` or `save-store.ts` (the `$` identifier is banned). Test files must be named `hooks/<name>.test.ts` or `.test.tsx`, and follow the same code rules as the rest.

## 7. register.tsx

Change only the `opened:` line: a single plain string literal (no backticks, no backslashes, no line breaks) telling the player how to play, in the form `<Title> opened. <Controls>; p pauses; esc returns to chat.` Everything else in the file must stay as the scaffold wrote it, including `title:`.

## 8. Checks (run in order, until all pass)

```bash
bun install
bun run check
bun test site scripts
git add -A && git commit -m "game: <Title>"
git fetch upstream            # see section 9 for the upstream remote
bun scripts/check-contribution.ts upstream/main
```

- `bun run check` validates the marketplace and each plugin with the `claude` CLI (`claude plugin validate`), verifies the shared bundle and type-checks every game. It needs the `claude` and `npx` commands on PATH.
- `bun test site scripts` runs every game's tests plus the liveness bar from section 3.
- `check-contribution.ts` diffs `<baseRef>...HEAD`, so **commit first**; it only sees committed changes. `<baseRef>` is the upstream `main` (`upstream/main`), not your fork's. If you are not in a fork, use `origin/main`. Use `--root <dir>` only to check a checkout elsewhere: `bun scripts/check-contribution.ts --root <dir> upstream/main`. It prints `contribution check: clean` on success; otherwise each line is `file: [rule] detail`. Fix the code, commit again, rerun.
- Do not open the PR until all four commands pass.

## 9. Open the pull request

1. Fork `beasaltfish/coinslot` on GitHub (`gh repo fork beasaltfish/coinslot --clone` does fork and clone).
2. Add the upstream remote if it is missing: `git remote add upstream https://github.com/beasaltfish/coinslot.git`.
3. Work on a branch named `game/<id>`: `git switch -c game/<id>` (from an up-to-date `upstream/main`).
4. Commit with a message like `game: <Title>`; push the branch to your fork.
5. Open a PR to `beasaltfish/coinslot` `main`, titled `game: <Title>`, with this description:

```markdown
## <Title>

<One or two sentences: what the game is and how you win or lose.>

### Controls
<Keys / mouse, and that p pauses.>

### Claude's tool calls
<What a tool call gives the player (the bonus), and its cap.>

### Checks
- [x] bun run check
- [x] bun test site scripts
- [x] bun scripts/check-contribution.ts upstream/main
```

One game per PR. Do not push to `main` of the upstream repo.

## For the maintainer

`check-contribution.ts` is a tripwire, not a sandbox: it catches the obvious and keeps the diff small, but it cannot prove code is safe. Review the diff by hand first. Only then run the PR's tests, and run them in an isolated environment (a throwaway container or VM), never on a machine with credentials.
