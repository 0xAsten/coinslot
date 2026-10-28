import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'space-shooter',
    title: 'Space Shooter',
    command: 'space-shooter',
    description: 'Open the Space Shooter arcade game in a pane',
    opened: 'Space Shooter opened. Move the mouse or tap the arrow keys; esc returns to chat.',
  })
}
