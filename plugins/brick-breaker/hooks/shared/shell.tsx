import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue, RenderElement } from 'claude-code'

import { toRuns, hex } from './cells'
import type { Cells } from './cells'
import { isEnvelope } from './envelope'
import type { Pause } from './link'
import { drawOverlay, drawSizeNotice } from './overlay'
import type { Banner } from './overlay'

export const TICK_MS = 33
export const SAVE_EVERY_TICKS = 30
// The default envelope version; a game that changes its state shape sets `saveV`.
export const SAVE_V = 1

const MIN_COLS = 40
const MIN_ROWS = 10
// The engine refuses a Client tree over 100,000 characters. A smooth gradient makes
// nearly every cell its own Text, so colors are reduced to 8 levels a channel,
// which merges neighbours: 100x26 drops from ~2400 runs to ~600.
const COLOR_MASK = 0xe0e0e0

export type Policy = {
  // wait for a key before the first tick of a fresh run
  start: boolean
  // escape pauses a running game (a game that has no use for escape keeps it free)
  escape: boolean
  // pause after this long without a key or pointer input; null never
  idleMs: number | null
}

// `h` is pixels: two per terminal row.
export type GameSpec<G, I> = {
  title: string
  // shown before the first frame; defaults to `${title}: click here to focus.`
  hint?: string
  // bump when the saved state changes shape: older saves are then ignored
  saveV?: number
  policy: Policy
  create(cols: number, h: number, seed: number): G
  resize(g: G, cols: number, h: number): G
  step(g: G, dt: number, input: I): G
  bonus(g: G): G
  render(g: G): Cells
  noInput(): I
  key(e: ClientKeyEvent, i: I): I
  pointer(e: ClientPointerEvent, i: I): I
  // Without save/load the whole state is saved and restored through resize.
  save?(g: G): JsonValue
  // null: the saved value is unusable, start fresh
  load?(fresh: G, saved: JsonValue): G | null
}

export type ShellProps = { pause: Pause; bonusSeq: number; save?: JsonValue; seed?: number; debug?: boolean }

type Hold = null | 'start' | 'paused'

type Ctl<G, I> = {
  game?: G
  // the size the game was last made or resized for
  dims?: string
  input: I
  seed: number
  props: ShellProps
  seenBonus: number
  hold: Hold
  restore?: JsonValue
  idleTicks: number
  ticksSinceSave: number
  lastSent?: string
  wasHeld: boolean
  n: number
  // dev readout: ms spent in the last step, and a 1 s window of per-frame totals
  stepMs: number
  frames: { at: number; ms: number }[]
}
export type ShellState = { ctl: Ctl<any, any>; n: number }

// Wall-clock reads live only in the readout path, never in a sim.
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const READOUT_WINDOW_MS = 1000

// Paints "NNms" (the 1 s max frame cost) at the top-right of the frame.
function drawReadout(c: Cells, ms: number): Cells {
  const text = `${Math.round(ms)}ms`
  const ch = [...c.ch]
  const fg = [...c.fg]
  const bg = [...c.bg]
  const start = c.cols - text.length
  if (start < 0 || c.rows < 1) return c
  for (let i = 0; i < text.length; i++) {
    ch[start + i] = text[i] as string
    fg[start + i] = 0xffff00
    bg[start + i] = 0x000000
  }

  return { ...c, ch, fg, bg }
}

function coarse(c: Cells): Cells {
  return { ...c, fg: c.fg.map(v => v & COLOR_MASK), bg: c.bg.map(v => v & COLOR_MASK) }
}

// The saved envelope: { v: SAVE_V, g }. A different version or any other shape is no save.
function savedGame(v: unknown, version: number): JsonValue | undefined {
  if (!isEnvelope(v) || v.v !== version) return undefined

  return v.g as JsonValue
}

