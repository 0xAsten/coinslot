import { expect, test } from 'bun:test'
import type { Cells } from '../../shared/cells'
import { decodeLoop, encodeLoop, LoopFormatError, type Loop } from './loop-format'

function blank(cols: number, rows: number): Cells {
  const n = cols * rows
  return { cols, rows, ch: Array(n).fill(' '), fg: Array(n).fill(0xffffff), bg: Array(n).fill(0) }
}

function clone(c: Cells): Cells {
  return { ...c, ch: [...c.ch], fg: [...c.fg], bg: [...c.bg] }
}

function threeFrames(): Loop {
  const f0 = blank(4, 2)
  const f1 = clone(f0)
  f1.ch[3] = '@'
  const f2 = clone(f1)
  f2.fg[5] = 0xff0000
  return { cols: 4, rows: 2, fps: 12, frames: [f0, f1, f2] }
}

test('round-trips three frames', () => {
  const l = threeFrames()
  expect(decodeLoop(encodeLoop(l))).toEqual(l)
})

test('stores only changed cells after frame 0', () => {
  const f = blank(56, 28)
  const l: Loop = { cols: 56, rows: 28, fps: 10, frames: [f, clone(f)] }
  const bytes = encodeLoop(l)
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true)
  const headerBytes = 4 + 4 + headerLen
  expect(bytes.length).toBeLessThanOrEqual(headerBytes + 2 + 56 * 28 * 8 + 2)
})

test('rejects bad magic', () => {
  expect(() => decodeLoop(new Uint8Array([1, 2, 3, 4]))).toThrow(LoopFormatError)
})

test('rejects a truncated buffer', () => {
  const bytes = encodeLoop(threeFrames())
  expect(() => decodeLoop(bytes.slice(0, bytes.length - 3))).toThrow(LoopFormatError)
})

test('rejects an out-of-range cellIndex', () => {
  const l = threeFrames()
  const bytes = encodeLoop(l)
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  const headerLen = dv.getUint32(4, true)
  // first change of frame 0: after header and its u16 changeCount
  dv.setUint16(8 + headerLen + 2, l.cols * l.rows, true)
  expect(() => decodeLoop(bytes)).toThrow(LoopFormatError)
})
