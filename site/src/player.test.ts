import { afterEach, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { encodeLoop, type Loop } from './loop-format'
import { loadTile } from './player'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stub(res: Response) {
  globalThis.fetch = (async () => res) as unknown as typeof fetch
}

test('loadTile returns null on 404 and on corrupt bytes', async () => {
  stub(new Response('nope', { status: 404 }))
  expect(await loadTile('/x.bin')).toBeNull()

  stub(new Response(gzipSync(Buffer.from([1, 2, 3, 250, 99]))))
  expect(await loadTile('/x.bin')).toBeNull()

  const n = 4
  const loop: Loop = {
    cols: 2,
    rows: 2,
    fps: 10,
    frames: [{ cols: 2, rows: 2, ch: Array(n).fill(' '), fg: Array(n).fill(0xffffff), bg: Array(n).fill(0) }],
  }
  stub(new Response(gzipSync(encodeLoop(loop))))
  const got = await loadTile('/x.bin')
  expect(got?.cols).toBe(2)
  expect(got?.frames.length).toBe(1)
})
