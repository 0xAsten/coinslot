import { deflateSync } from 'node:zlib'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeLoop, type Loop } from '../site/src/loop-format'
import { glyphShape } from '../site/src/glyph'

const W = 1200
const H = 630
const BG = 0x070d16
const BAND = 0x0f1b2b
const GOLD = 0xffd61f

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  const dv = new DataView(ihdr.buffer)
  dv.setUint32(0, w)
  dv.setUint32(4, h)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = new Uint8Array(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const FONT: Record<string, string[]> = {
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
}

export function renderOgImage(loops: Loop[]): Uint8Array {
  const px = new Uint8Array(W * H * 4)
  const rect = (x: number, y: number, w: number, h: number, rgb: number) => {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
        const o = (j * W + i) * 4
        px[o] = rgb >> 16
        px[o + 1] = (rgb >> 8) & 255
        px[o + 2] = rgb & 255
        px[o + 3] = 255
      }
    }
  }
  rect(0, 0, W, H, BG)

  // title band
  const BAND_H = 110
  rect(0, 0, W, BAND_H, BAND)
  const S = 10
  const text = 'COIN SLOT'
  const tw = text.length * 6 * S - S
  let tx = Math.round((W - tw) / 2)
  for (const ch of text) {
    FONT[ch]?.forEach((row, ry) => {
      for (let rx = 0; rx < 5; rx++) if (row[rx] === '#') rect(tx + rx * S, 20 + ry * S, S, S, GOLD)
    })
    tx += 6 * S
  }

  // 3×2 grid of mid-loop frames
  const SC = 4
  const GAP = 16
  const first = loops[0]
  if (!first) return encodePng(W, H, px)
  const tileW = first.cols * SC
  const tileH = first.rows * 2 * SC
  const gx = Math.round((W - (3 * tileW + 2 * GAP)) / 2)
  const gy = BAND_H + Math.round((H - BAND_H - (2 * tileH + GAP)) / 2)
  loops.slice(0, 6).forEach((loop, n) => {
    const f = loop.frames[Math.floor(loop.frames.length / 2)]
    if (!f) return
    const ox = gx + (n % 3) * (tileW + GAP)
    const oy = gy + Math.floor(n / 3) * (tileH + GAP)
    for (let r = 0; r < f.rows; r++) {
      for (let c = 0; c < f.cols; c++) {
        const i = r * f.cols + c
        const fg = f.fg[i]!
        const bg = f.bg[i]!
        const shape = glyphShape(f.ch[i]!)
        const top = shape === 'full' || shape === 'top' ? fg : bg
        const bot = shape === 'full' || shape === 'bottom' ? fg : bg
        rect(ox + c * SC, oy + r * 2 * SC, SC, SC, top)
        rect(ox + c * SC, oy + (r * 2 + 1) * SC, SC, SC, bot)
      }
    }
  })
  return encodePng(W, H, px)
}

if (import.meta.main) {
  const [dir, out] = process.argv.slice(2)
  if (!dir || !out) throw new Error('usage: og-image.ts <loopsDir> <out.png>')
  const order: { id: string }[] = JSON.parse(readFileSync(join(dir, '..', 'games.json'), 'utf8'))
  const have = new Set(readdirSync(dir))
  const loops = order
    .filter((g) => have.has(`${g.id}.bin`))
    .slice(0, 6)
    .map((g) => decodeLoop(Bun.gunzipSync(readFileSync(join(dir, `${g.id}.bin`)))))
  writeFileSync(out, renderOgImage(loops))
}
