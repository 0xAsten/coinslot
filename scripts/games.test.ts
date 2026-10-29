import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readGameMetas } from './games'

const root = resolve(import.meta.dir, '..')

test('reads the six games in marketplace order', () => {
  const metas = readGameMetas(root)
  expect(metas.map(m => m.id)).toEqual(['fish-shooter', 'brick-breaker', 'snake', 'space-shooter', 'tap-flyer', 'jump-runner'])
  expect(metas.every(m => m.author === 'beasaltfish')).toBe(true)
  expect(metas.find(m => m.id === 'brick-breaker')?.name).toBe('BRICK BREAKER')
})

function fixture(author: unknown): string {
  const tmp = mkdtempSync(join(tmpdir(), 'coinslot-games-'))
  mkdirSync(join(tmp, '.claude-plugin'))
  writeFileSync(join(tmp, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'snake', source: './plugins/snake' }] }))
  mkdirSync(join(tmp, 'plugins', 'snake', '.claude-plugin'), { recursive: true })
  const pj = JSON.parse(readFileSync(join(root, 'plugins', 'snake', '.claude-plugin', 'plugin.json'), 'utf8'))
  if (author === undefined) delete pj.author
  else pj.author = author
  writeFileSync(join(tmp, 'plugins', 'snake', '.claude-plugin', 'plugin.json'), JSON.stringify(pj))
  return tmp
}

test('throws naming the plugin when author is missing', () => {
  expect(() => readGameMetas(fixture(undefined))).toThrow('snake: plugin.json needs author.name')
})

test('throws when author.name is blank', () => {
  expect(() => readGameMetas(fixture({ name: '  ' }))).toThrow('snake: plugin.json needs author.name')
})

test('accepts a valid temp copy', () => {
  expect(readGameMetas(fixture({ name: 'x' }))).toEqual([{ id: 'snake', name: 'SNAKE', author: 'x' }])
})
