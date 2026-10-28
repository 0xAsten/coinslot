# Coin Slot Foundation Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `coinslot` repo as a Claude Code plugin marketplace, prove (or disprove) the Claude-linkage events in a probe, build the shared module, and ship reef-net as the first game wired to it.

**Architecture:** Each game is its own plugin under `plugins/<game>/`. Shared pure code lives in `shared/` and is copied into every plugin's `hooks/shared/` by `scripts/bundle-shared.ts`; the copy is committed so a marketplace install works with no build. Hooks modules own Claude events and `$.state`; the `Client` surface module owns the game loop and receives Claude state through `props`.

**Tech Stack:** Claude Code mod API (2.1.312), TypeScript ≥5.9, Bun (scripts and `claude plugin test`), JSX against global `h`.

**Spec:** `docs/superpowers/specs/2026-10-28-coinslot-design.md`

**Scope:** Plan 1 = spec §4, §6, §7, §9, §12 "第 0 步" and dev order items 1–2. Plan 2 = the other five games (one task group each, built on `shared/`). Plan 3 = showcase page + frame recorder (§8, §10). Plans 2–3 are written after Plan 1's probe results are in, because the probe decides which linkage layers exist.

## Global Constraints

- Terminal surface only; on any other `e.surface` the Pane renders one `Text`: `Coin Slot runs in the terminal.`
- Inline pane: never `height="100%"`; Client gets `width = max(20, e.props.bodyColumns)`, `height = clamp(e.props.scroll.bodyRows, 8, 26)`; `$.ui.open` passes `rows: 28`.
- Minimum play area 40 cols × 10 rows; below it the Client draws `Make the terminal wider or taller (40×10) · now <cols>×<rows>`
- Target 30 fps: Client tick 33 ms.
- Pause when the pane is unfocused; resume when focus returns. Esc always returns focus to the chat.
- TypeScript ≥5.9 (`typescript@5.9.3`); engine tsconfig targets es2023.
- No "Claude" in any plugin name or command; descriptions say "for Claude Code". License MIT.
- Install line format, verbatim: `/plugin install <game> --marketplace beasaltfish/coinslot`.
- Bonuses only reward, never raise difficulty.
- Overlay copy, verbatim: `CLAUDE IS DONE · ESC TO RETURN` and `CLAUDE NEEDS YOU · ESC TO RETURN`.
- Subagent turns (`e.agentId !== undefined`) never pause a game.
- Working names until the author confirms final names before first public release.

## Review Focus

- A background subagent finishing while you play → must not pause (test in Task 3).
- Claude finishes twice before you look → one overlay, not stacked; reason `needs-you` outranks `done` (test in Task 3).
- Terminal resized below 40×10 mid-game → game pauses with the size message, resumes without losing score (test in Task 4).
- Hot reload with an old `$.state` value from a previous shape → atom `shape: 'link-1'` falls back to initial, no crash (test in Task 3).
- Many tool calls in one frame (a burst of 30) → bonuses capped at 3 on screen, no frame stall (test in Task 4).

---

