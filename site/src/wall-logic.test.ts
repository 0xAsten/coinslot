import { expect, test } from 'bun:test'
import { moveSel, stickAngle } from './wall-logic'

test('moveSel wraps within rows and columns', () => {
  expect(moveSel(2, 'right', 3)).toBe(0)
  expect(moveSel(0, 'left', 3)).toBe(2)
  expect(moveSel(4, 'down', 3)).toBe(1)
  expect(moveSel(1, 'right', 2)).toBe(0)
  expect(moveSel(0, 'up', 2)).toBe(4)
  expect(moveSel(5, 'down', 2)).toBe(1)
})

test('moveSel always stays in 0..5', () => {
  for (const cols of [2, 3] as const)
    for (let s = 0; s < 6; s++)
      for (const d of ['up', 'down', 'left', 'right'] as const) {
        const r = moveSel(s, d, cols)
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(5)
      }
})

test('stickAngle tilt', () => {
  expect(stickAngle(0, 0).tilt).toBe(0)
  expect(stickAngle(400, 0).tilt).toBe(1)
  expect(stickAngle(0, 80).tilt).toBe(0.5)
})
