import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'brick-breaker',
    title: 'Brick Breaker',
    command: 'coinslot-brick-breaker',
    description: 'Open the Brick Breaker arcade game in a pane',
    opened: 'Brick Breaker opened. Move the mouse or tap the arrow keys; p pauses; esc returns to chat.',
  })
}
