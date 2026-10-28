// Pure game logic for space-shooter. No clock, no I/O: `step` is deterministic
// given the state (the RNG seed lives inside it) and the input. Plain JSON state.

export type EnemyKind = 'drone' | 'wavey' | 'tank' | 'gunner' | 'boss'
export type Enemy = {
  kind: EnemyKind
  x: number
  y: number
  y0: number
  vx: number
  hp: number
  maxHp: number
  w: number
  h: number
  ph: number
  fireT: number
  hitT: number
}
export type Shot = { x: number; y: number; vx: number; vy: number }
export type Bullet = { x: number; y: number; vx: number; vy: number }
export type PodKind = 'weapon' | 'shield'
export type Pod = { x: number; y: number; kind: PodKind }
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number }

export type Game = {
  // Field size in pixels: w = columns, h = rows * 2 (half-block cells).
  w: number
  h: number
  seed: number
  t: number
  score: number
  lives: number
  wave: number
  // enemies still to enter this wave, and the countdown to the next one
  toSpawn: number
  spawnT: number
  // seconds left of the WAVE banner; nothing spawns while it shows
  gapT: number
  over: boolean
  overT: number
  ship: { x: number; y: number }
  aim: { x: number; y: number } | null
  weapon: number
  fireT: number
  volleys: number
  fired: number
  shield: boolean
  // seconds of invulnerability left
  inv: number
  shots: Shot[]
  enemies: Enemy[]
  bullets: Bullet[]
  pods: Pod[]
  particles: Particle[]
}

export type Input = {
  // pointer target in pixels
  aimTo?: { x: number; y: number }
  dx?: number
  dy?: number
  // any key or click: only used to leave the game-over screen
  any?: boolean
}

export const LIVES = 3
export const MAX_WEAPON = 3
export const MAX_PODS = 2
export const MAX_BULLETS = 40
export const MAX_PARTICLES = 80
export const INVULN_S = 2
export const SHIELD_INVULN_S = 1
export const RESTART_AFTER_S = 0.5
export const WAVE_GAP_S = 1.6
// seconds between volleys at weapon level 1..3
export const FIRE_S = [0.28, 0.22, 0.18]
export const HUD_PX = 2
export const SHIP_W = 7
export const SHIP_H = 3
export const NUDGE = 3
export const BOSS_EVERY = 5
export const BOSS_HP = (wave: number): number => 24 + 8 * (Math.floor(wave / BOSS_EVERY) - 1)

const SHIP_SPEED = 70
const SHOT_SPEED = 90
const BULLET_SPEED = 32
const POD_SPEED = 12
const SHIP_MIN_Y = HUD_PX + 3
const PARTICLE_GRAVITY = 0

const KINDS: Record<Exclude<EnemyKind, 'boss'>, { w: number; h: number; hp: number; vx: number; pts: number }> = {
  drone: { w: 5, h: 3, hp: 1, vx: -14, pts: 10 },
  wavey: { w: 5, h: 3, hp: 1, vx: -12, pts: 15 },
  tank: { w: 6, h: 4, hp: 3, vx: -7, pts: 30 },
  gunner: { w: 5, h: 3, hp: 2, vx: -10, pts: 25 },
}
export const BOSS_W = 12
export const BOSS_H = 8

export const ENEMY_COLORS = { drone: 0xe0409a, wavey: 0x4cc46a, tank: 0xf28b30, gunner: 0x9b5de5, boss: 0xe8484f }

export function rand(g: Game): number {
  // mulberry32
  g.seed = (g.seed + 0x6d2b79f5) | 0
  let t = g.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))

function clone(g: Game): Game {
  return JSON.parse(JSON.stringify(g)) as Game
}

export function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh
}

export const podBox = (p: Pod): { x: number; y: number; w: number; h: number } => ({ x: p.x, y: p.y, w: 5, h: 3 })

export const shipMaxX = (w: number): number => Math.max(SHIP_W, Math.floor(w * 0.35))

function clampShip(g: Game): void {
  g.ship.x = clamp(g.ship.x, SHIP_W / 2 + 1, Math.max(SHIP_W / 2 + 1, shipMaxX(g.w)))
  g.ship.y = clamp(g.ship.y, SHIP_MIN_Y, Math.max(SHIP_MIN_Y, g.h - 3))
}

