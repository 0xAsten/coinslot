import { expect, test } from 'claude-code/testing'

import { parseSave } from './save-store'
import { newGame, step } from './sim'

const good = () => ({ v: 1, g: JSON.parse(JSON.stringify(newGame(60, 30, 4))) as Record<string, unknown> })
const withG = (patch: Record<string, unknown>) => {
  const s = good()

  return { v: s.v, g: { ...s.g, ...patch } }
}

test('a real run is accepted and still steps', () => {
  const s = parseSave(good())
  expect(s).not.toBeNull()
  const g = step((s as unknown as { g: ReturnType<typeof newGame> }).g, 1 / 60, {})
  expect(g.over).toBe(false)
})

test('a malformed save is rejected so the game starts fresh', () => {
  for (const patch of [
    { obstacles: [null] },
    { obstacles: [5] },
    { obstacles: [{ x: 1, gapY: 2, gapH: 'a', scored: false }] },
    { obstacles: [{ x: 1, gapY: 2, gapH: 3 }] },
    { bonuses: [null] },
    { bonuses: [{ x: 1 }] },
    { fx: 'a' },
    { fx: null },
    { overT: undefined },
    { over: 'no' },
  ]) {
    expect(parseSave(withG(patch))).toBeNull()
  }
  expect(parseSave(null)).toBeNull()
  expect(parseSave({ v: 1, g: 3 })).toBeNull()
})
