import { expect, test } from 'bun:test'
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MARKER, SCAFFOLDED, scaffoldFiles } from './new-game'

const root = resolve(import.meta.dir, '..')
const snake = (p: string): string => readFileSync(join(root, 'plugins', 'snake', p), 'utf8')

test('scaffolding snake reproduces snake\'s glue files', () => {
  const f = scaffoldFiles('snake', 'Snake')
  const noOpened = (s: string): string => s.split('\n').filter(l => !l.includes('opened:')).join('\n')
  expect(noOpened(f['plugins/snake/hooks/register.tsx']!)).toBe(noOpened(snake('hooks/register.tsx')))
  expect(f['plugins/snake/hooks/link-apply.ts']).toBe(snake('hooks/link-apply.ts'))
  const upTo = (s: string): string => s.slice(0, s.indexOf(MARKER) + MARKER.length)
  expect(f['plugins/snake/hooks/save-store.ts']).toContain(MARKER)
  expect(upTo(f['plugins/snake/hooks/save-store.ts']!)).toBe(upTo(snake('hooks/save-store.ts')))
  expect(f['plugins/snake/hooks/hooks.json']).toBe(snake('hooks/hooks.json'))
  expect(SCAFFOLDED.every(p => `plugins/snake/${p}` in f)).toBe(true)
})

test('rejects bad ids and titles', () => {
  for (const id of ['Snake', 'ab', '../x', '1abc', 'a_b_c']) {
    expect(() => scaffoldFiles(id, 'X'), id).toThrow()
  }
  expect(() => scaffoldFiles('fresh-one', "It's")).toThrow()
  expect(() => scaffoldFiles('fresh-one', '')).toThrow()
})

test('the CLI scaffolds a game that is in sync and listed last', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'coinslot-new-'))
  cpSync(root, tmp, {
    recursive: true,
    filter: s => !/\/(node_modules|\.git)(\/|$)/.test(s) || s === root,
  })
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'))
  const run = (cmd: string[]) => Bun.spawnSync(cmd, { cwd: tmp, stdout: 'pipe', stderr: 'pipe' })

  const p = run(['bun', 'scripts/new-game.ts', 'demo-game', 'Demo Game'])
  expect(p.exitCode, p.stderr.toString()).toBe(0)
  for (const f of ['.claude-plugin/plugin.json', 'hooks/register.tsx', 'hooks/sim.ts', 'hooks/shared/shell.tsx', 'types/index.d.ts']) {
    expect(existsSync(join(tmp, 'plugins', 'demo-game', f)), f).toBe(true)
  }
  const market = JSON.parse(readFileSync(join(tmp, '.claude-plugin', 'marketplace.json'), 'utf8'))
  expect(market.plugins.at(-1)).toEqual({ name: 'demo-game', source: './plugins/demo-game', description: 'TODO' })
  expect(run(['bun', 'scripts/bundle-shared.ts', '--check', '--plugin=demo-game']).exitCode).toBe(0)
  // a second run refuses: the id exists
  expect(run(['bun', 'scripts/new-game.ts', 'demo-game', 'Demo Game']).exitCode).not.toBe(0)
})
