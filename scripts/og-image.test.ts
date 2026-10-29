import { describe, expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { encodePng, renderOgImage } from './og-image'
import type { Loop } from '../site/src/loop-format'

const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset).getUint32(o)

describe('encodePng', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255])
  const png = encodePng(2, 1, rgba)

  test('signature and IHDR size', () => {
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(u32(png, 16)).toBe(2)
    expect(u32(png, 20)).toBe(1)
  })

  test('IEND crc', () => {
    expect(u32(png, png.length - 4)).toBe(0xae426082)
  })

  test('IDAT inflates to filtered scanlines', () => {
    const len = u32(png, 33)
    expect(String.fromCharCode(...png.slice(37, 41))).toBe('IDAT')
    const raw = inflateSync(png.slice(41, 41 + len))
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255])
  })
})

describe('renderOgImage', () => {
  test('is 1200×630', () => {
    const cells = { cols: 2, rows: 1, ch: ['█', '▀'], fg: [0xff0000, 0x00ff00], bg: [0, 0] }
    const loop: Loop = { cols: 2, rows: 1, fps: 30, frames: [cells, cells] }
    const png = renderOgImage(Array(6).fill(loop))
    expect(u32(png, 16)).toBe(1200)
    expect(u32(png, 20)).toBe(630)
  })
})
