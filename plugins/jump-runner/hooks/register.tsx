import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'jump-runner',
    title: 'Jump Runner',
    command: 'coinslot-jump-runner',
    description: 'Open the Jump Runner arcade game in a pane',
    opened: 'Jump Runner opened. Press space, up or click to jump; p pauses; esc returns to chat.',
  })
}
