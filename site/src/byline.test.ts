import { expect, test } from 'bun:test'
import { byline } from './byline'

test('byline prefixes the author', () => {
  expect(byline('beasaltfish')).toBe('by beasaltfish')
})

test('byline cuts long names to 24 chars plus an ellipsis', () => {
  const name = 'a'.repeat(30)
  expect(byline(name)).toBe(`by ${'a'.repeat(24)}…`)
})

test('byline trims', () => {
  expect(byline('  ada  ')).toBe('by ada')
})

test('byline cuts on code points, not UTF-16 units', () => {
  const name = `${'a'.repeat(23)}😀tail`
  expect(byline(name)).toBe(`by ${'a'.repeat(23)}😀…`)
})
