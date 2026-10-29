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
  private ro: ResizeObserver | null = null

  constructor(private canvas: HTMLCanvasElement, private loop: Loop) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    this.ctx = ctx
  }

  start(): void {
    if (this.raf || this.ro) return
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize())
      this.ro.observe(this.canvas)
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.showFrame(0)
      return
    }
    this.t0 = performance.now()
    const tick = (now: number) => {
      const n = this.loop.frames.length
      const i = Math.max(0, Math.floor(((now - this.t0) / 1000) * this.loop.fps)) % n
      if (i !== this.lastIdx) this.showFrame(i)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.ro?.disconnect()
    this.ro = null
  }

  // layout changed: repaint the current frame in full
  resize(): void {
    this.drawn = null
    this.showFrame(Math.max(this.lastIdx, 0))
  }

  showFrame(i: number): void {
    const frame = this.loop.frames[i]
    if (!frame) return
    const { canvas, ctx, loop } = this
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      this.drawn = null
    }
    // contain: 1:2 cells scaled to fit, centred
    const cw = Math.min(w / loop.cols, h / loop.rows / 2)
    const ch = cw * 2
    const ox = (w - cw * loop.cols) / 2
    const oy = (h - ch * loop.rows) / 2
    if (!this.drawn) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }
    const prev = this.drawn
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.font = `${Math.min(ch, cw / 0.6)}px ${FONT}`
    for (let k = 0; k < loop.cols * loop.rows; k++) {
      const c = frame.ch[k] ?? ' '
      const fg = frame.fg[k] ?? 0xffffff
      const bg = frame.bg[k] ?? 0
      if (prev && prev.ch[k] === c && prev.fg[k] === fg && prev.bg[k] === bg) continue
      const col = k % loop.cols
      const row = Math.floor(k / loop.cols)
      const x0 = Math.round(ox + col * cw)
      const x1 = Math.round(ox + (col + 1) * cw)
      const y0 = Math.round(oy + row * ch)
      const y1 = Math.round(oy + (row + 1) * ch)
      const ym = Math.round(y0 + (y1 - y0) / 2)
      ctx.fillStyle = css(bg)
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      const shape = glyphShape(c)
      if (shape === 'space') continue
      ctx.fillStyle = css(fg)
      if (shape === 'full') ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
      else if (shape === 'top') ctx.fillRect(x0, y0, x1 - x0, ym - y0)
      else if (shape === 'bottom') ctx.fillRect(x0, ym, x1 - x0, y1 - ym)
      else {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0, y0, x1 - x0, y1 - y0)
        ctx.clip()
        ctx.fillText(c, (x0 + x1) / 2, (y0 + y1) / 2)
        ctx.restore()
      }
    }
    this.drawn = frame
    this.lastIdx = i
  }
}
