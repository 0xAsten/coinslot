# Coin Slot Showcase Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-page arcade wall that loops real footage of all six games and copies each game's install command, deployed on Cloudflare.

**Architecture:** A Bun script runs each game's own pure `newGame` / `step` / `renderCells` under a small autoplayer and records the cells (glyph + fg + bg per cell) into a compact delta-encoded, gzipped binary per game. The page is static HTML plus one bundled TypeScript entry: it fetches those six files, decodes them and replays them on six canvases, and carries the wall interaction from spec §8 (joystick, select, zoom, copy, sound). `scripts/build-site.ts` records + bundles into `site/dist`; Workers static assets serves it.

**Tech Stack:** TypeScript 5.9.3, Bun 1.3.14 (`bun build`, `bun test`), browser Canvas 2D + WebAudio + `DecompressionStream`, Cloudflare Workers static assets via wrangler (run with `npx`, not bun).

**Spec:** `docs/superpowers/specs/2026-10-28-coinslot-design.md` §8 (page) and §10 (loop footage).

## Global Constraints

- No framework, no runtime dependencies in the page. Dev-only addition: `@types/bun` for `bun test` typing.
- Tile names are the plugin names uppercased, in this order: `FISH SHOOTER`, `BRICK BREAKER`, `SNAKE`, `SPACE SHOOTER`, `TAP FLYER`, `JUMP RUNNER`.
- Install command per game, verbatim (same as README): `/plugin install <plugin-name> --marketplace beasaltfish/coinslot`.
- Copy feedback, verbatim: button text becomes `✓ Copied — paste into Claude Code`; floating text `+1 CREDIT`.
- Links on the second screen: `https://x.com/0xasten` (label `@0xasten`) and `https://github.com/beasaltfish/coinslot`.
- First screen shows only the six tiles + tile names + a small `↓` at the bottom edge + the mute button. No other copy.
- Layout: desktop 3 columns × 2 rows, mobile (≤ 640px wide) 2 columns × 3 rows; the wall fills the first viewport (`100svh`).
- Footage is not a seamless loop (author decision 2026-10-29): playback hard-cuts from the last frame back to frame 0.
- Recording: `REC_COLS = 56`, `REC_ROWS = 28` cells (game field `w = 56`, `h = 56` pixels), `REC_FPS = 30`, `REC_SECONDS = 10`; colors pass through `COLOR_MASK = 0xe0e0e0` exactly like `shared/shell.tsx`, so the page matches the terminal.
- Each gzipped loop file ≤ 300 KB.
- Sims and renders are imported from `plugins/<game>/hooks/sim.ts` and `render.ts` unchanged. This plan does not modify any plugin file.
- Music and sound effects are original, synthesized with WebAudio; no audio files.
- Animations sit inside `@media (prefers-reduced-motion: no-preference)` or are skipped in JS when reduced motion is set.

## Review Focus

- Clipboard API missing or rejected (plain http, iOS in-app browsers, permission denied) → fall back to selecting a hidden textarea + `document.execCommand('copy')`; if that also fails, the command text stays visible and selectable and the button does **not** say `✓ Copied` (test in Task 4: `copyCommand` returns `false` and the label is unchanged).
- A loop file fails (404, corrupt gzip, browser without `DecompressionStream`) → that tile shows its name on the dark background, the other five keep playing, no uncaught error (test in Task 4: `decodeLoop` throws a typed `LoopFormatError` on a truncated buffer; `loadTile` catches it).
- `AudioContext` missing or the first `resume()` rejected → the page works silently and the mute button still toggles without throwing (manual check in Task 5 by stubbing `window.AudioContext = undefined` in devtools).
- Window resized or phone rotated while a tile is zoomed → the zoomed tile re-fits the wall and the grid switches between 3×2 and 2×3 (test in Task 4: `moveSel` for both column counts; manual resize check in Task 5).
- Arrow keys at the grid edges → selection wraps within the row/column for the current column count, never lands on an index ≥ 6 (test in Task 4).

---

### Task 1: Loop format (encode / decode)

**Files:**
- Create: `site/src/loop-format.ts`
- Create: `site/src/loop-format.test.ts`
- Create: `site/tsconfig.json`
- Modify: `package.json` (add `devDependencies: { "@types/bun": "1.3.14" }` and script `"test:site": "bun test site scripts"`)
- Modify: `.gitignore` (add `site/dist/`)

