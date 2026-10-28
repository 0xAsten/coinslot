import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { NUDGE, newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

function key(e: ClientKeyEvent, i: Input): Input {
  const p: Input = { ...i, any: true }
  switch (e.key) {
    case ' ':
    case 'space':
    case 'up':
      p.launch = true
      break
    case 'left':
      p.nudge = (p.nudge ?? 0) - NUDGE
      break
    case 'right':
      p.nudge = (p.nudge ?? 0) + NUDGE
      break
    default:
  }

  return p
}

function pointer(e: ClientPointerEvent, i: Input): Input {
  if (e.type !== 'move' && e.type !== 'down') return i
  const next: Input = { ...i, padTo: e.x + 0.5 }
  if (e.type === 'down' && e.button === 'left') {
    next.launch = true
    next.any = true
  }

  return next
}

// The whole run is saved; a remount (dialog open/close) resumes it paused.
export const SPEC: GameSpec<Game, Input> = {
  title: 'Brick Breaker',
  hint: 'Brick Breaker: click here to focus, then move the paddle.',
  policy: { start: true, escape: true, idleMs: null },
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
