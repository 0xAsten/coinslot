import { expect, test } from 'claude-code/testing'

import type { LinkState } from './link'

type Wired = { held: () => LinkState; notes: string[] }

// The host plugin registers the shared hooks (paneId 'game' here). State is an
// in-memory store; writes arrive tagged `{ shape, value }`.
function wire(on: (event: any, fn: (...a: any[]) => any) => void, open: boolean): Wired {
  let stored: { value: unknown; version: number } = { value: undefined, version: 0 }
  const notes: string[] = []
  on('state.get', () => ({ value: stored }))
  on('state.set', (_: unknown, e: { value: unknown }) => {
    stored = { value: e.value, version: stored.version + 1 }

    return { value: { isSet: true, version: stored.version } }
  })
  on('ui.panes', () => ({
    // the host registers paneId 'game'; reef-net's bundled copy runs it as 'reef-net'
    value: open
      ? ['game', 'reef-net'].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true }))
      : [],
  }))
  on('ui.notify', (_: unknown, e: { text: string }) => {
    notes.push(e.text)

    return { value: { isSent: true } }
  })
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))

  return { held: () => (stored.value as { value: LinkState } | undefined)?.value ?? { pause: null, bonusSeq: 0 }, notes }
}

const end = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('AskUserQuestion counts as a tool call and pauses nothing', async ($, on) => {
  const w = wire(on, true)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [], agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(w.held().pause).toBe(null)
  expect(w.held().bonusSeq).toBe(2)

  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  expect(w.held().pause).toBe(null)
  expect(w.held().bonusSeq).toBe(3)
})

test('no pause or notify when the pane is closed', async ($, on) => {
  const w = wire(on, false)
  await $.turn.complete(end)
  expect(w.held().pause).toBe(null)
  expect(w.notes).toEqual([])
})

test('subagent turn end does not pause', async ($, on) => {
  const w = wire(on, true)
  await $.turn.complete({ ...end, agentId: 'a1' })
  expect(w.held().pause).toBe(null)
  expect(w.notes).toEqual([])
})

test('main turn end pauses when the pane is open', async ($, on) => {
  const w = wire(on, true)
  await $.turn.complete(end)
  expect(w.held().pause).toBe('done')
  expect(w.notes).toEqual(['Claude is done'])

  // a second end while already paused does not notify again
  await $.turn.complete(end)
  expect(w.notes.length).toBe(1)
})

test('a new main turn clears the pause', async ($, on) => {
  const w = wire(on, true)
  await $.turn.complete(end)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  expect(w.held().pause).toBe(null)
})