**Interfaces:**
- Consumes: `Cells` from `shared/cells.ts` (`{ cols, rows, ch: string[], fg: number[], bg: number[] }`).
- Produces:
  - `type Loop = { cols: number; rows: number; fps: number; frames: Cells[] }`
  - `encodeLoop(loop: Loop): Uint8Array` — raw (not gzipped) bytes.
  - `decodeLoop(bytes: Uint8Array): Loop` — throws `LoopFormatError` on any malformed input.
  - `class LoopFormatError extends Error`

Byte layout (little-endian), decided here so encoder and decoder agree:

```
"CSL1"                       4 bytes magic
u32 headerLen, then headerLen bytes UTF-8 JSON:
  { cols, rows, fps, frames: number, palette: number[], glyphs: string[] }
per frame:
  u16 changeCount
  changeCount × { u16 cellIndex, u16 glyphIdx, u16 fgIdx, u16 bgIdx }
```

Frame 0 lists every cell; frame n lists only cells that differ from frame n−1. `site/tsconfig.json` extends nothing: `strict`, `noUncheckedIndexedAccess`, `lib: ["es2023", "dom"]`, `types: ["bun"]`, `include: ["src", "bots", "../scripts/record-loops.ts", "../scripts/build-site.ts"]`.

- [ ] **Step 1: Write the failing tests** in `site/src/loop-format.test.ts` (`import { expect, test } from 'bun:test'`):
  - `round-trips three frames` — build a 4×2 loop with three frames where frame 1 changes one cell's glyph and frame 2 changes one cell's fg; `expect(decodeLoop(encodeLoop(l))).toEqual(l)`.
  - `stores only changed cells after frame 0` — two identical 56×28 frames encode to `≤ headerBytes + 2 + 56*28*8 + 2` bytes (second frame costs 2 bytes).
  - `rejects bad magic` — `expect(() => decodeLoop(new Uint8Array([1,2,3,4]))).toThrow(LoopFormatError)`.
  - `rejects a truncated buffer` — slice the last 3 bytes off a valid encoding → throws `LoopFormatError`.
  - `rejects an out-of-range cellIndex` — patch a change's cellIndex to `cols*rows` → throws `LoopFormatError`.
