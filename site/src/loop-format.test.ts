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

function withHeader(bytes: Uint8Array, mutate: (h: Record<string, unknown>) => void): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset)
  const hl = dv.getUint32(4, true)
  const h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hl)))
  mutate(h)
  const hb = new TextEncoder().encode(JSON.stringify(h))
  const rest = bytes.subarray(8 + hl)
  const out = new Uint8Array(8 + hb.length + rest.length)
  out.set(bytes.subarray(0, 4), 0)
  new DataView(out.buffer).setUint32(4, hb.length, true)
  out.set(hb, 8)
  out.set(rest, 8 + hb.length)
  return out
}

test('rejects invalid header JSON', () => {
  const b = new Uint8Array(12)
  b.set(new TextEncoder().encode('CSL1'), 0)
  new DataView(b.buffer).setUint32(4, 4, true)
  b.set(new TextEncoder().encode('nope'), 8)
  expect(() => decodeLoop(b)).toThrow(LoopFormatError)
})

test('rejects a wrong-typed header field', () => {
  const b = withHeader(encodeLoop(threeFrames()), (h) => { h.fps = 'fast' })
  expect(() => decodeLoop(b)).toThrow(LoopFormatError)
})

test('rejects an out-of-range glyph index', () => {
  const b = encodeLoop(threeFrames())
  const dv = new DataView(b.buffer, b.byteOffset)
  dv.setUint16(8 + dv.getUint32(4, true) + 2 + 2, 999, true)
  expect(() => decodeLoop(b)).toThrow(LoopFormatError)
})

test('rejects an out-of-range palette index', () => {
  const b = encodeLoop(threeFrames())
  const dv = new DataView(b.buffer, b.byteOffset)
  dv.setUint16(8 + dv.getUint32(4, true) + 2 + 4, 999, true)
  expect(() => decodeLoop(b)).toThrow(LoopFormatError)
})

test('rejects trailing bytes', () => {
  const b = encodeLoop(threeFrames())
  const x = new Uint8Array(b.length + 1)
  x.set(b)
  expect(() => decodeLoop(x)).toThrow(LoopFormatError)
})

test('rejects huge dimensions', () => {
  for (const [cols, rows] of [[65535, 65535], [1e9, 1]]) {
    const b = withHeader(encodeLoop(threeFrames()), (h) => { h.cols = cols; h.rows = rows })
    expect(() => decodeLoop(b)).toThrow(LoopFormatError)
  }
})