### Task 1: Repo scaffold, marketplace, check script

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE` (MIT, "beasaltfish"), `README.md` (title, one-line pitch, install line placeholder for reef-net), `.claude-plugin/marketplace.json`, `scripts/vendor-types.sh`, `scripts/bundle-shared.ts`, `scripts/check.ts`, `tsconfig.check.json`, `shared/.keep`

**Interfaces:**
- Produces: `bun run bundle` (copies `shared/*.ts` → `plugins/*/hooks/shared/`, overwriting; fails if a plugin's copy differs and `--check` is passed); `bun run check` (for every `plugins/*`: `bundle --check`, `claude plugin validate`, `tsc -p` (plugin's laid tsconfig if `.claude-plugin/types/tsconfig.json` exists, else `tsconfig.check.json` scoped to that plugin), `claude plugin test`; exits non-zero on the first failure and prints which plugin and step).
- `marketplace.json` lists plugins by `name` + `source: "./plugins/<name>"`; owner `beasaltfish`. Read the exact schema from the plugin-authoring skill's `reference.md` ("Sharing a mod").

- [ ] **Step 1:** `git init`, write the files above. `.gitignore`: `node_modules/`, `vendor/`, `plugins/*/.claude-plugin/types/`, `.superpowers/`.
- [ ] **Step 2:** `scripts/vendor-types.sh <path-to-claude-code.d.ts>` copies the engine types to `vendor/claude-code.d.ts` (gitignored; it is regenerated per Claude Code build). `tsconfig.check.json` mirrors the engine tsconfig (target/lib es2023, module esnext, moduleResolution bundler, strict, noUncheckedIndexedAccess, jsx react, jsxFactory h, jsxFragmentFactory Fragment) and includes `vendor/claude-code.d.ts`.
- [ ] **Step 3:** Run `bun run check` with zero plugins. Expected: `no plugins` and exit 0.
- [ ] **Step 4:** Commit `chore: scaffold coinslot marketplace and check script`.

### Task 2: Linkage probe (spec §6 第 0 步) — GATE

A throwaway plugin `plugins/_probe/` (not listed in `marketplace.json`) that shows, in a pane, a live log of what reaches it. No tests; this task's deliverable is `docs/probe-findings.md`.

**Files:**
- Create: `plugins/_probe/.claude-plugin/plugin.json`, `plugins/_probe/hooks/{hooks.json,register.tsx,probe.tsx}`, `plugins/_probe/types/index.d.ts`, `docs/probe-findings.md`

**Interfaces:**
- Produces: findings consumed by Task 3 and Plans 2–3.

- [ ] **Step 1:** `register.tsx`: `/probe` opens pane `probe` (`rows: 20`). Hooks `turn.start`, `turn.complete`, `tool.check` (await `next(e)`, record the decision), `tool.call` (record `e.tool`), `ui.focus`. Each appends `{ t: Date.now(), event, detail, agentId?: string }` to atom `{ plugin: '_probe', key: 'log' }` (keep last 30) and also calls `$.ui.toast` for `turn.complete`. Pane render passes `props={{ log, focused: e.props.isFocused }}` to `<Client key="p" module="./probe.tsx" width={...} height={...}>` sized per Global Constraints.
- [ ] **Step 2:** `probe.tsx`: draws the log lines and, every 250 ms via `surface.every`, a frame counter plus `focused` from props — so we see whether props reach a running Client while unfocused, and whether the tick keeps running unfocused. On `turn.complete` (main turn only) also call `$.ui.notify('probe: turn complete')` from the hook and record `isSent`/`reason`.
- [ ] **Step 3:** `bun run check` passes for `_probe` (validate + tsc; no tests).
- [ ] **Step 4 (author runs it, main agent records):** In a real session with `_probe` loaded: (a) open `/probe`, click it, press Esc; (b) ask Claude for a task that runs a Bash command needing approval; (c) a task that spawns a subagent; (d) a plain answer. Fill `docs/probe-findings.md` with a yes/no + evidence line for each: props update while unfocused; tick runs while unfocused; `isFocused` flips on click/Esc; `turn.complete` main vs `agentId`; `tool.check` shows `ask` before the approval prompt; `tool.call` per tool; `AskUserQuestion` arrives as `tool.call`; `$.ui.notify` result; measured fps line.
- [ ] **Step 5:** Commit `chore: linkage probe and findings`. **Stop and report findings.** If a layer is impossible, Task 3 drops that layer per spec §13 (ship what works) and the plan's remaining tasks skip its parts.

### Task 3: Shared module

**Files:**
- Create: `shared/cells.ts`, `shared/link.ts`, `shared/overlay.ts`, `shared/hooks-link.ts`, `shared/link.test.ts`, `shared/cells.test.ts`

**Interfaces:**
- Produces:
  - `cells.ts`: `type Cells = { cols: number; rows: number; ch: string[]; fg: number[]; bg: number[] }` (colors `0xRRGGBB`); `type Run = { text: string; fg: number; bg: number }`; `toRuns(c: Cells): Run[][]` (one array per row, adjacent equal fg+bg merged); `hex(n: number): string` → `#rrggbb`.
  - `link.ts`: `type Pause = null | 'done' | 'needs-you'`; `type LinkState = { pause: Pause; bonusSeq: number }`; `LINK_INITIAL: LinkState = { pause: null, bonusSeq: 0 }`; pure reducers `onTurnComplete(s, agentId?: string): LinkState`, `onAsk(s): LinkState`, `onToolCall(s): LinkState`, `onResume(s): LinkState`, `onTurnStart(s, agentId?: string): LinkState`.
  - `overlay.ts`: `drawOverlay(c: Cells, reason: Exclude<Pause, null>): Cells` (centered banner, copy from Global Constraints, dark bg `0x0b1d26`, text `0xffd61f`, returns a new Cells); `drawSizeNotice(cols: number, rows: number): Cells`.
  - `hooks-link.ts`: `registerClaudeLink(on, link, opts: { title: string })` where `link` is the plugin's own atom of `LinkState` (atom refs need literal `plugin`/`key`, so each plugin creates it). Wires: `turn.start` → `onTurnStart`; `turn.complete` → `onTurnComplete` and, when it set a pause, `$.ui.notify('Claude is done', { title: opts.title })` ignoring `isSent:false`; `tool.check` → after `next(e)`, if decision is `'ask'` → `onAsk`; `tool.call` → `AskUserQuestion` → `onAsk`, every tool → `onToolCall`; `ui.message` with `{ type: 'resume' }` → `onResume`. Every hook returns `next(e)`'s result unchanged (observe only; give each `.catch(($, e, next) => next.called ? undefined : next(e))` per the type docs so a failure never blocks a tool).