- [ ] **Step 2:** `bun install && bun test site/src/loop-format.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `encodeLoop` / `decodeLoop` / `LoopFormatError` in `site/src/loop-format.ts` with `DataView`. Palette and glyph tables are built in first-seen order.
- [ ] **Step 4:** `bun test site/src/loop-format.test.ts` → 5 pass. `npx -y -p typescript@5.9.3 tsc -p site/tsconfig.json` → no errors.
- [ ] **Step 5: Commit** `feat(site): loop footage format`.

---

### Task 2: Autoplayers

**Files:**
- Create: `site/bots/index.ts` (the registry)
- Create: `site/bots/<plugin-name>.ts` × 6
- Create: `site/bots/bots.test.ts`

**Interfaces:**
- Consumes: each game's `newGame(w, h, seed)`, `step(g, dt, input)`, `Game`, `Input` and exported constants from `plugins/<game>/hooks/sim.ts`.
- Produces, from `site/bots/index.ts`:

```ts
export type GameEntry = {
  id: string            // plugin name, e.g. 'brick-breaker'
  name: string          // tile name, e.g. 'BRICK BREAKER'
  seed: number
  warmupS: number       // seconds simulated before recording starts
  start(w: number, h: number, seed: number): unknown
  tick(g: unknown, dt: number): unknown     // bot input + step in one call
  render(g: unknown): Cells
  progress(g: unknown): number              // score-like, must grow while playing
  over(g: unknown): boolean
}
export const GAMES: GameEntry[]             // in the Global Constraints order
```

`unknown` is the registry's erased type; each `site/bots/<game>.ts` exports `bot(g: Game): Input` typed against its own sim, and `index.ts` wraps it. Bot rules (each is a pure function of the current state; no randomness):

- **fish-shooter:** `aimTo` the centre of the live, uncaught creature with the highest `value` (ties: nearest to the cannon); `fire: true` every tick; `bet: 1`; `refill: true` when `coins < bet`. `over` is always `false`; `progress` = `caughtCount`.
- **brick-breaker:** `padTo` the x of the ball with the largest `y` among balls moving down (else the first ball); `launch: true`; `any: g.over`. `progress` = `score`.
- **snake:** among the three non-reversing directions, drop those whose next cell is a wall or a body cell (excluding the tail tip), then pick the one with the smallest Manhattan distance to `food`; `turns: [thatDir]` only when it differs from `dir`; `any: g.over`. `progress` = `score`.
- **space-shooter:** `aimTo = { x: target.x, y: ship's current y }` where target is the lowest enemy; if any bullet is within 4 px horizontally and 12 px above the ship, aim 8 px to the side away from it instead; `any: g.over`. `progress` = `score`.
- **tap-flyer:** `tap: true` when `vy >= 0` and the flyer's bottom edge is below the centre of the next unpassed pillar's gap + 2 px; on game over, `tap` once `overT > RESTART_AFTER_S`. `progress` = `score`.
- **jump-runner:** `tap: true` when on the ground (`jumps === 0`) and the next `block` obstacle's left edge is within `speed × 0.22` px ahead; never jump for a `drone`; on game over, `tap` once `overT > RESTART_AFTER_S`. `progress` = `score`.

Seeds: pick one per game in Step 3 that passes the test; record it in `GAMES`.

- [ ] **Step 1: Write the failing test** `site/bots/bots.test.ts`: for each entry in `GAMES` (`test.each`), start at `w = 56, h = 56` with `entry.seed`, run `warmupS + 10` seconds at `dt = 1/30`, then assert on the 300 recorded ticks:
  - `overTicks / 300 < 0.1`
  - `progress(after) > progress(at recording start)`
  - `render(g)` returns `cols === 56 && rows === 28` on the last tick.
- [ ] **Step 2:** `bun test site/bots` → FAIL.
- [ ] **Step 3:** Implement the six bots and the registry. If a game fails the liveness bar with a rule above, tune that rule's numbers (margins, lookahead) before changing the seed, and note the change in the commit message.
- [ ] **Step 4:** `bun test site/bots` → 18 assertions pass across 6 games; site tsc clean.
- [ ] **Step 5: Commit** `feat(site): autoplayers for the six games`.

---

### Task 3: Recorder

**Files:**
- Create: `scripts/record-loops.ts`
- Create: `scripts/record-loops.test.ts`

**Interfaces:**
- Consumes: `GAMES` (Task 2), `encodeLoop` (Task 1).
- Produces:
  - `recordLoop(entry: GameEntry): Loop` — `REC_COLS/ROWS/FPS/SECONDS` from Global Constraints; skips `warmupS`, then records `REC_FPS × REC_SECONDS` frames; each frame is `render(g)` with fg/bg masked by `COLOR_MASK`.
  - CLI: `bun scripts/record-loops.ts <outDir>` writes `<outDir>/<id>.bin` (gzipped with `Bun.gzipSync`) for every game and prints `id  frames  bytes` per line.

- [ ] **Step 1: Write the failing tests** `scripts/record-loops.test.ts`:
  - `records 300 frames of 56×28` for `GAMES[0]`.
  - `is deterministic` — `encodeLoop(recordLoop(e))` byte-equal across two calls, for every game.
  - `masks colors` — every fg/bg in every frame satisfies `(v & ~0xe0e0e0) === 0`.
  - `stays under budget` — `Bun.gzipSync(encodeLoop(recordLoop(e))).length <= 300 * 1024` for every game.
  - `mask matches the shell` — `readFileSync('shared/shell.tsx', 'utf8')` contains `const COLOR_MASK = 0xe0e0e0` (guards the copy in the recorder).
- [ ] **Step 2:** `bun test scripts/record-loops.test.ts` → FAIL.
- [ ] **Step 3:** Implement `scripts/record-loops.ts`; export `recordLoop` and `COLOR_MASK`; run the CLI only under `import.meta.main`.
- [ ] **Step 4:** Tests pass; `bun scripts/record-loops.ts /tmp/loops` prints six lines, each ≤ 307200 bytes.
- [ ] **Step 5: Commit** `feat(site): record game footage from the real sims`.

---

### Task 4: Tile player and pure page logic

**Files:**
- Create: `site/src/glyph.ts`, `site/src/player.ts`, `site/src/wall-logic.ts`, `site/src/copy.ts`
- Create: `site/src/glyph.test.ts`, `site/src/wall-logic.test.ts`, `site/src/copy.test.ts`

**Interfaces:**
- Consumes: `decodeLoop`, `Loop`, `LoopFormatError` (Task 1).
- Produces:
  - `glyphShape(ch: string): 'space' | 'full' | 'top' | 'bottom' | 'text'` — `' '`→space, `'█'`→full, `'▀'`→top, `'▄'`→bottom, anything else→text.
  - `class TilePlayer { constructor(canvas: HTMLCanvasElement, loop: Loop); start(): void; stop(): void; showFrame(i: number): void }` — holds a materialized `Cells` buffer; each animation frame computes `i = floor(elapsed × fps) % frames.length`, applies deltas forward from the last shown frame (on wrap, rebuild from frame 0), and redraws only changed cells. Drawing: bg rect per cell; `full/top/bottom` as fg rects (top/bottom = half cell height); `text` via `fillText` in `JetBrains Mono, ui-monospace, monospace` at cell height. Canvas backing size = CSS size × `devicePixelRatio`; the loop is drawn letterboxed ("contain") and centred on `#000`. Reduced motion → `showFrame(0)` only.
  - `loadTile(url: string): Promise<Loop | null>` — fetch → `DecompressionStream('gzip')` → `decodeLoop`; returns `null` on any failure (404, missing `DecompressionStream`, `LoopFormatError`).
  - `moveSel(sel: number, dir: 'up' | 'down' | 'left' | 'right', cols: 2 | 3): number` — 6 tiles row-major; left/right wrap inside the row, up/down wrap inside the column.
  - `stickAngle(dx: number, dy: number): { tilt: number; dir: number }` — tilt 0..1 (clamped at 160px distance), dir in radians; `(0,0)` → tilt 0.
  - `copyCommand(text: string, deps: { clipboard?: { writeText(t: string): Promise<void> }; execCopy(t: string): boolean }): Promise<boolean>` — try `clipboard.writeText`, else/on rejection `execCopy`; returns whether either succeeded.

- [ ] **Step 1: Write the failing tests:**
  - `glyph.test.ts`: the five mappings above, plus `'A'`→text and `''`→text.
  - `wall-logic.test.ts`: `moveSel(2,'right',3) === 0`, `moveSel(0,'left',3) === 2`, `moveSel(4,'down',3) === 1`, `moveSel(1,'right',2) === 0`, `moveSel(0,'up',2) === 4`, `moveSel(5,'down',2) === 1`; for every sel 0..5, dir and cols the result is in `0..5`. `stickAngle(0,0).tilt === 0`, `stickAngle(400,0).tilt === 1`, `stickAngle(0,80).tilt === 0.5`.
  - `copy.test.ts`: clipboard resolves → `true`, `execCopy` not called; clipboard rejects + `execCopy` true → `true`; no clipboard + `execCopy` false → `false`.
- [ ] **Step 2:** `bun test site/src` → the new files FAIL.
- [ ] **Step 3:** Implement the five modules. `player.ts` is DOM code and has no unit test; it is checked in Task 5.
- [ ] **Step 4:** `bun test site/src` passes; site tsc clean.
- [ ] **Step 5: Commit** `feat(site): tile player and wall logic`.

---

### Task 5: The page

**Files:**
- Create: `site/index.html`, `site/src/main.ts`, `site/src/audio.ts`, `site/src/style.css`
- Create: `scripts/build-site.ts`

**Interfaces:**
- Consumes: `GAMES` ids/names (Task 2, imported for names and commands only — the page bundle must not pull in sims: import from a tiny `site/src/games.ts` that lists `{ id, name }` and have `bots.test.ts` assert it equals `GAMES.map(({id, name}) => ({id, name}))`), `TilePlayer`, `loadTile`, `moveSel`, `stickAngle`, `copyCommand` (Task 4).
- Produces:
  - `audio.ts`: `createAudio(): { unlock(): void; sfx(name: 'move' | 'zoom' | 'back' | 'coin'): void; setMuted(m: boolean): void; muted(): boolean }` — lazily creates the `AudioContext` on `unlock()`; every method is a no-op if `AudioContext` is unavailable or throws. Music: an original square-lead + triangle-bass 8-bit loop at 0.15 s per step, master gain 0.18, starting on the first `unlock()`. `move` short high blip, `zoom` rising slide, `back` falling slide, `coin` two-note B5→E6.
  - `scripts/build-site.ts`: `rm -rf site/dist` → `bun scripts/record-loops.ts site/dist/loops` → `bun build site/src/main.ts --outdir site/dist --target browser --minify` → copy `index.html` and `style.css`. Add package script `"build:site": "bun scripts/build-site.ts"`.

Page behaviour (spec §8, restated so this task does not depend on the old sketch):
- `<title>Coin Slot</title>`; dark background `#070d16`; a light scanline overlay (`repeating-linear-gradient`, ~3.5% white every 3px) over the wall.
- Six tiles, each a canvas + name in the bottom-left (bold monospace, white, black text-shadow). Unselected tiles `filter: brightness(.88) saturate(.9)`; the selected tile has full brightness and a 2px `#ffd61f` ring. The difference stays subtle.
- Hover or arrow keys move the selection (`moveSel`, cols from the current media query) and play `move`.
- Click or Enter on the selected tile: it grows over ~0.5 s to cover the wall (absolute positioning from its grid rect to the wall rect, `cubic-bezier(.2,.8,.2,1)`), plays `zoom`, and the install-command button fades in at the exact centre. Esc, or a click on the zoomed tile outside the button, reverses it and plays `back`.
- Clicking the command button calls `copyCommand`; on `true`: label → `✓ Copied — paste into Claude Code`, green `#16c79a`, `coin` sound, a `+1 CREDIT` floats up 60px and fades over 0.9 s; the label reverts after 2 s. On `false`: label unchanged, command text selected.
- Joystick: fixed at bottom centre of the wall, ~96px; `pointermove` tilts it toward the pointer via `stickAngle`; an arrow key flicks it that way for 150 ms. Hidden on touch-only devices (`(hover: none)`).
- Mute button top-right (`♪` / `♪̸`), toggles `setMuted`; the first pointerdown/keydown anywhere calls `unlock()`.
- `↓` small at the bottom edge of the first screen, anchor to `#about`.
- Second screen `#about`: one sentence `Six original arcade games that run inside Claude Code while it works.` (author to confirm before deploy), then the two links.
- A zoomed tile re-fits on `resize`; tiles whose `loadTile` returned `null` keep their name on the dark background.

- [ ] **Step 1:** Implement `audio.ts`, `style.css`, `index.html`, `main.ts`, `games.ts` (+ its equality assertion in `bots.test.ts`) and `build-site.ts`.
- [ ] **Step 2:** `bun run build:site` → `site/dist` contains `index.html`, `main.js`, `style.css`, `loops/*.bin` × 6. `bun test site scripts` all pass; site tsc clean.
- [ ] **Step 3: Browser check (main agent, with claude-in-chrome)** on `bunx serve site/dist` (or `python3 -m http.server -d site/dist`): all six tiles animate; hover/arrows move the ring; Enter zooms and centres the command; Esc returns; copy shows the feedback and the clipboard holds the exact command; 390×844 viewport shows 2×3 with no horizontal scroll and the joystick hidden; resize while zoomed re-fits; renaming one `.bin` → that tile shows only its name, the others play; `window.AudioContext = undefined` before the first click → no console error.
- [ ] **Step 4: Commit** `feat(site): arcade wall page`.

---

### Task 6: Deploy

**Files:**
- Create: `site/wrangler.jsonc` — `{ "name": "coinslot", "compatibility_date": "2026-10-01", "assets": { "directory": "./dist" } }`
- Modify: `README.md` (a line near the top linking the page once the URL exists)

- [ ] **Step 1:** Ask the author to confirm the second-screen sentence and to approve the first public deploy (outward-facing).
- [ ] **Step 2:** `bun run build:site && cd site && npx wrangler deploy` → prints the `*.workers.dev` URL.
- [ ] **Step 3:** Open the URL on desktop and phone width; repeat the Task 5 browser check's first four items against production.
- [ ] **Step 4:** Add the URL to `README.md`; commit `feat(site): deploy config and README link`.
