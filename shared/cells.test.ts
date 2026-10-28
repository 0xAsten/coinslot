import { expect, test } from 'claude-code/testing'

import { toRuns, type Cells } from './cells'
import { drawOverlay, drawSizeNotice } from './overlay'

function blank(cols: number, rows: number): Cells {
  const n = cols * rows
  return { cols, rows, ch: Array(n).fill(' '), fg: Array(n).fill(0xffffff), bg: Array(n).fill(0) }
}

function rowText(c: Cells, r: number): string {
  return c.ch.slice(r * c.cols, (r + 1) * c.cols).join('')
}

test('toRuns merges equal neighbours', () => {
  const c = blank(3, 1)
  c.ch = ['x', 'x', 'y']
  c.fg = [0xff0000, 0xff0000, 0x00ff00]
  const runs = toRuns(c)
  expect(runs.length).toBe(1)
  expect(runs[0]!.length).toBe(2)
  expect(runs[0]!.map(r => r.text)).toEqual(['xx', 'y'])
})

test('drawOverlay centers the done copy', () => {
  const c = blank(60, 11)
  const out = drawOverlay(c, 'done')
  expect(rowText(out, Math.floor(11 / 2))).toContain('CLAUDE IS DONE · ESC TO RETURN')
  expect(rowText(c, 5).trim()).toBe('')
})

test('drawOverlay shows the needs-you copy', () => {
  const out = drawOverlay(blank(60, 11), 'needs-you')
  expect(rowText(out, 5)).toContain('CLAUDE NEEDS YOU · ESC TO RETURN')
})

test('overlay on a 20-col grid truncates without throwing', () => {
  const out = drawOverlay(blank(20, 5), 'done')
  expect(out.cols).toBe(20)
  expect(out.ch.length).toBe(100)
})

test('drawSizeNotice fills the requested grid', () => {
  const out = drawSizeNotice(60, 6)
  expect(out.ch.length).toBe(360)
  expect(out.ch.join('')).toContain('Make the terminal wider or taller (60×16).')
})
