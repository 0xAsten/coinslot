import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { toRuns, hex } from './shared/cells'
import type { Cells } from './shared/cells'
import type { Pause } from './shared/link'
import { drawOverlay, drawSizeNotice } from './shared/overlay'

export type Snapshot = { coins: number; bet: number; caughtCount: number }
// `seed` is optional: absent, the sim seeds itself once from the clock; tests and the
// showcase recorder pass one so the run is reproducible.
type Props = { pause: Pause; bonusSeq: number; save?: Snapshot; seed?: number }

type Ctl = {
  game?: Game
  pending: Input
  seed: number
  props: Props
  seenBonus: number
  restore?: Snapshot
  ticksSinceSave: number
  lastSent?: Snapshot
  wasPaused: boolean
}
type State = { ctl: Ctl; n: number }

const TICK_MS = 33
const SAVE_EVERY_TICKS = 30
const MIN_COLS = 40
const MIN_ROWS = 10
// The engine refuses a Client tree over 100,000 characters. A smooth gradient makes
// nearly every cell its own Text, so colors are reduced to 8 levels a channel,
// which merges neighbours: 100x26 drops from ~2400 runs to ~600.
const COLOR_MASK = 0xe0e0e0

function coarse(c: Cells): Cells {
  return { ...c, fg: c.fg.map(v => v & COLOR_MASK), bg: c.bg.map(v => v & COLOR_MASK) }
}

const same = (a: Snapshot | undefined, b: Snapshot) =>
  a !== undefined && a.coins === b.coins && a.bet === b.bet && a.caughtCount === b.caughtCount

export default function Reef(raw: JsonValue, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  const props = raw as unknown as Props

  let ctl: Ctl
  if (surface.state === undefined) {
    ctl = {
      pending: {},
      seed: props.seed ?? Date.now() & 0xffff,
      props,
      seenBonus: props.bonusSeq,
      ticksSinceSave: 0,
      wasPaused: false,
    }
    if (props.save) ctl.restore = props.save
    const mine = ctl
    const state: State = { ctl: mine, n: 0 }
    let n = 0

    const sendSave = () => {
      if (!mine.game) return
      const snap: Snapshot = { coins: mine.game.coins, bet: mine.game.bet, caughtCount: mine.game.caughtCount }
      if (same(mine.lastSent, snap)) return
      mine.lastSent = snap
      surface.post({ type: 'save', save: snap })
    }

    surface.every(TICK_MS, () => {
      const p = mine.props
      const cols = surface.columns
      const rows = surface.rows
      if (cols <= 0 || rows <= 0) return
      // a fixed step keeps the sim reproducible; a slow tick just plays slower
      const dt = TICK_MS / 1000

      if (p.pause !== null && !mine.wasPaused) sendSave()
      mine.wasPaused = p.pause !== null


      const tooSmall = cols < MIN_COLS || rows < MIN_ROWS
      if (tooSmall) return
      let changed = false
      if (!mine.game) {
        changed = true
        mine.game = newGame(cols, rows * 2, mine.seed)
        if (mine.restore) {
          mine.game.coins = mine.restore.coins
          mine.game.bet = Math.max(1, Math.min(5, Math.round(mine.restore.bet)))
          mine.game.caughtCount = mine.restore.caughtCount
        }
      } else if (mine.game.w !== cols || mine.game.h !== rows * 2) {
        changed = true
        mine.game = resize(mine.game, cols, rows * 2)
      }

      if (p.pause !== null) {
        mine.pending = {}
        if (changed) surface.setState({ ctl: mine, n })
        return
      }

      let g = mine.game
      for (; mine.seenBonus < p.bonusSeq; mine.seenBonus += 1) g = spawnBonus(g)
      mine.seenBonus = p.bonusSeq
      mine.game = step(g, dt, mine.pending)
      mine.pending = {}

      // A remount (dialog open/close) loses at most ~1 s of progress, by design:
      // saving every tick would post at 30 Hz for no visible gain.
      mine.ticksSinceSave += 1
      if (mine.ticksSinceSave >= SAVE_EVERY_TICKS) {
        mine.ticksSinceSave = 0
        sendSave()
      }
      n += 1
      surface.setState({ ctl: mine, n })
    })

    surface.onPointer((e: ClientPointerEvent) => {
      if (mine.props.pause !== null) {
        if (e.type === 'down') surface.post({ type: 'resume' })
        return
      }
      if (e.type !== 'move' && e.type !== 'down') return
      const aimTo = { x: e.x + 0.5, y: e.y * 2 + 1 }
      mine.pending = { ...mine.pending, aimTo }
      if (e.type === 'down' && e.button === 'left') mine.pending.fire = true
    })

    surface.onKey((e: ClientKeyEvent) => {
      if (mine.props.pause !== null) {
        if (e.key !== 'escape') surface.post({ type: 'resume' })
        return
      }
      const p = { ...mine.pending }
      switch (e.key) {
        case ' ':
        case 'space':
          p.fire = true
          break
        case 'left':
          p.aimDx = (p.aimDx ?? 0) - 3
          break
        case 'right':
          p.aimDx = (p.aimDx ?? 0) + 3
          break
        case 'up':
        case ']':
          p.bet = (p.bet ?? 0) + 1
          break
        case 'down':
        case '[':
          p.bet = (p.bet ?? 0) - 1
          break
        case 'r':
          p.refill = true
          break
        default:
      }
      mine.pending = p
    })
    surface.setState(state)
  } else {
    ctl = surface.state.ctl
    ctl.props = props
  }

  const cols = surface.columns
  const rows = surface.rows
  let cells: Cells | undefined
  if (cols > 0 && rows > 0 && (cols < MIN_COLS || rows < MIN_ROWS)) {
    cells = drawSizeNotice(cols, rows)
  } else if (ctl.game) {
    cells = renderCells(ctl.game)
    if (props.pause !== null) cells = drawOverlay(cells, props.pause)
  }
  if (!cells) return <Text dimColor>Fish Shooter: click here to focus, then fire.</Text>

  const lines = toRuns(coarse(cells)).map(row => (
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
