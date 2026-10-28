import { expect, test } from 'claude-code/testing'

import { GATE_INITIAL, gateStep } from './focus-gate'

test('click on an unfocused-pane client starts play', () => {
  let r = gateStep(GATE_INITIAL, { focused: false, paused: false, touched: false })
  expect(r.active).toBe(false)
  r = gateStep(r.gate, { focused: false, paused: false, touched: true })
  expect(r.active).toBe(true)
  r = gateStep(r.gate, { focused: false, paused: false, touched: false })
  expect(r.active).toBe(true)
})

test('a pause ends the engagement and a click while paused does not restart it', () => {
  let r = gateStep(GATE_INITIAL, { focused: false, paused: false, touched: true })
  r = gateStep(r.gate, { focused: false, paused: true, touched: true })
  expect(r.active).toBe(false)
  r = gateStep(r.gate, { focused: false, paused: false, touched: false })
  expect(r.active).toBe(false)
})

test('pane focus plays without a click, and regaining it resets the engagement', () => {
  let r = gateStep(GATE_INITIAL, { focused: true, paused: false, touched: false })
  expect(r.active).toBe(true)
  r = gateStep(r.gate, { focused: false, paused: false, touched: true })
  expect(r.active).toBe(true)
  r = gateStep(r.gate, { focused: true, paused: false, touched: false })
  r = gateStep(r.gate, { focused: false, paused: false, touched: false })
  expect(r.active).toBe(false)
})
