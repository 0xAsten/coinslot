import { describe, expect, test } from 'bun:test'
import { resolveSiteUrl } from './site-url'

describe('resolveSiteUrl', () => {
  test('deploy requires https and strips trailing slash', () => {
    expect(resolveSiteUrl(' https://coinslot.dev/ ', true)).toBe('https://coinslot.dev')
    expect(resolveSiteUrl('https://x.dev/play', true)).toBe('https://x.dev/play')
  })
  test('deploy rejects unset, blank, http, junk', () => {
    for (const v of [undefined, '', '  ', 'http://x.dev', 'coinslot.dev', 'https://', 'https://a b']) {
      expect(() => resolveSiteUrl(v, true)).toThrow()
    }
  })
  test('local allows localhost and https, rejects others', () => {
    expect(resolveSiteUrl('http://localhost:3000', false)).toBe('http://localhost:3000')
    expect(resolveSiteUrl('https://x.dev', false)).toBe('https://x.dev')
    expect(resolveSiteUrl(undefined, false)).toBe('http://localhost:4173')
    expect(() => resolveSiteUrl('http://example.com', false)).toThrow()
    expect(() => resolveSiteUrl('nonsense', false)).toThrow()
  })
})
