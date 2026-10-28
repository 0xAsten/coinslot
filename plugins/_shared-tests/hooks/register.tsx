import type { Register } from 'claude-code'

import { registerClaudeLink } from './shared/hooks-link'

// Test host only: wires the shared link hooks so tsc and the tests cover them.
export const register: Register = on => {
  registerClaudeLink(on, { title: 'Shared tests', paneId: 'game' })
}
