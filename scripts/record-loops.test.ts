import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { GAMES } from '../site/bots'
import { encodeLoop } from '../site/src/loop-format'
import { recordLoop } from './record-loops'

describe('recordLoop', () => {
  test('records 300 frames of 56×28', () => {
    const l = recordLoop(GAMES[0])
    expect(l.frames.length).toBe(300)
    expect(l.cols).toBe(56)
    expect(l.rows).toBe(28)
    expect(l.fps).toBe(30)
  })

  test('is deterministic', () => {
    for (const e of GAMES) {
      const a = encodeLoop(recordLoop(e))
      const b = encodeLoop(recordLoop(e))
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    }
  })

  test('masks colors', () => {
    for (const e of GAMES) {
      for (const f of recordLoop(e).frames) {
        for (const v of [...f.fg, ...f.bg]) expect(v & ~0xe0e0e0).toBe(0)
      }
    }
  })

  test('stays under budget', () => {
    for (const e of GAMES) {
      expect(Bun.gzipSync(encodeLoop(recordLoop(e))).length).toBeLessThanOrEqual(300 * 1024)
    }
  })

  test('mask matches the shell', () => {
    expect(readFileSync('shared/shell.tsx', 'utf8')).toContain('const COLOR_MASK = 0xe0e0e0')
  })
})
