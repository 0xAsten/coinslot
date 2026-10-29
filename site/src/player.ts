import type { Cells } from '../../shared/cells'
import { glyphShape } from './glyph'
import { decodeLoop, type Loop } from './loop-format'

const FONT = 'JetBrains Mono, ui-monospace, monospace'

function css(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}

export async function loadTile(url: string): Promise<Loop | null> {
  try {
    const res = await fetch(url)
    if (!res.ok || !res.body) return null
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'))
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    return decodeLoop(bytes)
  } catch {
    return null
  }
}

export class TilePlayer {
  private ctx: CanvasRenderingContext2D
  private raf = 0
  private t0 = 0
  private drawn: Cells | null = null
  private lastIdx = -1

  constructor(private canvas: HTMLCanvasElement, private loop: Loop) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
  }

  start(): void {
    if (this.raf) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.showFrame(0)
      return
    }
    this.t0 = performance.now()
    const tick = (now: number) => {
      const i = Math.floor(((now - this.t0) / 1000) * this.loop.fps) % this.loop.frames.length
      if (i !== this.lastIdx) this.showFrame(i)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  showFrame(i: number): void {
    const frame = this.loop.frames[i]
    if (!frame) return
    const { canvas, ctx, loop } = this
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    let full = false
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      full = true
    }
    // contain: square-ish cells scaled to fit, centred
    const cw = Math.min(w / loop.cols, h / loop.rows / 2)
    const ch = cw * 2
    const ox = (w - cw * loop.cols) / 2
    const oy = (h - ch * loop.rows) / 2
    if (full || !this.drawn) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }
    const prev = full ? null : this.drawn
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.font = `${ch}px ${FONT}`
    for (let k = 0; k < loop.cols * loop.rows; k++) {
      const c = frame.ch[k] ?? ' '
      const fg = frame.fg[k] ?? 0xffffff
      const bg = frame.bg[k] ?? 0
      if (prev && prev.ch[k] === c && prev.fg[k] === fg && prev.bg[k] === bg) continue
      const x = ox + (k % loop.cols) * cw
      const y = oy + Math.floor(k / loop.cols) * ch
      ctx.fillStyle = css(bg)
      ctx.fillRect(x, y, Math.ceil(cw), Math.ceil(ch))
      const shape = glyphShape(c)
      if (shape === 'space') continue
      ctx.fillStyle = css(fg)
      if (shape === 'full') ctx.fillRect(x, y, Math.ceil(cw), Math.ceil(ch))
      else if (shape === 'top') ctx.fillRect(x, y, Math.ceil(cw), Math.ceil(ch / 2))
      else if (shape === 'bottom') ctx.fillRect(x, y + ch / 2, Math.ceil(cw), Math.ceil(ch / 2))
      else ctx.fillText(c, x + cw / 2, y + ch / 2)
    }
    this.drawn = frame
    this.lastIdx = i
  }
}
