import type { Register } from 'claude-code'

import { registerGamePane } from './shared/hooks-pane'

// Test host only: wires the shared pane and link hooks around the dummy game so tsc
// and the tests cover them.
export const register: Register = on => {
  registerGamePane(on, {
    pane: 'game',
    title: 'Shared tests',
    command: 'shared-tests',
    description: 'Test host for the shared game shell',
  })
}
