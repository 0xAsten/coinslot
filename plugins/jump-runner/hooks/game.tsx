import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'

import { renderCells } from './render'
import { newGame, resize, spawnBonus, step } from './sim'
import type { Game, Input } from './sim'
import { runShell } from './shared/shell'
import type { GameSpec, ShellState } from './shared/shell'

const JUMP_KEYS = new Set([' ', 'space', 'up', 'w', 'k'])

// Space, up or w jumps (the shell keeps p and Esc away from it); there is no key-up.
function key(e: ClientKeyEvent, i: Input): Input {
  if (JUMP_KEYS.has(e.key.toLowerCase())) return { ...i, tap: true }

  return i
}

function pointer(e: ClientPointerEvent, i: Input): Input {
  if (e.type === 'down') return { ...i, tap: true }

  return i
}

// The whole run is saved; a remount (dialog open/close) resumes it paused.
export const SPEC: GameSpec<Game, Input> = {
  title: 'Jump Runner',
  hint: 'Jump Runner: click here to focus, then press space or up to jump · p pause · esc back to chat.',
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
