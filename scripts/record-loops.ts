import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Cells } from '../shared/cells'
import { GAMES, type GameEntry } from '../site/bots'
import { encodeLoop, type Loop } from '../site/src/loop-format'

// mirrors shared/shell.tsx (guarded by a test)
export const COLOR_MASK = 0xe0e0e0
export const REC_COLS = 56
export const REC_ROWS = 28
export const REC_FPS = 30
export const REC_SECONDS = 10

const mask = (c: Cells): Cells => ({ ...c, fg: c.fg.map(v => v & COLOR_MASK), bg: c.bg.map(v => v & COLOR_MASK) })

export function recordLoop(entry: GameEntry): Loop {
  const dt = 1 / REC_FPS
  let g = entry.start(REC_COLS, REC_ROWS * 2, entry.seed)
  for (let i = 0; i < Math.round(entry.warmupS * REC_FPS); i++) g = entry.tick(g, dt)
  const frames: Cells[] = []
  for (let i = 0; i < REC_FPS * REC_SECONDS; i++) {
    g = entry.tick(g, dt)
    frames.push(mask(entry.render(g)))
  }
  return { cols: REC_COLS, rows: REC_ROWS, fps: REC_FPS, frames }
}

if (import.meta.main) {
  const out = process.argv[2]
  if (!out) {
    console.error('usage: bun scripts/record-loops.ts <outDir>')
    process.exit(1)
  }
  mkdirSync(out, { recursive: true })
  for (const e of GAMES) {
    const loop = recordLoop(e)
    const bytes = Bun.gzipSync(new Uint8Array(encodeLoop(loop)))
    writeFileSync(join(out, `${e.id}.bin`), bytes)
    console.log(`${e.id}  ${loop.frames.length}  ${bytes.length}`)
  }
}
