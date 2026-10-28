import { expect, test } from 'claude-code/testing'

import { parseSave } from './save-store'
import { newGame, step } from './sim'

const good = () => ({ v: 1, g: JSON.parse(JSON.stringify(newGame(60, 30, 4))) as Record<string, unknown> })
const withG = (patch: Record<string, unknown>) => {
  const s = good()

  return { v: s.v, g: { ...s.g, ...patch } }
}

test('a real run is accepted and still steps', () => {
  let g = newGame(60, 30, 4)
  for (let i = 0; i < 200; i += 1) g = step(g, 1 / 60, {})
  const s = parseSave({ v: 1, g: JSON.parse(JSON.stringify(g)) })
  expect(s).not.toBeNull()
  const next = step((s as unknown as { g: ReturnType<typeof newGame> }).g, 1 / 60, {})
  expect(next.t).toBeGreaterThan(g.t)
  expect(parseSave(good())).not.toBeNull()
})

test('a malformed save is rejected so the game starts fresh', () => {
  for (const patch of [
    { obstacles: [null] },
    { obstacles: [5] },
    { obstacles: [{ kind: 'block', x: 1, w: 3, h: 'a' }] },
    { obstacles: [{ kind: 'block', x: 1, w: 3 }] },
    { obstacles: [{ kind: 'wall', x: 1, w: 3, h: 3 }] },
    { obstacles: [{ kind: 'block', x: Infinity, w: 3, h: 3 }] },
    { bonuses: [null] },
    { bonuses: [{ x: 1 }] },
    { bonuses: [{ x: NaN, y: 2 }] },
    { fx: 'a' },
    { fx: null },
    { speed: undefined },
    { speed: 'fast' },
    { dist: NaN },
    { nextX: undefined },
    { jumps: 'x' },
    { bonusPts: null },
    { overT: undefined },
    { over: 'no' },
  ]) {
    expect(parseSave(withG(patch))).toBeNull()
  }
  expect(parseSave(null)).toBeNull()
  expect(parseSave({ v: 1, g: 3 })).toBeNull()
})
