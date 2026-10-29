import type { Cells } from '../../shared/cells'
import * as fishSim from '../../plugins/fish-shooter/hooks/sim'
import * as fishRender from '../../plugins/fish-shooter/hooks/render'
import * as brickSim from '../../plugins/brick-breaker/hooks/sim'
import * as brickRender from '../../plugins/brick-breaker/hooks/render'
import * as snakeSim from '../../plugins/snake/hooks/sim'
import * as snakeRender from '../../plugins/snake/hooks/render'
import * as spaceSim from '../../plugins/space-shooter/hooks/sim'
import * as spaceRender from '../../plugins/space-shooter/hooks/render'
import * as flyerSim from '../../plugins/tap-flyer/hooks/sim'
import * as flyerRender from '../../plugins/tap-flyer/hooks/render'
import * as runnerSim from '../../plugins/jump-runner/hooks/sim'
import * as runnerRender from '../../plugins/jump-runner/hooks/render'
import { bot as fishBot } from './fish-shooter'
import { bot as brickBot } from './brick-breaker'
import { bot as snakeBot } from './snake'
import { bot as spaceBot } from './space-shooter'
import { bot as flyerBot } from './tap-flyer'
import { bot as runnerBot } from './jump-runner'

export type GameEntry = {
  id: string
  name: string
  seed: number
  // seconds simulated before recording starts
  warmupS: number
  start(w: number, h: number, seed: number): unknown
  // bot input + step in one call
  tick(g: unknown, dt: number): unknown
  render(g: unknown): Cells
  progress(g: unknown): number
  over(g: unknown): boolean
}

type Sim<G, I> = { newGame(w: number, h: number, seed: number): G; step(g: G, dt: number, input: I): G }

function entry<G, I>(
  id: string,
  name: string,
  seed: number,
  sim: Sim<G, I>,
  bot: (g: G) => I,
  render: (g: G) => Cells,
  progress: (g: G) => number,
  over: (g: G) => boolean,
  warmupS = 1,
): GameEntry {
  return {
    id,
    name,
    seed,
    warmupS,
    start: (w, h, s) => sim.newGame(w, h, s),
    tick: (g, dt) => sim.step(g as G, dt, bot(g as G)),
    render: g => render(g as G),
    progress: g => progress(g as G),
    over: g => over(g as G),
  }
}

export const GAMES: GameEntry[] = [
  entry('fish-shooter', 'FISH SHOOTER', 1, fishSim, fishBot, g => fishRender.renderCells(g), g => g.caughtCount, () => false),
  entry('brick-breaker', 'BRICK BREAKER', 1, brickSim, brickBot, g => brickRender.renderCells(g), g => g.score, g => g.over),
  entry('snake', 'SNAKE', 8, snakeSim, snakeBot, g => snakeRender.renderCells(g), g => g.score, g => g.over),
  entry('space-shooter', 'SPACE SHOOTER', 1, spaceSim, spaceBot, g => spaceRender.renderCells(g), g => g.score, g => g.over),
  entry('tap-flyer', 'TAP FLYER', 1, flyerSim, flyerBot, g => flyerRender.renderCells(g), g => g.score, g => g.over),
  entry('jump-runner', 'JUMP RUNNER', 1, runnerSim, runnerBot, g => runnerRender.renderCells(g), g => g.score, g => g.over),
]
