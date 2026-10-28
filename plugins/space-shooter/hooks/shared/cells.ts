export type Cells = { cols: number; rows: number; ch: string[]; fg: number[]; bg: number[] }
export type Run = { text: string; fg: number; bg: number }

export function toRuns(c: Cells): Run[][] {
  const out: Run[][] = []
  for (let r = 0; r < c.rows; r++) {
    const row: Run[] = []
    for (let x = 0; x < c.cols; x++) {
      const i = r * c.cols + x
      const ch = c.ch[i] ?? ' '
      const fg = c.fg[i] ?? 0xffffff
      const bg = c.bg[i] ?? 0
      const last = row[row.length - 1]
      if (last && last.fg === fg && last.bg === bg) last.text += ch
      else row.push({ text: ch, fg, bg })
    }
    out.push(row)
  }
  return out
}

export function hex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}
