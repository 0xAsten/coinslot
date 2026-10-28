import { expect, test } from 'claude-code/testing'

import { registerClaudeLink } from './hooks-link'
import type { LinkState } from './link'

test('AskUserQuestion counts as a tool call and pauses nothing', async ($, on) => {
  let stored: { value: unknown; version: number } = { value: undefined, version: 0 }
  // writes arrive tagged `{ shape, value }`
  const held = () => (stored.value as { value: LinkState }).value
  on('state.get', () => ({ value: stored }))
  on('state.set', (_, e) => {
    stored = { value: e.value, version: stored.version + 1 }

    return { value: { isSet: true, version: stored.version } }
  })
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({ tool: 'AskUserQuestion', questions: [], agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const sub = held()
  expect(sub.pause).toBe(null)
  expect(sub.bonusSeq).toBe(2)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  const main = held()
  expect(main.pause).toBe(null)
  expect(main.bonusSeq).toBe(3)
})
