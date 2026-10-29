import { expect, test } from 'bun:test'
import { glyphShape } from './glyph'

test('glyphShape maps block characters', () => {
  expect(glyphShape(' ')).toBe('space')
  expect(glyphShape('█')).toBe('full')
  expect(glyphShape('▀')).toBe('top')
  expect(glyphShape('▄')).toBe('bottom')
  expect(glyphShape('A')).toBe('text')
  expect(glyphShape('')).toBe('text')
})
