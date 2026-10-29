import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readGameMetas } from './games'

const root = resolve(import.meta.dir, '..')

test('reads every game in marketplace order', () => {
  const market = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')) as { plugins: { name: string }[] }
  const metas = readGameMetas(root)
  expect(metas.map(m => m.id)).toEqual(market.plugins.map(p => p.name))
  expect(metas.length).toBeGreaterThan(0)
  expect(metas.every(m => m.author.trim() !== '' && m.author === m.author.trim())).toBe(true)
  expect(metas.every(m => m.name === m.id.toUpperCase().replaceAll('-', ' '))).toBe(true)
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
