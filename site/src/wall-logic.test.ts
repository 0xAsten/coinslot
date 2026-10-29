import { expect, test } from 'bun:test'
import { moveSel, stickAngle } from './wall-logic'

test('moveSel wraps within rows and columns', () => {
  expect(moveSel(2, 'right', 3, 6)).toBe(0)
  expect(moveSel(0, 'left', 3, 6)).toBe(2)
  expect(moveSel(4, 'down', 3, 6)).toBe(1)
  expect(moveSel(1, 'right', 2, 6)).toBe(0)
  expect(moveSel(0, 'up', 2, 6)).toBe(4)
  expect(moveSel(5, 'down', 2, 6)).toBe(1)
})

test('moveSel handles a short last row', () => {
  expect(moveSel(6, 'right', 3, 7)).toBe(6)
  expect(moveSel(4, 'down', 3, 7)).toBe(1)
  expect(moveSel(0, 'down', 3, 7)).toBe(3)
  expect(moveSel(3, 'down', 3, 7)).toBe(6)
  expect(moveSel(6, 'down', 3, 7)).toBe(0)
  expect(moveSel(1, 'up', 2, 5)).toBe(3)
})

test('moveSel always stays in 0..count-1', () => {
  for (let count = 1; count <= 10; count++)
    for (const cols of [2, 3] as const)
      for (let s = 0; s < count; s++)
        for (const d of ['up', 'down', 'left', 'right'] as const) {
          const r = moveSel(s, d, cols, count)
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThanOrEqual(count - 1)
        }
})

test('stickAngle tilt', () => {
  expect(stickAngle(0, 0).tilt).toBe(0)
  expect(stickAngle(400, 0).tilt).toBe(1)
  expect(stickAngle(0, 80).tilt).toBe(0.5)
})
