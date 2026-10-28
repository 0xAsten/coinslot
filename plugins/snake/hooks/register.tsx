import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'snake',
    title: 'Snake',
    command: 'snake',
    description: 'Open the Snake arcade game in a pane',
    opened: 'Snake opened. Tap the arrow keys or WASD to steer; it pauses after a few idle seconds; esc returns to chat.',
  })
}