function beginWave(g: Game): void {
  g.gapT = WAVE_GAP_S
  g.spawnT = 0
  g.toSpawn = g.wave % BOSS_EVERY === 0 ? 1 : Math.min(6 + 2 * g.wave, 20)
}

function fresh(g: Game): void {
  g.score = 0
  g.lives = LIVES
  g.wave = 1
  g.over = false
  g.overT = 0
  g.ship = { x: 6, y: Math.floor(g.h / 2) }
  g.aim = null
  g.weapon = 1
  g.fireT = 0
  g.shield = false
  g.inv = 0
  g.shots = []
  g.enemies = []
  g.bullets = []
  g.pods = []
  g.particles = []
  beginWave(g)
  clampShip(g)
}

export function newGame(w: number, h: number, seed = 1): Game {
  const g = {
    w,
    h,
    seed,
    t: 0,
    volleys: 0,
    fired: 0,
    toSpawn: 0,
    spawnT: 0,
    gapT: 0,
  } as Game
  fresh(g)

  return g
}

export function resize(g: Game, w: number, h: number): Game {
  const next = clone(g)
  next.w = w
  next.h = h
  clampShip(next)
  if (next.aim) next.aim = { x: clamp(next.aim.x, 0, w), y: clamp(next.aim.y, 0, h) }
  next.shots = next.shots.filter(s => s.x < w && s.y >= 0 && s.y < h)
  next.bullets = next.bullets.filter(b => b.x < w && b.x > -2 && b.y >= 0 && b.y < h)
  next.pods = next.pods.filter(p => p.x < w && p.y < h - 1)
  // a wave spawns just past the right edge on purpose; anything further out or below the field is gone; the boss is clamped below, never dropped
  next.enemies = next.enemies.filter(e => e.kind === 'boss' || (e.x <= w + 6 && e.y < h))
  for (const e of next.enemies) {
    e.y = clamp(e.y, SHIP_MIN_Y, h - e.h / 2)
    e.y0 = clamp(e.y0, SHIP_MIN_Y, h - e.h / 2)
    if (e.kind === 'boss') e.x = Math.min(e.x, w - BOSS_W / 2 - 2)
  }
  next.particles = next.particles.filter(p => p.x >= 0 && p.x < w && p.y >= 0 && p.y < h)

  return next
}

function burst(g: Game, x: number, y: number, color: number, n: number): void {
  for (let i = 0; i < n; i += 1) {
    const a = rand(g) * Math.PI * 2
    const sp = 6 + rand(g) * 22
    const life = 0.3 + rand(g) * 0.4
    g.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color: i % 3 === 0 ? 0xfff6d0 : color })
  }
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES)
}

function fire(g: Game): void {
  const { x, y } = g.ship
  const sx = x + SHIP_W / 2
  const add = (dy: number, vy: number) => g.shots.push({ x: sx, y: y + dy, vx: SHOT_SPEED, vy })
  if (g.weapon <= 1) add(0, 0)
  else if (g.weapon === 2) {
    add(-1, 0)
    add(1, 0)
  } else {
    add(0, 0)
    add(-1, -14)
    add(1, 14)
  }
  g.volleys += 1
  g.fired += g.weapon <= 1 ? 1 : g.weapon
}

function spawnEnemy(g: Game): void {
  const hi = Math.max(SHIP_MIN_Y + 1, g.h - 4)
  if (g.wave % BOSS_EVERY === 0) {
    const y = Math.floor(g.h / 2)
    const hp = BOSS_HP(g.wave)
    g.enemies.push({ kind: 'boss', x: g.w + BOSS_W, y, y0: y, vx: -14, hp, maxHp: hp, w: BOSS_W, h: BOSS_H, ph: 0, fireT: 1.5, hitT: 0 })

    return
  }
  const pool: Exclude<EnemyKind, 'boss'>[] = ['drone']
  if (g.wave >= 2) pool.push('wavey')
  if (g.wave >= 3) pool.push('tank')
  if (g.wave >= 4) pool.push('gunner')
  const kind = pool[Math.floor(rand(g) * pool.length)]!
  const k = KINDS[kind]
  const y = SHIP_MIN_Y + 1 + rand(g) * (hi - SHIP_MIN_Y - 1)
  g.enemies.push({ kind, x: g.w + 3, y, y0: y, vx: k.vx, hp: k.hp, maxHp: k.hp, w: k.w, h: k.h, ph: rand(g) * 6, fireT: 1 + rand(g), hitT: 0 })
}

