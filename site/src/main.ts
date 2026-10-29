import { createAudio } from './audio'
import { copyCommand } from './copy'
import { installCommand, PAGE_GAMES } from './games'
import { loadTile, TilePlayer } from './player'
import { moveSel, stickAngle, type Dir } from './wall-logic'

const audio = createAudio()
const wall = document.getElementById('wall') as HTMLElement
const grid = document.getElementById('grid') as HTMLElement
const shaft = document.getElementById('shaft') as HTMLElement
const stick = document.getElementById('stick') as HTMLElement
const muteBtn = document.getElementById('mute') as HTMLButtonElement

type Tile = { cell: HTMLElement; tile: HTMLElement; cmd: HTMLButtonElement; code: HTMLElement; timer: number }
const tiles: Tile[] = []
let sel = 0
let zoomed = -1

const narrow = () => matchMedia('(max-width: 640px)').matches
const cols = (): 2 | 3 => (narrow() ? 2 : 3)

function execCopy(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(ta)
  try {
    ta.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    ta.remove()
  }
}

function selectText(el: HTMLElement): void {
  const r = document.createRange()
  r.selectNodeContents(el)
  const s = getSelection()
  s?.removeAllRanges()
  s?.addRange(r)
}

function setIdle(t: Tile): void {
  t.cmd.replaceChildren('⧉ ', t.code)
}

function select(i: number, quiet = false): void {
  if (i === sel) return
  sel = i
  tiles.forEach((t, k) => t.tile.classList.toggle('on', k === sel))
  if (!quiet) audio.sfx('move')
}

// inset of the wall's content box relative to the cell, so the tile can grow over the wall
function fitInsets(t: Tile): void {
  const w = wall.getBoundingClientRect()
  const c = t.cell.getBoundingClientRect()
  const pad = parseFloat(getComputedStyle(wall).paddingLeft) || 0
  const s = t.tile.style
  s.left = `${Math.round(w.left + pad - c.left)}px`
  s.top = `${Math.round(w.top + pad - c.top)}px`
  s.right = `${Math.round(c.right - (w.right - pad))}px`
  s.bottom = `${Math.round(c.bottom - (w.bottom - pad))}px`
}

function zoom(i: number): void {
  if (zoomed >= 0) return
  const t = tiles[i]
  if (!t) return
  select(i, true)
  audio.sfx('zoom')
  const s = t.tile.style
  s.left = s.top = s.right = s.bottom = '0px'
  t.tile.classList.add('big')
  void t.tile.offsetWidth
  zoomed = i
  fitInsets(t)
}

function unzoom(): void {
  const t = tiles[zoomed]
  if (!t) return
  zoomed = -1
  audio.sfx('back')
  const s = t.tile.style
  s.left = s.top = s.right = s.bottom = '0px'
  setTimeout(() => {
    if (tiles[zoomed] === t) return
    t.tile.classList.remove('big')
    s.left = s.top = s.right = s.bottom = ''
  }, 500)
}

async function onCopy(t: Tile, id: string): Promise<void> {
  const ok = await copyCommand(installCommand(id), { clipboard: navigator.clipboard, execCopy })
  if (!ok) {
    selectText(t.code)
    return
  }
  audio.sfx('coin')
  t.cmd.textContent = '✓ Copied — paste into Claude Code'
  t.cmd.classList.add('done')
  const w = wall.getBoundingClientRect()
  const r = t.cmd.getBoundingClientRect()
  const coin = document.createElement('div')
  coin.className = 'coin'
  coin.textContent = '+1 CREDIT'
  coin.style.left = `${r.left - w.left + r.width / 2 - 40}px`
  coin.style.top = `${r.top - w.top - 10}px`
  wall.appendChild(coin)
  setTimeout(() => coin.remove(), 900)
  clearTimeout(t.timer)
  t.timer = window.setTimeout(() => {
    setIdle(t)
    t.cmd.classList.remove('done')
  }, 2000)
}

PAGE_GAMES.forEach((g, i) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  const tile = document.createElement('div')
  tile.className = 'tile' + (i === 0 ? ' on' : '')
  tile.tabIndex = -1
  const canvas = document.createElement('canvas')
  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = g.name
  const cmd = document.createElement('button')
  cmd.type = 'button'
  cmd.className = 'cmd'
  const code = document.createElement('code')
  code.textContent = installCommand(g.id)
  tile.append(canvas, name, cmd)
  cell.appendChild(tile)
  grid.appendChild(cell)
  const t: Tile = { cell, tile, cmd, code, timer: 0 }
  setIdle(t)
  tiles.push(t)

  cell.addEventListener('pointerenter', () => {
    if (zoomed < 0) select(i)
  })
  tile.addEventListener('click', e => {
    if (zoomed < 0) {
      select(i, true)
      zoom(i)
    } else if (zoomed === i && e.target !== cmd) unzoom()
  })
  cmd.addEventListener('click', e => {
    e.stopPropagation()
    void onCopy(t, g.id)
  })

  void loadTile(`loops/${g.id}.bin`).then(loop => {
    if (!loop) return
    try {
      new TilePlayer(canvas, loop).start()
    } catch {
      // no 2d context: the name stays on the dark tile
    }
  })
})

// joystick
let flick = 0
function tiltStick(dx: number, dy: number, k = 1): void {
  const { tilt, dir } = stickAngle(dx, dy)
  const x = Math.cos(dir) * tilt * k
  const y = Math.sin(dir) * tilt * k
  shaft.style.transform = `rotate(${(x * 30).toFixed(1)}deg) scaleY(${(1 - Math.abs(y) * 0.25).toFixed(2)})`
}
window.addEventListener('pointermove', e => {
  if (flick) return
  const r = stick.getBoundingClientRect()
  tiltStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
})
function flickStick(dir: Dir): void {
  const v: Record<Dir, [number, number]> = { up: [0, -160], down: [0, 160], left: [-160, 0], right: [160, 0] }
  tiltStick(...v[dir])
  clearTimeout(flick)
  flick = window.setTimeout(() => {
    flick = 0
    shaft.style.transform = ''
  }, 150)
}

// sound
const wake = () => audio.unlock()
for (const ev of ['pointerdown', 'keydown', 'click', 'touchend']) window.addEventListener(ev, wake, { passive: true })
muteBtn.addEventListener('click', e => {
  audio.unlock()
  audio.setMuted(!audio.muted())
  muteBtn.classList.toggle('off', audio.muted())
  muteBtn.setAttribute('aria-pressed', String(audio.muted()))
  if (e.detail > 0) muteBtn.blur()
})

const ARROWS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
const onControl = () => !!document.activeElement?.closest('a, button')
const wallInView = () => {
  const r = wall.getBoundingClientRect()
  const vis = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)
  return vis >= r.height / 2
}

window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape' && zoomed >= 0) {
    unzoom()
    return
  }
  if (e.key === 'Enter' && zoomed < 0 && !onControl() && wallInView()) {
    e.preventDefault()
    zoom(sel)
    return
  }
  const dir = ARROWS[e.key]
  if (!dir || zoomed >= 0 || onControl() || !wallInView()) return
  e.preventDefault()
  flickStick(dir)
  select(moveSel(sel, dir, cols()))
})

window.addEventListener('resize', () => {
  const t = tiles[zoomed]
  if (!t) return
  t.tile.classList.add('nomotion')
  fitInsets(t)
  void t.tile.offsetWidth
  t.tile.classList.remove('nomotion')
})
