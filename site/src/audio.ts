export type Sfx = 'move' | 'zoom' | 'back' | 'coin'

export type Audio = {
  unlock(): void
  sfx(name: Sfx): void
  setMuted(m: boolean): void
  muted(): boolean
}

const STEP = 0.15
const MASTER = 0.18
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

// original 32-step lead over a 16-note bass, in MIDI numbers (0 = rest)
const LEAD = [
  69, 0, 72, 76, 74, 0, 72, 69, 67, 0, 71, 74, 72, 0, 0, 0,
  69, 0, 72, 76, 81, 0, 79, 76, 77, 76, 74, 71, 69, 0, 0, 0,
]
const BASS = [45, 45, 52, 52, 43, 43, 50, 50, 41, 41, 48, 48, 40, 40, 47, 47]

export function createAudio(): Audio {
  let ac: AudioContext | null = null
  let master: GainNode | null = null
  let isMuted = false
  let musicOn = false
  let dead = false

  function tone(f: number, t0: number, d: number, type: OscillatorType, v: number, slide = 0): void {
    if (!ac || !master) return
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t0)
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d)
    g.gain.setValueAtTime(v, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + d)
    o.connect(g)
    g.connect(master)
    o.start(t0)
    o.stop(t0 + d + 0.02)
  }

  function startMusic(): void {
    if (musicOn || !ac) return
    musicOn = true
    let i = 0
    let next = ac.currentTime + 0.05
    const tick = () => {
      if (dead || !ac) return
      try {
        if (next < ac.currentTime) next = ac.currentTime + 0.05
        while (next < ac.currentTime + 0.3) {
          const l = LEAD[i % LEAD.length] ?? 0
          if (l) tone(hz(l), next, STEP * 0.9, 'square', 0.22)
          if (i % 2 === 0) tone(hz(BASS[(i / 2) % BASS.length] ?? 45), next, STEP * 1.8, 'triangle', 0.5)
          if (i % 4 === 2) tone(1800, next, 0.03, 'square', 0.06)
          i++
          next += STEP
        }
      } catch {
        dead = true
        return
      }
      setTimeout(tick, 60)
    }
    tick()
  }

  function unlock(): void {
    if (dead) return
    try {
      if (!ac) {
        if (typeof AudioContext === 'undefined') {
          dead = true
          return
        }
        ac = new AudioContext()
        master = ac.createGain()
        master.gain.value = isMuted ? 0 : MASTER
        master.connect(ac.destination)
      }
      if (ac.state === 'suspended') void ac.resume().catch(() => {})
      startMusic()
    } catch {
      dead = true
    }
  }

  function sfx(name: Sfx): void {
    if (dead || !ac) return
    try {
      const t = ac.currentTime
      if (name === 'move') tone(880, t, 0.05, 'square', 0.25)
      else if (name === 'zoom') tone(220, t, 0.4, 'sawtooth', 0.25, 4)
      else if (name === 'back') tone(660, t, 0.3, 'sawtooth', 0.2, 0.3)
      else {
        tone(988, t, 0.08, 'square', 0.35)
        tone(1319, t + 0.08, 0.35, 'square', 0.35)
      }
    } catch {
      dead = true
    }
  }

  function setMuted(m: boolean): void {
    isMuted = m
    try {
      if (master) master.gain.value = m ? 0 : MASTER
    } catch {
      dead = true
    }
  }

  document.addEventListener('visibilitychange', () => {
    try {
      if (!ac || dead) return
      if (document.hidden) void ac.suspend().catch(() => {})
      else if (!isMuted) void ac.resume().catch(() => {})
    } catch {
      // ignore
    }
  })

  return { unlock, sfx, setMuted, muted: () => isMuted }
}