function enemyBullet(g: Game, x: number, y: number, vy: number): void {
  if (g.bullets.length >= MAX_BULLETS) return
  g.bullets.push({ x, y, vx: -BULLET_SPEED, vy })
}

function hurt(g: Game): void {
  if (g.inv > 0) return
  const { x, y } = g.ship
  if (g.shield) {
    g.shield = false
    g.inv = SHIELD_INVULN_S
    burst(g, x, y, 0x3ad7e8, 10)

    return
  }
  g.lives -= 1
  g.inv = INVULN_S
  burst(g, x, y, 0xff9a3c, 18)
  if (g.lives <= 0) {
    g.lives = 0
    g.over = true
    g.overT = 0
  }
}

function killEnemy(g: Game, e: Enemy): void {
  const pts = e.kind === 'boss' ? 500 * Math.floor(g.wave / BOSS_EVERY) : KINDS[e.kind].pts
  g.score += pts
  burst(g, e.x, e.y, ENEMY_COLORS[e.kind], e.kind === 'boss' ? 40 : 10)
  if (e.kind === 'boss') {
    g.bullets = []
    placePod(g, e.x - 8, e.y)
  }
}

function overlapsEnemy(g: Game, x: number, y: number, w: number, h: number): boolean {
  return g.enemies.some(e => overlap(x, y, w, h, e.x, e.y, e.w, e.h))
}

// Only the pod's own cap and the no-overlap rule decide: a pod is a reward, never a hazard.
function placePod(g: Game, x: number, y: number): boolean {
  if (g.pods.length >= MAX_PODS) return false
  const px = clamp(x, 3, g.w - 3)
  const py = clamp(y, SHIP_MIN_Y, g.h - 3)
  if (overlapsEnemy(g, px, py, 5, 3)) return false
  const kind: PodKind = g.weapon >= MAX_WEAPON ? 'shield' : rand(g) < 0.5 ? 'weapon' : 'shield'
  g.pods.push({ x: px, y: py, kind })

  return true
}

