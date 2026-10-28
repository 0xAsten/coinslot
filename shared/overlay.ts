import type { Cells } from './cells'
import type { Pause } from './link'

const BANNER_BG = 0x0b1d26
const BANNER_FG = 0xffd61f

const COPY: Record<Exclude<Pause, null>, string> = {
  done: 'CLAUDE IS DONE · ESC TO RETURN',
  'needs-you': 'CLAUDE NEEDS YOU · ESC TO RETURN',
}

function clone(c: Cells): Cells {
  return { cols: c.cols, rows: c.rows, ch: [...c.ch], fg: [...c.fg], bg: [...c.bg] }
}

function writeCentered(c: Cells, row: number, text: string, fg: number, bg: number): void {
  const shown = text.slice(0, c.cols)
  const start = Math.floor((c.cols - shown.length) / 2)
  for (let x = 0; x < c.cols; x++) {
    const i = row * c.cols + x
    const k = x - start
    c.ch[i] = k >= 0 && k < shown.length ? shown[k]! : ' '
    c.fg[i] = fg
    c.bg[i] = bg
  }
}

// A banner over the middle row, one padded row above and below; the grid is copied.
export function drawOverlay(c: Cells, reason: Exclude<Pause, null>): Cells {
  const out = clone(c)
  if (out.cols <= 0 || out.rows <= 0) return out
  const mid = Math.floor(out.rows / 2)
  for (const r of [mid - 1, mid + 1]) {
    if (r >= 0 && r < out.rows) writeCentered(out, r, '', BANNER_FG, BANNER_BG)
  }
  writeCentered(out, mid, COPY[reason], BANNER_FG, BANNER_BG)
  return out
}

export function drawSizeNotice(cols: number, rows: number): Cells {
  const n = Math.max(0, cols) * Math.max(0, rows)
  const out: Cells = {
    cols: Math.max(0, cols),
    rows: Math.max(0, rows),
    ch: Array(n).fill(' '),
    fg: Array(n).fill(BANNER_FG),
    bg: Array(n).fill(BANNER_BG),
  }
  if (out.cols > 0 && out.rows > 0) {
    const copy = 'Make the terminal wider or taller (40×10)'
    const now = `now ${cols}×${rows}`
    const mid = Math.floor(out.rows / 2)
    if (`${copy} · ${now}`.length <= out.cols) {
      writeCentered(out, mid, `${copy} · ${now}`, BANNER_FG, BANNER_BG)
    } else {
      // too narrow for one line: the size goes on the row below
      writeCentered(out, mid, copy, BANNER_FG, BANNER_BG)
      if (mid + 1 < out.rows) writeCentered(out, mid + 1, now, BANNER_FG, BANNER_BG)
    }
  }
  return out
}
