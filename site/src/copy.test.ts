import { expect, test } from 'bun:test'
import { copyCommand } from './copy'

test('clipboard success skips execCopy', async () => {
  let called = false
  const ok = await copyCommand('x', {
    clipboard: { writeText: async () => {} },
    execCopy: () => ((called = true), true),
  })
  expect(ok).toBe(true)
  expect(called).toBe(false)
})

test('falls back to execCopy when clipboard rejects', async () => {
  const ok = await copyCommand('x', {
    clipboard: { writeText: () => Promise.reject(new Error('no')) },
    execCopy: () => true,
  })
  expect(ok).toBe(true)
})

test('false when no clipboard and execCopy fails', async () => {
  expect(await copyCommand('x', { execCopy: () => false })).toBe(false)
})
