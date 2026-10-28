import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { NUDGE, newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

function key(e: ClientKeyEvent, i: Input): Input {
  const p: Input = { ...i, any: true }
  switch (e.key) {
    case 'up':
      p.dy = (p.dy ?? 0) - NUDGE
      break
    case 'down':
      p.dy = (p.dy ?? 0) + NUDGE
      break
    case 'left':
      p.dx = (p.dx ?? 0) - NUDGE
      break
    case 'right':
      p.dx = (p.dx ?? 0) + NUDGE
      break
    default:
  }

  return p
}

// A move (or click) points the ship at that spot; a cell is one column wide and two pixels tall.
function pointer(e: ClientPointerEvent, i: Input): Input {
  if (e.type !== 'move' && e.type !== 'down') return i
  const next: Input = { ...i, aimTo: { x: e.x + 0.5, y: e.y * 2 + 1 } }
  if (e.type === 'down') next.any = true

  return next
}

// The whole run is saved; a remount (dialog open/close) resumes it paused.
export const SPEC: GameSpec<Game, Input> = {
  title: 'Space Shooter',
  hint: 'Space Shooter: click here to focus, then steer the ship.',
  policy: { start: true, escape: true },
  create: (cols, h, seed) => newGame(cols, h, seed),
  resize,
  step,
  bonus: spawnBonus,
  render: renderCells,
  noInput: () => ({}),
  key,
  pointer,
}

export default (raw: JsonValue, surface: ClientSurface<ShellState>) => runShell(SPEC, raw, surface)
