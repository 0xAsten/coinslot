import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: '__ID__',
    title: '__TITLE__',
    command: 'coinslot-__ID__',
    description: 'Open the __TITLE__ arcade game in a pane',
    opened: '__TITLE__ opened. Tap the arrow keys or WASD to steer; p pauses; esc returns to chat.',
  })
}
