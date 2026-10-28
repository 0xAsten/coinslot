import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'tap-flyer',
    title: 'Tap Flyer',
    command: 'coinslot-tap-flyer',
    description: 'Open the Tap Flyer arcade game in a pane',
    opened: 'Tap Flyer opened. Press any key or click to flap; p pauses; esc returns to chat.',
  })
}