- Consumes: Task 2 findings (skip wiring for any event the probe showed unusable).

- [ ] **Step 1: Write failing tests** in `shared/link.test.ts` (use `claude-code/testing`):
  - `subagent end does not pause`: `onTurnComplete(LINK_INITIAL, 'a1').pause === null`.
  - `main end pauses done`: `onTurnComplete(LINK_INITIAL).pause === 'done'`.
  - `needs-you outranks done`: `onTurnComplete(onAsk(LINK_INITIAL)).pause === 'needs-you'`; `onAsk(onTurnComplete(LINK_INITIAL)).pause === 'needs-you'`.
  - `repeat end stays one pause`: two `onTurnComplete` calls → `'done'`.
  - `tool call bumps bonus`: `onToolCall(LINK_INITIAL).bonusSeq === 1`.
  - `resume and new main turn clear pause`; `subagent turn start keeps pause`.
  - In `shared/cells.test.ts`: `toRuns merges equal neighbours` (row `[A,A,B]` → 2 runs, texts `'xx'`,`'y'`); `drawOverlay centers the done copy` (row at `floor(rows/2)` contains `CLAUDE IS DONE · ESC TO RETURN`); `overlay on a 20-col grid truncates without throwing`.
- [ ] **Step 2:** Run `claude plugin test shared` — or, since `shared/` is not a plugin, run via the first plugin after bundling; simplest: `bun test shared` if `claude-code/testing` resolves outside a plugin, else move these tests into `plugins/reef-net/hooks/shared/` via bundle and run there. Pick whichever works and record it in `scripts/check.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the four files.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(shared): claude link reducers, cells runs, overlay`.

### Task 4: reef-net joins the repo, wired to the link

**Files:**
- Copy from `~/.claude/dev-mods/fcbfe306-b356-47a3-9cce-13f0dc9e3968/reef-net/` → `plugins/reef-net/` (hooks, tests, manifest).
- Modify: `plugins/reef-net/hooks/register.tsx`, `plugins/reef-net/hooks/game.tsx`, `plugins/reef-net/hooks/sim.ts`, `plugins/reef-net/hooks/render.ts`
- Create: `plugins/reef-net/types/index.d.ts` (`interface PluginState { 'reef-net': { link: Shaped<LinkState> } }`), `plugins/reef-net/hooks/link.test.tsx`
- Generated: `plugins/reef-net/hooks/shared/*` via `bun run bundle`

**Interfaces:**
- Consumes: everything Task 3 produces.
- Produces: the pattern Plan 2 copies for every game — `register.tsx` creates `const link = atom({ plugin: 'reef-net', key: 'link' } as const, LINK_INITIAL, { shape: 'link-1' })`, calls `registerClaudeLink(on, link, { title: 'Reef Net' })`, and renders `<Client props={{ focused, pause, bonusSeq }} …>`; `sim.ts` gains `spawnBonus(g: Game): Game` (one golden fish, value 15, catch chance 1/2, swims through once, at most 3 alive).

- [ ] **Step 1: Write failing tests:**
  - `sim.test.ts` → `bonus fish is capped at three`: 30 `spawnBonus` calls → 3 golden fish; `bonus fish pays 15 x bet`.
  - `link.test.tsx` (mount like the existing `pane.test.tsx`): `unfocused props stop the tick` (state after 1 s unchanged); `pause props draw the overlay copy`; `bonusSeq +2 spawns two golden fish`; `a 40x10 region shows the size notice, then a 70x20 resize resumes with coins kept`; `a click while paused posts resume`.
- [ ] **Step 2:** Run `bun run check`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement: `game.tsx` uses `toRuns`/`hex` from `./shared/cells`, skips `step` when `!props.focused || props.pause || too small`, draws `drawOverlay`/`drawSizeNotice` on top, compares `props.bonusSeq` with its last seen value and calls `spawnBonus` for the difference (capped by sim), `surface.post({ type: 'resume' })` on pointer `down` while paused. `register.tsx` per Interfaces; keep `/reef`, `rows: 28`, and the explicit sizing.
- [ ] **Step 4:** `bun run check` all green (validate, tsc, test).
- [ ] **Step 5:** Commit `feat(reef-net): join coinslot, pause on claude, golden fish bonus`.
- [ ] **Step 6 (author):** Install from the local marketplace (`/plugin install reef-net --marketplace <repo path>`), play while Claude runs a task; confirm pause, notification, bonus fish. Main agent records the result in `docs/probe-findings.md` under "reef-net live check".
