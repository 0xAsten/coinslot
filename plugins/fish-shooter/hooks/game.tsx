import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

export type Snapshot = { coins: number; bet: number; caughtCount: number }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function key(e: ClientKeyEvent, i: Input): Input {
  const p = { ...i }
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

  return p
}

function pointer(e: ClientPointerEvent, i: Input): Input {
  if (e.type !== 'move' && e.type !== 'down') return i
  const next: Input = { ...i, aimTo: { x: e.x + 0.5, y: e.y * 2 + 1 } }
  if (e.type === 'down' && e.button === 'left') next.fire = true

  return next
}

// Only the purse is kept across a remount; the lagoon is rebuilt.
export const SPEC: GameSpec<Game, Input> = {
  title: 'Fish Shooter',
  hint: 'Fish Shooter: click here to focus, then fire.',
  policy: { start: false, escape: false, idleMs: null },
  create: (cols, h, seed) => newGame(cols, h, seed),
  resize,
  step,
  bonus: spawnBonus,
  render: renderCells,
  noInput: () => ({}),
  key,
  pointer,
  save: g => ({ coins: g.coins, bet: g.bet, caughtCount: g.caughtCount }),
  load: (fresh, saved) => {
    const s = saved as Partial<Snapshot> | null
    if (s === null || typeof s !== 'object' || !finite(s.coins) || !finite(s.bet) || !finite(s.caughtCount)) return null

    return { ...fresh, coins: s.coins, bet: Math.max(1, Math.min(5, Math.round(s.bet))), caughtCount: s.caughtCount }
  },
}

export default (raw: JsonValue, surface: ClientSurface<ShellState>) => runShell(SPEC, raw, surface)