export function runShell<G, I>(spec: GameSpec<G, I>, raw: JsonValue, surface: ClientSurface<ShellState>): RenderElement {
  const { Box, Text } = surface.elements
  const props = raw as unknown as ShellProps
  const saveV = spec.saveV ?? SAVE_V

  let ctl: Ctl<G, I>
  if (surface.state === undefined) {
    const restore = savedGame(props.save, saveV)
    ctl = {
      input: spec.noInput(),
      seed: props.seed ?? Date.now() & 0xffff,
      props,
      seenBonus: props.bonusSeq,
      hold: restore !== undefined ? 'paused' : spec.policy.start ? 'start' : null,
      idleTicks: 0,
      ticksSinceSave: 0,
      wasHeld: false,
      n: 0,
      stepMs: 0,
      frames: [],
    }
    if (restore !== undefined) ctl.restore = restore
    const mine = ctl

    const redraw = () => {
      mine.n += 1
      surface.setState({ ctl: mine, n: mine.n })
    }

    const sendSave = () => {
      if (mine.game === undefined) return
      const g = spec.save ? spec.save(mine.game) : (mine.game as unknown as JsonValue)
      const text = JSON.stringify(g)
      if (text === mine.lastSent) return
      mine.lastSent = text
      surface.post({ type: 'save', save: { v: saveV, g } })
    }

    const make = (cols: number, rows: number): G => {
      let g = spec.create(cols, rows * 2, mine.seed)
      if (mine.restore !== undefined) {
        const saved = mine.restore
        let back: G | null
        try {
          back = spec.load ? spec.load(g, saved) : spec.resize(saved as unknown as G, cols, rows * 2)
        } catch {
          back = null
        }
        if (back === null) {
          // an unusable save plays as a fresh run, and is overwritten by the next save
          mine.hold = spec.policy.start ? 'start' : null
        } else {
          g = back
        }
        mine.restore = undefined
      }

      return g
    }

    surface.every(TICK_MS, () => {
      const p = mine.props
      const cols = surface.columns
      const rows = surface.rows
      if (cols <= 0 || rows <= 0) return
      // a fixed step keeps the sim reproducible; a slow tick just plays slower
      const dt = TICK_MS / 1000
      // no step this tick unless one runs below
      mine.stepMs = 0

      const held = p.pause !== null || mine.hold !== null
      if (held && !mine.wasHeld) sendSave()
      mine.wasHeld = held

      if (cols < MIN_COLS || rows < MIN_ROWS) return
      let changed = false
      if (mine.game === undefined) {
        changed = true
        mine.game = make(cols, rows)
      } else if (mine.dims !== `${cols}x${rows}`) {
        changed = true
        mine.game = spec.resize(mine.game, cols, rows * 2)
      }
      mine.dims = `${cols}x${rows}`

      if (p.pause !== null || mine.hold !== null) {
        mine.input = spec.noInput()
        if (changed) redraw()
        return
      }

      let g = mine.game
      // bonuses wait out a hold and arrive on resume, still subject to the game's own cap
      for (; mine.seenBonus < p.bonusSeq; mine.seenBonus += 1) g = spec.bonus(g)
      mine.seenBonus = p.bonusSeq
      const t0 = mine.props.debug ? now() : 0
      mine.game = spec.step(g, dt, mine.input)
      mine.stepMs = mine.props.debug ? now() - t0 : 0
      mine.input = spec.noInput()

      // A remount (dialog open/close) loses at most ~1 s of progress, by design:
      // saving every tick would post at 30 Hz for no visible gain.
      mine.ticksSinceSave += 1
      if (mine.ticksSinceSave >= SAVE_EVERY_TICKS) {
        mine.ticksSinceSave = 0
        sendSave()
      }

      mine.idleTicks += 1
      const idle = spec.policy.idleMs
      if (idle !== null && mine.idleTicks >= idle / TICK_MS) mine.hold = 'paused'
      redraw()
    })

    // Any input but escape-while-running ends a hold; a link pause is cleared by a post.
    const release = (): void => {
      mine.idleTicks = 0
      mine.hold = null
      if (mine.props.pause !== null) surface.post({ type: 'resume' })
      redraw()
    }

    surface.onPointer((e: ClientPointerEvent) => {
      if (mine.props.pause !== null || mine.hold !== null) {
        if (e.type === 'down') release()
        return
      }
      if (e.type === 'down' || e.type === 'move') mine.idleTicks = 0
      mine.input = spec.pointer(e, mine.input)
    })

    surface.onKey((e: ClientKeyEvent) => {
      if (mine.props.pause !== null || mine.hold !== null) {
        if (e.key !== 'escape') release()
        return
      }
      mine.idleTicks = 0
      if (e.key === 'escape' && spec.policy.escape) {
        mine.hold = 'paused'
        redraw()
        return
      }
      mine.input = spec.key(e, mine.input)
    })
    surface.setState({ ctl: mine, n: 0 })
  } else {
    ctl = surface.state.ctl as Ctl<G, I>
    ctl.props = props
  }

  const cols = surface.columns
  const rows = surface.rows
  let cells: Cells | undefined
  let renderStart = 0
  let rendered = false
  if (cols > 0 && rows > 0 && (cols < MIN_COLS || rows < MIN_ROWS)) {
    cells = drawSizeNotice(cols, rows)
  } else if (ctl.game !== undefined) {
    renderStart = props.debug ? now() : 0
    rendered = true
    cells = spec.render(ctl.game)
    // a finished turn outranks the local hold
    const banner: Banner | null = props.pause !== null ? props.pause : ctl.hold
    if (banner !== null) cells = drawOverlay(cells, banner)
  }
  if (!cells) return <Text dimColor>{spec.hint ?? `${spec.title}: click here to focus.`}</Text>

  let runs: ReturnType<typeof toRuns>
  if (props.debug && rendered) {
    const at = now()
    ctl.frames = ctl.frames.filter(f => at - f.at < READOUT_WINDOW_MS)
    const max = ctl.frames.reduce((m, f) => Math.max(m, f.ms), 0)
    runs = toRuns(coarse(drawReadout(cells, max)))
    // step + render + toRuns of this frame (the readout shows it from the next frame on)
    ctl.frames.push({ at, ms: ctl.stepMs + (now() - renderStart) })
  } else {
    runs = toRuns(coarse(cells))
  }
  const lines = runs.map(row => (
    <Box flexDirection="row">
      {row.map(r => (
        <Text color={hex(r.fg)} backgroundColor={hex(r.bg)}>
          {r.text}
        </Text>
      ))}
    </Box>
  ))

  return <Box flexDirection="column">{lines}</Box>
}
