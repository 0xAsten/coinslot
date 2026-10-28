import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

export const register: Register = on => {
  registerGamePane(on, {
    pane: 'fish-shooter',
    title: 'Fish Shooter',
    command: 'fish-shooter',
    description: 'Open the Fish Shooter arcade game in a pane',
  })
}
