import type { Cells } from '../../shared/cells'

export type Loop = { cols: number; rows: number; fps: number; frames: Cells[] }

export class LoopFormatError extends Error {}

const MAGIC = 'CSL1'

type Header = { cols: number; rows: number; fps: number; frames: number; palette: number[]; glyphs: string[] }

function intern<T>(table: T[], index: Map<T, number>, v: T): number {
  let i = index.get(v)
  if (i === undefined) {
    i = table.length
    table.push(v)
    index.set(v, i)
  }
  return i
}

export function encodeLoop(loop: Loop): Uint8Array {
  const palette: number[] = []
  const glyphs: string[] = []
  const pIdx = new Map<number, number>()
  const gIdx = new Map<string, number>()
  const n = loop.cols * loop.rows
  const chunks: Uint8Array[] = []
  let prev: Cells | null = null
  for (const f of loop.frames) {
    const rec: number[] = []
    for (let i = 0; i < n; i++) {
      const ch = f.ch[i] ?? ' '
      const fg = f.fg[i] ?? 0xffffff
      const bg = f.bg[i] ?? 0
      if (prev && (prev.ch[i] ?? ' ') === ch && (prev.fg[i] ?? 0xffffff) === fg && (prev.bg[i] ?? 0) === bg) continue
      rec.push(i, intern(glyphs, gIdx, ch), intern(palette, pIdx, fg), intern(palette, pIdx, bg))
    }
    const buf = new Uint8Array(2 + rec.length * 2)
    const dv = new DataView(buf.buffer)
    dv.setUint16(0, rec.length / 4, true)
    rec.forEach((v, k) => dv.setUint16(2 + k * 2, v, true))
    chunks.push(buf)
    prev = f
  }
  const header: Header = { cols: loop.cols, rows: loop.rows, fps: loop.fps, frames: loop.frames.length, palette, glyphs }
  const hb = new TextEncoder().encode(JSON.stringify(header))
  const total = 8 + hb.length + chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  out.set(new TextEncoder().encode(MAGIC), 0)
  new DataView(out.buffer).setUint32(4, hb.length, true)
  out.set(hb, 8)
  let off = 8 + hb.length
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function isNumArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number')
}

export function decodeLoop(bytes: Uint8Array): Loop {
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) {
    throw new LoopFormatError('bad magic')
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLen = dv.getUint32(4, true)
  if (8 + headerLen > bytes.length) throw new LoopFormatError('truncated header')
  let h: Header
  try {
    h = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLen)))
  } catch {
    throw new LoopFormatError('bad header')
  }
  if (
    !h || !Number.isInteger(h.cols) || !Number.isInteger(h.rows) || h.cols < 0 || h.rows < 0 ||
    typeof h.fps !== 'number' || !Number.isInteger(h.frames) || h.frames < 0 ||
    !isNumArray(h.palette) || !Array.isArray(h.glyphs) || !h.glyphs.every((g) => typeof g === 'string')
  ) {
    throw new LoopFormatError('bad header')
  }
  const n = h.cols * h.rows
  let off = 8 + headerLen
  const need = (len: number) => {
    if (off + len > bytes.length) throw new LoopFormatError('truncated buffer')
  }
  const frames: Cells[] = []
  let cur: Cells = { cols: h.cols, rows: h.rows, ch: Array(n).fill(' '), fg: Array(n).fill(0xffffff), bg: Array(n).fill(0) }
  for (let f = 0; f < h.frames; f++) {
    need(2)
    const count = dv.getUint16(off, true)
    off += 2
    need(count * 8)
    cur = { cols: h.cols, rows: h.rows, ch: [...cur.ch], fg: [...cur.fg], bg: [...cur.bg] }
    for (let k = 0; k < count; k++) {
      const cell = dv.getUint16(off, true)
      const g = h.glyphs[dv.getUint16(off + 2, true)]
      const fg = h.palette[dv.getUint16(off + 4, true)]
      const bg = h.palette[dv.getUint16(off + 6, true)]
      off += 8
      if (cell >= n) throw new LoopFormatError('cellIndex out of range')
      if (g === undefined || fg === undefined || bg === undefined) throw new LoopFormatError('index out of range')
      cur.ch[cell] = g
      cur.fg[cell] = fg
      cur.bg[cell] = bg
    }
    frames.push(cur)
  }
  return { cols: h.cols, rows: h.rows, fps: h.fps, frames }
}
