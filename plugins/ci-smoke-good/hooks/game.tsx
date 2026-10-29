import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

const KEYS = new Map<string, number>([
  ['up', 0], ['w', 0], ['right', 1], ['d', 1], ['down', 2], ['s', 2], ['left', 3], ['a', 3],
])

function key(e: ClientKeyEvent, i: Input): Input {
  const d = KEYS.get(e.key.toLowerCase())

  return d !== undefined ? { ...i, dir: d } : i
}

function pointer(_e: ClientPointerEvent, i: Input): Input {
  return i
}

// The whole run is saved; a remount (dialog open/close) resumes it paused.
export const SPEC: GameSpec<Game, Input> = {
  title: 'CI Smoke Good',
  hint: 'CI Smoke Good: click here to focus, then steer with the arrow keys.',
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
