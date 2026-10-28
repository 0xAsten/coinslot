# Coin Slot Games Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename reef-net to fish-shooter, extract a shared game shell from it, and ship five more games on that shell: brick-breaker, snake, space-shooter, tap-flyer, jump-runner.

**Architecture:** Each game stays its own plugin under `plugins/<game>/`. A new shared Client shell (`shared/shell.tsx`) owns the tick loop, start/Esc/idle holds, the overlay, the size notice, save/restore, bonus delivery and drawing. A new shared hooks helper (`shared/hooks-pane.tsx`) owns the slash command, pane open, save messages and the Pane render. A game supplies a pure `sim.ts`, a pure `render.ts`, a `game.tsx` that hands a `GameSpec` to the shell, and the per-plugin literal-atom files (`link-apply.ts`, `save-store.ts`).

**Tech Stack:** Claude Code mod API (2.1.312), TypeScript 5.9.3, Bun, `claude plugin test` with `claude-code/testing`.

**Spec:** `docs/superpowers/specs/2026-10-28-coinslot-games-design.md` (Plan 2), on top of `docs/superpowers/specs/2026-10-28-coinslot-design.md` (main spec).

## Global Constraints

- Everything in Plan 1's Global Constraints still holds (`docs/superpowers/plans/2026-10-28-coinslot-foundation.md`), except the `CLAUDE NEEDS YOU` copy, which is gone.
- Names, verbatim; the slash command equals the plugin name: `fish-shooter`, `brick-breaker`, `snake`, `space-shooter`, `tap-flyer`, `jump-runner`. Pane titles: `Fish Shooter`, `Brick Breaker`, `Snake`, `Space Shooter`, `Tap Flyer`, `Jump Runner`.
- Overlay copy, verbatim: `CLAUDE IS DONE · ESC TO RETURN`, `PRESS ANY KEY TO START`, `PAUSED · PRESS ANY KEY`.
- Protagonists are original: jump-runner's runner is not a dinosaur; tap-flyer is not a bird flying between green pipes. No trademarked names (Breakout, Tetris, Flappy) anywhere in copy or code identifiers.
- Sims are pure: no `Date`, no `Math.random`; all randomness comes from the seed inside the state. Game state is plain JSON (no `Map`, `Set`, class instances), because it is saved through `$.state`.
- Terminals send no key-up events, so no mechanic may depend on holding a key (no hold-to-fire, no variable jump height).
- A `tool.call` bonus only rewards: it never spawns inside or on an obstacle, never speeds anything up, and each game caps how many bonuses can be on screen at once.
- Client tick 33 ms; minimum play area 40×10; colors pass through the existing `COLOR_MASK = 0xe0e0e0` coarsening before drawing.
- Per-plugin `link-apply.ts` and `save-store.ts` keep literal `{ plugin: '<name>', key }` atoms (the engine's static scan rejects atoms and `$` passed as parameters).
- No migration of old saves and no `/reef` alias.

## Review Focus

- Two direction keys inside one snake tick (for example ↑ then ← while moving right) → the snake turns twice over two ticks and never reverses into itself (test in Task 5).
- Pane resized mid-run (inline 90×13 → dock 120×30 and back) → the run continues, every entity is clamped inside the new field, no crash (shell test in Task 3; one `resize` test per game).
- A burst of 30 tool calls in one frame → on-screen bonuses stop at the game's cap and the frame still draws (one test per game).
- A saved snapshot from an older build, or a broken value in `$.state` → ignored, the game starts fresh with no crash (shell test in Task 3).
- A key pressed in the instant a run ends (tap-flyer, jump-runner, snake) → it does not restart immediately; restart needs a key after a 0.5 s guard (tests in Tasks 5, 7, 8).

---

### Task 1: Rename reef-net → fish-shooter

Mechanical; no behaviour change.

**Files:**
- Move: `plugins/reef-net/` → `plugins/fish-shooter/`
- Modify: `.claude-plugin/marketplace.json`, `plugins/fish-shooter/.claude-plugin/plugin.json`, `plugins/fish-shooter/types/index.d.ts`, `plugins/fish-shooter/hooks/{register.tsx,link-apply.ts,save-store.ts,game.tsx,*.test.ts*}`, `README.md`, `docs/probe-findings.md` (one line noting the rename)

- [ ] **Step 1:** `git mv plugins/reef-net plugins/fish-shooter`. Replace the atom plugin key `'reef-net'` → `'fish-shooter'` in `link-apply.ts`, `save-store.ts` and the `PluginState` key in `types/index.d.ts`; `PANE = 'fish-shooter'`, `TITLE = 'Fish Shooter'`, command `name: 'fish-shooter'`, the Client `key` and the tests' `in:` → `'game'`; manifest `name: "fish-shooter"`, description ends `Open it with /fish-shooter.`; marketplace entry renamed; README install and open lines use `fish-shooter`.
- [ ] **Step 2:** `grep -rn "reef" plugins scripts shared README.md .claude-plugin`. Expected: no hits except the game's own fish/reef art words in `sim.ts`/`render.ts` and the default export name.
- [ ] **Step 3:** `bun run check`. Expected: `check: all ok` with `fish-shooter` listed.
- [ ] **Step 4:** Commit `refactor: rename reef-net to fish-shooter`.

### Task 2: Shared shell and pane helper, fish-shooter ported onto them

**Files:**
- Create: `shared/shell.tsx`, `shared/hooks-pane.tsx`, `shared/shell.test.tsx`
- Modify: `shared/overlay.ts` (banner type), `shared/hooks-link.ts` (unchanged API; only if the pane helper needs it)
- Create: `plugins/_shared-tests/hooks/{dummy.tsx,save-store.ts}` (a test game: a dot that moves one pixel per tick, a counter in its state, key/pointer inputs recorded), update its `register.tsx` and `types/index.d.ts`
- Modify: `plugins/fish-shooter/hooks/{game.tsx,register.tsx,save-store.ts}`
- Run: `bun run bundle`

**Interfaces:**
- Produces, `shared/overlay.ts`:
  - `type Banner = 'done' | 'start' | 'paused'`; `drawOverlay(c: Cells, banner: Banner): Cells` with the three verbatim copies from Global Constraints.
- Produces, `shared/shell.tsx`:
  - `type Policy = { start: boolean; escape: boolean; idleMs: number | null }`
  - `type GameSpec<G, I> = { title: string; policy: Policy; create(cols: number, h: number, seed: number): G; resize(g: G, cols: number, h: number): G; step(g: G, dt: number, input: I): G; bonus(g: G): G; render(g: G): Cells; noInput(): I; key(e: ClientKeyEvent, i: I): I; pointer(e: ClientPointerEvent, i: I): I; save?(g: G): JsonValue; load?(fresh: G, saved: JsonValue): G | null }` — `h` is pixels (`rows * 2`). Without `save`/`load` the shell saves the whole state as `{ v: SAVE_V, g }` and restores it through `resize`; a `v` mismatch or a non-object means "no save".
  - `type ShellProps = { pause: Pause; bonusSeq: number; save?: JsonValue; seed?: number }`
  - `runShell<G, I>(spec: GameSpec<G, I>, raw: JsonValue, surface: ClientSurface<ShellState>): ClientElement` — what a game's `export default` returns.
  - `const TICK_MS = 33`, `const SAVE_EVERY_TICKS = 30`, `const SAVE_V = 1`.
- Produces, `shared/hooks-pane.tsx`:
  - `registerGamePane(on: On, opts: { pane: string; title: string; command: string; description: string }): void` — registers the command, opens the pane (clearing a stale pause as fish-shooter does today), stores `{ type: 'save', save }` messages via `../save-store`, renders the Pane (terminal-only text otherwise, size rules from Plan 1) with `<Client key="game" module="./game.tsx" … />`, and calls `registerClaudeLink`.
  - Each plugin's `save-store.ts` produces `readSave`, `writeSave`, `readSeed` (literal atoms `save` shape `save-1`, `seed` shape `seed-1`) and `parseSave(v: unknown): JsonValue | null`.
  - If the engine resolves `module="./game.tsx"` relative to `hooks/shared/` or its scan rejects the shared render, keep `ui.render` in each plugin's `register.tsx` and share everything else; record which one held in the task report.

Shell behaviour (the hold rules from spec §4):
- Local hold `null | 'start' | 'paused'`. Fresh mount: `'start'` if `policy.start`, else `null`. Mount with a save: always `'paused'`.
- `escape` key: if `policy.escape` and running → `'paused'`. Any other key or a pointer `down` clears the hold; if the link pause is `'done'`, it also posts `{ type: 'resume' }` as today.
- Idle: count ticks since the last key, pointer down or pointer move; at `idleMs / TICK_MS` ticks → `'paused'`.
- Banner precedence: `'done'` over the local hold. While held or done: no `step`, no bonus spawn (bonuses queue up and arrive on resume, still subject to the game's cap), save once on entering the hold.

- [ ] **Step 1: Write the failing shell tests** in `shared/shell.test.tsx`, mounting the dummy game through `_shared-tests`:
  - `fresh mount with start policy waits for a key`: banner text `PRESS ANY KEY TO START` found; frame JSON identical across `advance(1000)`; after `key({ key: 'x' })` and `advance(100)` the frame differs.
  - `escape pauses and any key resumes`: running, `key({ key: 'escape' })` → `PAUSED · PRESS ANY KEY`, frozen across `advance(1000)`; `key({ key: 'x' })` → moving again.
  - `idle pause after idleMs without input`: policy `idleMs: 3000`; `advance(3100)` → paused banner; a second mount pressing a key every 1000 ms for 6000 ms → never paused.
  - `a remount with a save comes back paused with that state`: store holds `{ v: 1, g: { counter: 42, … } }` → paused banner and the dummy's HUD shows `42`.
  - `a save from another version is ignored`: store holds `{ v: 0, g: {} }`, then `'garbage'` → fresh game, no throw.
  - `resize keeps the run`: `resize` 70×20 → 120×30 → 40×10; counter keeps increasing; below 40×10 the size notice is shown.
  - `done outranks a local hold and a key resumes both`: link `pause: 'done'` plus local `'paused'` → `CLAUDE IS DONE · ESC TO RETURN`; one key → running and the store's link pause is `null`.
  - `save is posted every 30 ticks only when it changed`.
- [ ] **Step 2:** `bun run bundle && claude plugin test plugins/_shared-tests`. Expected: the new tests FAIL (no `shell.tsx`).
- [ ] **Step 3:** Implement `shared/overlay.ts` banner, `shared/shell.tsx`, `shared/hooks-pane.tsx`, the dummy game, `_shared-tests` `save-store.ts`.
- [ ] **Step 4:** `bun run bundle && claude plugin test plugins/_shared-tests`. Expected: PASS.
- [ ] **Step 5:** Port fish-shooter: `game.tsx` becomes its `GameSpec` (policy `{ start: false, escape: false, idleMs: null }`, its own `save`/`load` keeping today's `{ coins, bet, caughtCount }` snapshot and bet clamp) plus `export default (raw, surface) => runShell(SPEC, raw, surface)`; `register.tsx` calls `registerGamePane`. Keep its existing tests; the only expected test change is that a remount with a save now shows `PAUSED · PRESS ANY KEY` first (update `link.test.tsx`'s remount test to press a key before asserting coins).
- [ ] **Step 6:** `bun run check`. Expected: `check: all ok`.
- [ ] **Step 7:** Commit `feat: shared game shell; fish-shooter runs on it`.

### Task 3: Dev frame-time readout

**Files:** Modify `shared/shell.tsx`, `shared/shell.test.tsx`.

- [ ] **Step 1: Failing test** `the frame readout appears only in debug`: with `$.state` key `debug` = `true` the top-right of the frame shows `NNms`; without it, no such text.
- [ ] **Step 2:** Implement: the shell measures the wall time of `step` + `render` + `toRuns` per tick and shows the 1-second max; enabled by a per-plugin literal `debug` atom (shape `debug-1`) read in `registerGamePane` and passed as a prop. Wall-clock reads live only here, never in a sim.
- [ ] **Step 3:** `bun run check`. Expected: `check: all ok`. Commit `feat(shell): dev frame-time readout`.

### Task 4: brick-breaker — then author live check (also covers fish-shooter and the Esc question)

**Files:** Create `plugins/brick-breaker/` with `.claude-plugin/plugin.json`, `types/index.d.ts`, `hooks/{hooks.json,register.tsx,link-apply.ts,save-store.ts,game.tsx,sim.ts,render.ts,sim.test.ts,render.test.ts,pane.test.tsx}`; marketplace entry; README line.

Game: a paddle at the bottom follows the pointer's x (pointer `move`) and ←/→; space, ↑ or a click launches the ball from the paddle. Rows of colored bricks; each brick hit scores and bursts into particles (spec: "砖块碎开时满屏粒子"). 3 lives; clearing the field loads the next layout. Bonus: a capsule drops from the top at a random x and is caught by the paddle — widen paddle for 10 s or one extra ball (balls capped at 3, capsules on screen capped at 2). Policy `{ start: true, escape: true, idleMs: null }`. Default whole-state save.

- [ ] **Step 1: Failing tests** in `sim.test.ts`: `ball reflects off side and top walls`; `a brick hit removes the brick, adds score, spawns particles`; `particles never exceed MAX_PARTICLES`; `missing the last ball costs a life and parks a new ball on the paddle`; `losing the last life ends the run and a key after 0.5 s starts a new one`; `30 bonuses in one frame leave at most 2 capsules`; `catching a capsule widens the paddle or adds a ball, never beyond 3 balls`; `resize clamps paddle, balls and capsules inside`; `same seed + same inputs → identical state after 300 steps`. In `render.test.ts`: `render returns cols × rows cells at 40×10 and 120×30`. In `pane.test.tsx`: `opens on PRESS ANY KEY TO START, a key launches play, HUD shows score and lives`.
- [ ] **Step 2:** Run `claude plugin test plugins/brick-breaker`. Expected: FAIL.
- [ ] **Step 3:** Implement sim, render, game spec, register (via `registerGamePane`), manifest (description says "for Claude Code" and `Open it with /brick-breaker.`). Pick `MAX_PARTICLES` with the frame readout at 120×30; if the shell needs more than glue, change the shell, not the game.
- [ ] **Step 4:** `bun run check`. Expected: `check: all ok`. Commit `feat: brick-breaker`.
- [ ] **Step 5: GATE — author live check.** Copy `plugins/brick-breaker` and `plugins/fish-shooter` (minus `.claude-plugin/types`) into this session's dev-mods directory (the plugin-authoring skill prints it). Ask the author to: play both at the inline size; press Esc mid-run in brick-breaker and say whether it paused; move the mouse without clicking and say whether the paddle followed; finish a Claude turn while playing; open and close an AskUserQuestion dialog. Record the answers in `docs/probe-findings.md` (section "Esc and pointer move, live"). Fix what the author reports before Task 5.

### Task 5: snake — then author live check

**Files:** `plugins/snake/` with the same file set as Task 4.

Game: a snake on a grid of square-looking cells (2 columns × 1 row per cell), arrows or WASD steer; food grows it by one; walls and its own body end the run; speed rises gently with length. Bonus: a glowing food worth 5 that grows by one like normal food (cap 2 on the board). Policy `{ start: true, escape: true, idleMs: X }` where `X = null` if Task 4 recorded that Esc pauses, else `6000`.

- [ ] **Step 1: Failing tests**: `turns queue: ↑ then ← inside one tick turn over two ticks, never a reversal`; `a reversal key alone is ignored`; `eating food grows by one and scores`; `wall and self collisions end the run`; `a key in the first 0.5 s after the end does not restart`; `30 bonuses → at most 2 glowing foods, never on the snake`; `resize to a smaller field keeps the snake inside or ends the run cleanly, never throws`; determinism (300 steps); render size test; pane test (start banner, a key starts, HUD shows score).
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun run check` → `check: all ok`. Commit `feat: snake`.
- [ ] **Step 5: GATE — author live check** (dev-mods copy, play, a Claude turn end, one dialog). Fix reports before Task 6.

### Task 6: space-shooter — then author live check

**Files:** `plugins/space-shooter/`, same file set.

Game: a ship on the left moves with the arrows and toward the pointer; it fires automatically (no key-up exists, so no hold-to-fire). Waves of enemies cross from the right; every 5th wave is a boss with a health bar. 3 lives, brief invulnerability after a hit. Bonus: a supply pod flies in — weapon level +1 (max 3) or a one-hit shield (pods on screen capped at 2). Policy `{ start: true, escape: true }`; `p` pauses (shell, all games — author decision 2026-10-28 replaced idle pause).

- [ ] **Step 1: Failing tests**: `auto-fire spawns shots at the weapon's rate`; `a shot destroys an enemy and scores`; `a hit costs a life and grants invulnerability for its window`; `the 5th wave is a boss and the 6th wave follows its defeat`; `weapon level never exceeds 3`; `30 bonuses → at most 2 pods, none spawned overlapping an enemy`; `pointer move steers the ship toward the pointer`; `resize clamps the ship and drops off-field entities`; determinism; render size; pane test.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun run check` → `check: all ok`. Commit `feat: space-shooter`.
- [ ] **Step 5: GATE — author live check.** Fix reports before Task 7.

### Task 7: tap-flyer — then author live check

**Files:** `plugins/tap-flyer/`, same file set.

Game: an original flyer (not a bird with green pipes) falls under gravity; any key or click gives one upward impulse. Obstacle columns with gaps scroll left; passing a gap scores 1. Touching an obstacle or the floor ends the run. Bonus: a coin in the middle of an upcoming gap, worth 3 (cap 2 on screen; never inside an obstacle). Policy `{ start: true, escape: true }`; `p` pauses (shell, all games — author decision 2026-10-28 replaced idle pause).

- [ ] **Step 1: Failing tests**: `a tap sets upward velocity, gravity pulls down`; `passing a gap scores once`; `obstacle and floor contact end the run`; `a key in the first 0.5 s after the end does not restart`; `30 bonuses → at most 2 coins, each inside a gap`; `gap size never shrinks below the minimum`; `resize keeps the flyer and gaps inside`; determinism; render size; pane test.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun run check` → `check: all ok`. Commit `feat: tap-flyer`.
- [ ] **Step 5: GATE — author live check.** Fix reports before Task 8.

### Task 8: jump-runner — then author live check

**Files:** `plugins/jump-runner/`, same file set.

Game: an original runner (not a dinosaur) runs right on the ground; space, ↑ or a click jumps (fixed height; one extra jump in the air). Ground obstacles and low flyers scroll in; speed ramps up over time; distance is the score. Bonus: a coin on the running path, worth 10 (cap 2; never on or touching an obstacle). Policy `{ start: true, escape: true }`; `p` pauses (shell, all games — author decision 2026-10-28 replaced idle pause).

- [ ] **Step 1: Failing tests**: `a jump has a fixed height and the air jump works once`; `obstacle contact ends the run`; `speed ramps but never past MAX_SPEED`; `consecutive obstacles always leave a clearable gap at the current speed`; `a key in the first 0.5 s after the end does not restart`; `30 bonuses → at most 2 coins, none touching an obstacle`; `resize keeps the runner on the ground`; determinism; render size; pane test.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bun run check` → `check: all ok`. Commit `feat: jump-runner`.
- [ ] **Step 5: GATE — author live check.** Fix reports.

### Task 9: Names, README, marketplace

**Files:** `README.md`, `.claude-plugin/marketplace.json`, each `plugin.json`.

- [ ] **Step 1:** For each of the six names, check for clashes: `gh search repos "<name> claude code plugin"`, `gh search code "\"name\": \"<name>\"" --filename plugin.json`, and whether a common marketplace already ships a `/<name>` command. Write a table (name, clash found, where) into the task report. Any clash → stop and propose alternatives to the author; do not rename on your own.
- [ ] **Step 2:** README: one section per game with its one-line install (`/plugin install <game> --marketplace beasaltfish/coinslot`) and how to open it (`/<game>`); marketplace descriptions for all six.
- [ ] **Step 3:** `bun run check` → `check: all ok`. Commit `docs: six games in the README and marketplace`.
