import { expect, test } from 'claude-code/testing'

import { LINK_INITIAL, onAsk, onResume, onToolCall, onTurnComplete, onTurnStart } from './link'

test('subagent end does not pause', () => {
  expect(onTurnComplete(LINK_INITIAL, 'a1').pause).toBe(null)
})

test('main end pauses done', () => {
  expect(onTurnComplete(LINK_INITIAL).pause).toBe('done')
})

test('needs-you outranks done', () => {
  expect(onTurnComplete(onAsk(LINK_INITIAL)).pause).toBe('needs-you')
  expect(onAsk(onTurnComplete(LINK_INITIAL)).pause).toBe('needs-you')
})

test('repeat end stays one pause', () => {
  expect(onTurnComplete(onTurnComplete(LINK_INITIAL)).pause).toBe('done')
})

test('tool call bumps bonus', () => {
  expect(onToolCall(LINK_INITIAL).bonusSeq).toBe(1)
  expect(onToolCall(onToolCall(LINK_INITIAL)).bonusSeq).toBe(2)
})

test('resume and new main turn clear pause', () => {
  const paused = onTurnComplete(LINK_INITIAL)
  expect(onResume(paused).pause).toBe(null)
  expect(onTurnStart(paused).pause).toBe(null)
})

test('subagent turn start keeps pause', () => {
  const paused = onTurnComplete(LINK_INITIAL)
  expect(onTurnStart(paused, 'a1').pause).toBe('done')
})

test('clearing a pause keeps the bonus counter', () => {
  const s = onToolCall(onTurnComplete(LINK_INITIAL))
  expect(onResume(s).bonusSeq).toBe(1)
})
