import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import type { Cells } from './shared/cells'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

// The shell's test game: a dot that moves one pixel per tick, a counter in its
// state, and the inputs it was handed shown in the HUD.
type G = { w: number; h: number; x: number; counter: number; bonus: number; frozen: boolean; last: string; clicks: number }
type I = { keys: string[]; clicks: number; freeze: boolean }

const BG = 0x102030
const FG = 0xe0e0e0
const DOT = 0xffd61f
const BONUS_CAP = 3

function write(c: Cells, row: number, text: string): void {
  for (let i = 0; i < text.length && i < c.cols; i++) c.ch[row * c.cols + i] = text[i]!
}

export const SPEC: GameSpec<G, I> = {
  title: 'Dummy',
  policy: { start: true, escape: true, idleMs: 3000 },
  create: (cols, h) => ({ w: cols, h, x: 0, counter: 0, bonus: 0, frozen: false, last: '-', clicks: 0 }),
  resize: (g, cols, h) => ({ ...g, w: cols, h, x: g.x % cols, bonus: g.bonus ?? 0 }),
  step: (g, _dt, i) => {
    const last = i.keys.length > 0 ? i.keys[i.keys.length - 1]! : g.last
    const frozen = i.freeze ? !g.frozen : g.frozen
    const base = { ...g, last, frozen, clicks: g.clicks + i.clicks }

    return frozen ? base : { ...base, x: (g.x + 1) % g.w, counter: g.counter + 1 }
  },
  bonus: g => ({ ...g, bonus: Math.min(BONUS_CAP, g.bonus + 1) }),
  render: g => {
    const rows = Math.floor(g.h / 2)
    const n = g.w * rows
    const c: Cells = { cols: g.w, rows, ch: Array(n).fill(' '), fg: Array(n).fill(FG), bg: Array(n).fill(BG) }
    write(c, 0, `counter ${g.counter} bonus ${g.bonus} clicks ${g.clicks} key ${g.last}`)
    const dot = Math.min(rows - 1, 2) * g.w + g.x
    c.ch[dot] = '●'
    c.fg[dot] = DOT

    return c
  },
  noInput: () => ({ keys: [], clicks: 0, freeze: false }),
  key: (e: ClientKeyEvent, i) => (e.key === 'f' ? { ...i, freeze: true } : { ...i, keys: [...i.keys, e.key] }),
  pointer: (e: ClientPointerEvent, i) => (e.type === 'down' ? { ...i, clicks: i.clicks + 1 } : i),
}

export default (raw: JsonValue, surface: ClientSurface<ShellState>) => runShell(SPEC, raw, surface)