export function step(state: Game, dt: number, input: Input = {}): Game {
  const g = clone(state)
  g.t += dt
  for (const p of g.particles) {
    p.life -= dt
    p.vy += PARTICLE_GRAVITY * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  g.particles = g.particles.filter(p => p.life > 0 && p.y >= 0 && p.y < g.h && p.x >= 0 && p.x < g.w)

  if (g.over) {
    if (g.overT >= RESTART_AFTER_S && input.any) fresh(g)
    else g.overT += dt

    return g
  }

  g.inv = Math.max(0, g.inv - dt)
  g.gapT = Math.max(0, g.gapT - dt)

  // steering: an arrow tap takes the wheel back from the pointer
  if (input.dx || input.dy) {
    g.aim = null
    g.ship.x += input.dx ?? 0
    g.ship.y += input.dy ?? 0
  } else if (input.aimTo) {
    g.aim = { x: input.aimTo.x, y: input.aimTo.y }
  }
  if (g.aim) {
    const dx = g.aim.x - g.ship.x
    const dy = g.aim.y - g.ship.y
    const d = Math.hypot(dx, dy)
    const move = SHIP_SPEED * dt
    if (d <= move) {
      g.ship.x = g.aim.x
      g.ship.y = g.aim.y
    } else {
      g.ship.x += (dx / d) * move
      g.ship.y += (dy / d) * move
    }
  }
  clampShip(g)

  g.fireT -= dt
  if (g.fireT <= 0) {
    fire(g)
    g.fireT += FIRE_S[clamp(g.weapon, 1, MAX_WEAPON) - 1]!
  }

  if (g.gapT <= 0 && g.toSpawn > 0) {
    g.spawnT -= dt
    if (g.spawnT <= 0) {
      spawnEnemy(g)
      g.toSpawn -= 1
      g.spawnT = Math.max(0.45, 0.95 - g.wave * 0.04)
    }
  }

  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
  }
  g.shots = g.shots.filter(s => s.x < g.w && s.y >= 0 && s.y < g.h)

  for (const e of g.enemies) {
    e.hitT = Math.max(0, e.hitT - dt)
    e.ph += dt
    if (e.kind === 'boss') {
      const stop = g.w - BOSS_W / 2 - 2
      if (e.x > stop) e.x = Math.max(stop, e.x + e.vx * dt)
      else {
        const amp = Math.max(2, (g.h - SHIP_MIN_Y - BOSS_H) / 2.4)
        e.y = clamp(e.y0 + Math.sin(e.ph * 0.9) * amp, SHIP_MIN_Y + BOSS_H / 2, g.h - 2 - BOSS_H / 2)
        e.fireT -= dt
        if (e.fireT <= 0) {
          e.fireT = e.hp * 2 < e.maxHp ? 1.1 : 1.5
          const spread = e.hp * 2 < e.maxHp ? [-14, -7, 0, 7, 14] : [-8, 0, 8]
          for (const vy of spread) enemyBullet(g, e.x - BOSS_W / 2, e.y, vy)
        }
      }
      continue
    }
    e.x += e.vx * dt
    if (e.kind === 'wavey') e.y = clamp(e.y0 + Math.sin(e.ph * 2.2) * 6, SHIP_MIN_Y, g.h - 3)
    if (e.kind === 'gunner') {
      e.fireT -= dt
      if (e.fireT <= 0 && e.x < g.w - 2 && e.x > g.ship.x + 8) {
        e.fireT = 1.8
        enemyBullet(g, e.x - 3, e.y, 0)
      }
    }
  }
  g.enemies = g.enemies.filter(e => e.x > -e.w)

  // shots against enemies
  const liveShots: Shot[] = []
  for (const s of g.shots) {
    const target = g.enemies.find(e => overlap(s.x, s.y, 2, 1, e.x, e.y, e.w, e.h))
    if (!target) {
      liveShots.push(s)
      continue
    }
    target.hp -= 1
    target.hitT = 0.08
    burst(g, s.x, s.y, 0xfff6d0, 2)
  }
  g.shots = liveShots
  const dead = g.enemies.filter(e => e.hp <= 0)
  g.enemies = g.enemies.filter(e => e.hp > 0)
  for (const e of dead) killEnemy(g, e)

  for (const b of g.bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  g.bullets = g.bullets.filter(b => b.x > -2 && b.y >= 0 && b.y < g.h)

  // contact: the ship's hit box is a little smaller than its sprite
  const sx = g.ship.x
  const sy = g.ship.y
  for (const e of [...g.enemies]) {
    if (!overlap(sx, sy, 5, 3, e.x, e.y, e.w, e.h)) continue
    if (e.kind !== 'boss') {
      g.enemies = g.enemies.filter(o => o !== e)
      burst(g, e.x, e.y, ENEMY_COLORS[e.kind], 8)
    }
    hurt(g)
  }
  const bulletsLeft: Bullet[] = []
  for (const b of g.bullets) {
    if (overlap(sx, sy, 5, 3, b.x, b.y, 2, 2)) hurt(g)
    else bulletsLeft.push(b)
  }
  g.bullets = bulletsLeft

  const podsLeft: Pod[] = []
  for (const p of g.pods) {
    p.x -= POD_SPEED * dt
    if (overlap(sx, sy, SHIP_W, SHIP_H, p.x, p.y, 5, 3)) {
      g.score += 25
      if (p.kind === 'weapon') {
        if (g.weapon < MAX_WEAPON) g.weapon += 1
        else g.score += 50
      } else g.shield = true
      continue
    }
    if (p.x > -3) podsLeft.push(p)
  }
  g.pods = podsLeft

  if (g.over) return g

  if (g.toSpawn === 0 && g.enemies.length === 0 && g.gapT <= 0) {
    g.wave += 1
    g.score += 50
    beginWave(g)
  }

  return g
}

// One pod drifts in from the right at a random height; a reward, never a hazard, capped at two.
export function spawnBonus(state: Game): Game {
  const g = clone(state)
  if (g.over || g.pods.length >= MAX_PODS) return g
  for (let tries = 0; tries < 6; tries += 1) {
    const y = SHIP_MIN_Y + rand(g) * (g.h - 3 - SHIP_MIN_Y)
    if (placePod(g, g.w - 3, y)) break
  }

  return g
}
