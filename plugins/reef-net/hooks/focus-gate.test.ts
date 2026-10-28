import { expect, test } from 'claude-code/testing'

import { GATE_INITIAL, gateStep, TOUCH_GRACE_TICKS } from './focus-gate'
import type { Gate } from './focus-gate'

const tick = (g: Gate, focused: boolean, touched = false, paused = false) =>
  gateStep(g, { focused, paused, touched })

test('click on an unfocused-pane client starts play', () => {
  let r = tick(GATE_INITIAL, false)
  expect(r.active).toBe(false)
  r = tick(r.gate, false, true)
  expect(r.active).toBe(true)
  r = tick(r.gate, false)
  expect(r.active).toBe(true)
})

test('a click that makes the pane lose focus keeps playing, in either order', () => {
  // focused pane, then click: the pane flag drops on the same tick or a few later
  let r = tick(GATE_INITIAL, true)
  r = tick(r.gate, false, true)
  expect(r.active).toBe(true)

  r = tick(GATE_INITIAL, true)
  r = tick(r.gate, true, true)
  for (let k = 0; k < 3; k += 1) r = tick(r.gate, true)
  r = tick(r.gate, false)
  expect(r.active).toBe(true)
  for (let k = 0; k < 100; k += 1) r = tick(r.gate, false)
  expect(r.active).toBe(true)
})

test('the pane losing focus with no recent client input stops play', () => {
  let r = tick(GATE_INITIAL, true)
  for (let k = 0; k < TOUCH_GRACE_TICKS + 2; k += 1) r = tick(r.gate, true)
  r = tick(r.gate, false)
  expect(r.active).toBe(false)
})

test('a pause ends the engagement and a click while paused does not restart it', () => {
  let r = tick(GATE_INITIAL, false, true)
  r = tick(r.gate, false, true, true)
  expect(r.active).toBe(false)
  r = tick(r.gate, false)
  expect(r.active).toBe(false)
})
