import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkContribution, type Violation } from './check-contribution'
import { MARKER, scaffoldFiles } from './new-game'

const root = resolve(import.meta.dir, '..')
const baseMarketplace = readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')
const ID = 'demo-game'
const P = `plugins/${ID}/`

function headWith(entries: object[]): string {
  const m = JSON.parse(baseMarketplace)
  m.plugins.push(...entries)
  return JSON.stringify(m, null, 2) + '\n'
}
const ENTRY = { name: ID, source: `./plugins/${ID}`, description: 'x' }

// A clean contribution: scaffold + bundled shared + a real author.
function fixture(): { files: Record<string, string>; head: string } {
  const files: Record<string, string> = scaffoldFiles(ID, 'Demo Game')
  const pj = JSON.parse(files[`${P}.claude-plugin/plugin.json`]!)
  pj.author = { name: 'Ada' }
  pj.description = 'A demo'
  files[`${P}.claude-plugin/plugin.json`] = JSON.stringify(pj, null, 2) + '\n'
  for (const f of readdirSync(join(root, 'shared')).filter(n => /\.tsx?$/.test(n))) {
    const text = readFileSync(join(root, 'shared', f), 'utf8')
    if (!text.startsWith('// @host-only')) files[`${P}hooks/shared/${f}`] = text
  }
  return { files, head: headWith([ENTRY]) }
}

function run(files: Record<string, string>, head: string, extraChanged: string[] = []): Violation[] {
  return checkContribution({
    changed: [...Object.keys(files), ...extraChanged, '.claude-plugin/marketplace.json'],
    read: p => {
      const t = files[p] ?? (p.startsWith('shared/') ? readFileSync(join(root, p), 'utf8') : undefined)
      if (t === undefined) throw new Error(`no ${p}`)
      return t
    },
    baseMarketplace,
    headMarketplace: head,
  })
}
const rules = (v: Violation[]): string[] => [...new Set(v.map(x => x.rule))].sort()

function withFile(path: string, text: string): Violation[] {
  const { files, head } = fixture()
  files[`${P}${path}`] = text
  return run(files, head)
}
const sim = (body: string): Violation[] => withFile('hooks/sim.ts', body)

test('a clean scaffolded game has no violations', () => {
  const { files, head } = fixture()
  expect(run(files, head)).toEqual([])
})

test('one-plugin: touching shared/ or a second plugin', () => {
  const { files, head } = fixture()
  expect(rules(run(files, head, ['shared/shell.tsx']))).toEqual(['one-plugin'])
  expect(rules(run(files, head, ['plugins/other-game/hooks/sim.ts']))).toContain('one-plugin')
  expect(rules(run(files, head, ['plugins/demo-game/../snake/hooks/sim.ts']))).toContain('one-plugin')
  expect(rules(run(files, head, ['README.md']))).toEqual(['one-plugin'])
})

test('new-plugin-only: editing an existing game', () => {
  const v = checkContribution({
    changed: ['plugins/snake/hooks/sim.ts'],
    read: () => 'x',
    baseMarketplace,
    headMarketplace: baseMarketplace,
  })
  expect(rules(v)).toContain('new-plugin-only')
})

test('marketplace-append: reorder, two entries, wrong name, edited entry', () => {
  const { files } = fixture()
  const m = JSON.parse(baseMarketplace)
  const reordered = { ...m, plugins: [m.plugins[1], m.plugins[0], ...m.plugins.slice(2), ENTRY] }
  expect(rules(run(files, JSON.stringify(reordered)))).toEqual(['marketplace-append'])
  expect(rules(run(files, headWith([ENTRY, { name: 'x-two', source: './plugins/x-two', description: 'y' }])))).toEqual(['marketplace-append'])
  expect(rules(run(files, headWith([{ ...ENTRY, name: 'other' }])))).toEqual(['marketplace-append'])
  expect(rules(run(files, headWith([{ ...ENTRY, source: './plugins/snake' }])))).toEqual(['marketplace-append'])
  const edited = JSON.parse(headWith([ENTRY]))
  edited.plugins[0].description = 'changed'
  expect(rules(run(files, JSON.stringify(edited)))).toEqual(['marketplace-append'])
  expect(rules(run(files, baseMarketplace))).toEqual(['marketplace-append'])
})

test('scaffold-equal: glue files, shared bundle, types', () => {
  const snakeReg = readFileSync(join(root, 'plugins/snake/hooks/register.tsx'), 'utf8').replace("'snake'", "'snake'")
  expect(rules(withFile('hooks/register.tsx', snakeReg))).toEqual(['scaffold-equal'])
  const { files, head } = fixture()
  files[`${P}hooks/register.tsx`] = files[`${P}hooks/register.tsx`]!.replace("pane: 'demo-game'", "pane: 'snake'")
  expect(rules(run(files, head))).toEqual(['scaffold-equal'])
  expect(rules(withFile('hooks/hooks.json', '{}'))).toEqual(['scaffold-equal'])
  expect(rules(withFile('hooks/link-apply.ts', '// nothing\n'))).toEqual(['scaffold-equal'])
  expect(rules(withFile('types/index.d.ts', 'declare const x: 1\n'))).toEqual(['scaffold-equal'])
  const f2 = fixture()
  f2.files[`${P}hooks/shared/shell.tsx`] += '\n// tampered\n'
  expect(rules(run(f2.files, f2.head))).toEqual(['scaffold-equal'])
  const f3 = fixture()
  f3.files[`${P}hooks/shared/extra.ts`] = 'export const x = 1\n'
  expect(rules(run(f3.files, f3.head))).toEqual(['scaffold-equal'])
})

test('scaffold-equal: save-store is compared up to the marker only', () => {
  const { files, head } = fixture()
  const ok = files[`${P}hooks/save-store.ts`]!
  const i = ok.indexOf(MARKER)
  files[`${P}hooks/save-store.ts`] = ok.slice(0, i + MARKER.length) + '\nexport function parseSave(v: unknown): never | null {\n  return v === 1 ? null : null\n}\n'
  expect(run(files, head)).toEqual([])
  files[`${P}hooks/save-store.ts`] = ok.replace("key: 'save'", "key: 'steal'")
  expect(rules(run(files, head))).toEqual(['scaffold-equal'])
  files[`${P}hooks/save-store.ts`] = ok.replace(MARKER, '// gone')
  expect(rules(run(files, head))).toContain('scaffold-equal')
})

test('parseSave region is scanned as hand-written', () => {
  const { files, head } = fixture()
  const ok = files[`${P}hooks/save-store.ts`]!
  files[`${P}hooks/save-store.ts`] = ok + '\nexport const leak = (x: unknown) => fetch("https://x")\n'
  expect(rules(run(files, head))).toEqual(['banned-token'])
  files[`${P}hooks/save-store.ts`] = ok + "\nimport { evil } from 'evil-pkg'\n"
  expect(rules(run(files, head))).toEqual(['import-allowlist'])
  files[`${P}hooks/save-store.ts`] = ok + "\nimport { read } from 'claude-code'\nexport const x = read\n"
  expect(rules(run(files, head))).toEqual(['type-only-claude-code'])
  // the scaffolded region keeps its $ parameter without complaint
  expect(run(fixture().files, head)).toEqual([])
})

test('register.tsx: opened line is the one free line, and must be a plain literal', () => {
  const { files, head } = fixture()
  const ok = files[`${P}hooks/register.tsx`]!
  const swap = (line: string): string => ok.replace(/^\s*opened:.*$/m, line)
  files[`${P}hooks/register.tsx`] = swap("    opened: 'Hello, press space to jump.',")
  expect(run(files, head)).toEqual([])
  files[`${P}hooks/register.tsx`] = swap('    opened: "Don\'t panic",')
  expect(run(files, head)).toEqual([])
  for (const bad of [
    '    opened: `x ${1}`,',
    "    opened: 'a' + 'b',",
    "    opened: 'a', evil: 1,",
    "    opened: 'a\\u0027',",
    '    opened: fetch("x"),',
  ]) {
    files[`${P}hooks/register.tsx`] = swap(bad)
    expect(rules(run(files, head)), bad).toContain('scaffold-equal')
  }
  files[`${P}hooks/register.tsx`] = ok + "\n// opened: 'second'\n"
  expect(rules(run(files, head))).toContain('scaffold-equal')
})

test('plugin.json: author required, other fields locked', () => {
  const { files, head } = fixture()
  const pj = JSON.parse(files[`${P}.claude-plugin/plugin.json`]!)
  const put = (o: object): void => void (files[`${P}.claude-plugin/plugin.json`] = JSON.stringify(o))
  put({ ...pj, author: { name: '   ' } })
  expect(rules(run(files, head))).toEqual(['author'])
  put({ ...pj, author: {} })
  expect(rules(run(files, head))).toEqual(['author'])
  const { author, ...noAuthor } = pj
  void author
  put(noAuthor)
  expect(rules(run(files, head))).toEqual(['author'])
  put({ ...pj, hooks: './evil.json' })
  expect(rules(run(files, head))).toEqual(['scaffold-equal'])
  put({ ...pj, version: '9.9.9' })
  expect(rules(run(files, head))).toEqual(['scaffold-equal'])
  files[`${P}.claude-plugin/plugin.json`] = '{nope'
  expect(rules(run(files, head))).toContain('scaffold-equal')
})

test('unexpected files are violations; md and assets images are fine', () => {
  for (const p of ['hooks/evil.ts', 'hooks/evil.mjs', 'hooks/evil.js', 'hooks/deep/x.ts', 'run.sh', 'assets/x.svg', 'assets/x.js', 'hooks/hooks.json.bak']) {
    const v = withFile(p, 'export const x = 1\n')
    expect(v.some(x => x.rule === 'import-allowlist' && x.detail === 'unexpected file' && x.file === P + p), p).toBe(true)
  }
  expect(withFile('README.md', '# hi\n')).toEqual([])
  expect(withFile('assets/shot.png', 'png')).toEqual([])
})

test('no-dollar', () => {
  expect(rules(sim('export const f = ($: unknown) => ($ as any).tool.call()\n'))).toContain('no-dollar')
  expect(rules(sim('export const f = (p: any) => { const { $: a } = p; return a }\n'))).toContain('no-dollar')
  expect(rules(sim('export const f = (p: any) => p.$\n'))).toContain('no-dollar')
  expect(rules(withFile('hooks/game.tsx', 'export const g = ($) => 1\n'))).toContain('no-dollar')
  expect(sim('export const $a = 1\nexport const a$ = 2\nexport const s = `$` + "$"\n')).toEqual([])
})

test('no-bracket-dollar and computed access', () => {
  expect(rules(withFile('hooks/game.tsx', "export const f = (x: any) => $['tool']\n"))).toEqual(['banned-token', 'no-bracket-dollar', 'no-dollar'])
  expect(rules(sim("export const f = (x: any) => x['ev' + 'al']\n"))).toEqual(['banned-token'])
  expect(sim("export const f = (x: any) => x['ev' + 'al']\n")[0]!.detail).toBe('computed access')
  expect(rules(sim('export const f = (x: any) => x[`fetch`]\n'))).toEqual(['banned-token'])
  expect(rules(sim("export const f = (x: any) => x?.['a']\n"))).toEqual(['banned-token'])
  expect(rules(sim("export const f = (x: any) => ({ ['fe' + 'tch']: 1, ...x })\n"))).toEqual(['banned-token'])
  expect(sim('export const f = (a: number[], i: number) => a[i + 1]\n')).toEqual([])
})

test('import-allowlist', () => {
  expect(rules(withFile('hooks/game.tsx', "import x from '../../shared/shell'\nexport default x\n"))).toEqual(['import-allowlist'])
  for (const spec of ['node:fs', 'fs', 'bun', './game', '../x', './shared/a/b', './shared/..', './sim.ts', 'claude-code/testing', 'https://x.test/a.js', 'data:text/javascript,1']) {
    expect(rules(sim(`import x from '${spec}'\nexport default x\n`)), spec).toEqual(['import-allowlist'])
  }
  expect(rules(sim("export * from 'node:fs'\n"))).toEqual(['import-allowlist'])
  expect(rules(sim("import x = require('fs')\nexport default x\n"))).toEqual(['banned-token', 'import-allowlist'])
  expect(rules(sim("export const p = import('./sim')\n"))).toEqual(['banned-token'])
  expect(rules(sim("export type T = import('./sim').Game\n"))).toEqual(['banned-token'])
  expect(withFile('hooks/render.ts', "import { newGame } from './sim'\nimport { toRuns } from './shared/cells'\nexport const a = [newGame, toRuns]\n")).toEqual([])
  expect(withFile('hooks/sim.test.ts', "import { expect, test } from 'claude-code/testing'\nimport { newGame } from './sim'\nimport { renderCells } from './render'\ntest('a', () => expect([newGame, renderCells]).toBeTruthy())\n")).toEqual([])
})

test('type-only-claude-code', () => {
  expect(rules(withFile('hooks/game.tsx', "import { atom } from 'claude-code'\nexport const a = atom\n"))).toEqual(['type-only-claude-code'])
  expect(rules(sim("import * as cc from 'claude-code'\nexport default cc\n"))).toEqual(['type-only-claude-code'])
  expect(rules(sim("import cc from 'claude-code'\nexport default cc\n"))).toEqual(['type-only-claude-code'])
  expect(rules(sim("export { atom } from 'claude-code'\n"))).toEqual(['type-only-claude-code'])
  expect(sim("import type { JsonValue } from 'claude-code'\nimport { type Register } from 'claude-code'\nexport type T = [JsonValue, Register]\n")).toEqual([])
  expect(sim("export type { Register } from 'claude-code'\n")).toEqual([])
})

test('banned-token: calls, identifiers, escapes, whole-word matching', () => {
  expect(rules(withFile('hooks/render.ts', "export const r = () => fetch('x')\n"))).toEqual(['banned-token'])
  expect(rules(sim("export const g = globalThis['fe' + 'tch']\n"))).toEqual(['banned-token'])
  for (const t of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'eval', 'globalThis', 'process', 'Bun', 'Deno', 'navigator', 'localStorage', 'document', 'window', 'atob', 'require', 'constructor', '__proto__']) {
    expect(rules(sim(`export const a = (x: any) => x.${t}\nexport const b = ${t}\n`)), t).toEqual(['banned-token'])
  }
  expect(rules(sim('export const a = new Function("return 1")\n'))).toEqual(['banned-token'])
  expect(rules(sim('export const a = Function("return 1")\n'))).toEqual(['banned-token'])
  expect(rules(sim('export const a = String.fromCharCode(102)\n'))).toEqual(['banned-token'])
  expect(rules(sim('export const a = String.fromCodePoint(102)\n'))).toEqual(['banned-token'])
  expect(rules(sim('export const f = (x: any) => x.\\u0066etch\n'))).toEqual(['banned-token'])
  expect(rules(sim('export const \\u0061toX = 1\n'))).toEqual(['banned-token'])
  expect(rules(withFile('hooks/game.tsx', 'export const j = <div fetch="1" />\n'))).toEqual(['banned-token'])
  // inside template substitutions and nested JSX expressions
  expect(rules(sim('export const t = `${fetch("x")}`\n'))).toEqual(['banned-token'])
  expect(rules(withFile('hooks/game.tsx', 'export const j = <div>{eval("1")}</div>\n'))).toEqual(['banned-token'])
  // a syntax error never counts as clean
  expect(rules(sim('export const = ((\n'))).toEqual(['banned-token'])
  // Function as a type is fine
  expect(sim('export type F = Function\nexport const f = (g: Function) => g\n')).toEqual([])
  // whole identifiers only
  expect(sim('export const processInput = 1, windowW = 2, fetched = 3, documents = 4, evaluate = 5, Function2 = 6\n')).toEqual([])
})

test('comments, strings, and regex literals never trigger', () => {
  const src = [
    '// fetch( eval( $ globalThis',
    '/* process.exit() window document $.tool */',
    "export const a = 'fetch( globalThis eval $'",
    'export const b = "XMLHttpRequest // not a comment"',
    'export const c = `process Bun ${1 + 1} Deno`',
    "export const d = /fetch'|\"eval/g",
    "export const e = 'x' // fetch(",
    'export const f = 6 / 2 / 3',
    '',
  ].join('\n')
  expect(sim(src)).toEqual([])
})

test('lexer tricks that fool a regex scanner do not hide code', () => {
  // regex literal holding a quote, then real code
  expect(rules(sim("export const r = /'/\nexport const s = fetch('x')\nexport const q = /'/\n"))).toEqual(['banned-token'])
  // division then a quote
  expect(rules(sim("export const n = (1 + 2) / 3; fetch('/'); const z = 4 / 5\nexport { z }\n"))).toEqual(['banned-token'])
  // comment markers inside strings and template literals
  expect(rules(sim("export const a = '/*'; eval('1'); export const b = '*/'\n"))).toEqual(['banned-token'])
  expect(rules(sim('export const a = `//`; fetch("1")\n'))).toEqual(['banned-token'])
  // nested templates
  expect(rules(sim('export const a = `${`${fetch("x")}`}`\n'))).toEqual(['banned-token'])
  // $ in the template text is not an identifier but ${$} is
  expect(rules(sim('export const a = (x: any) => `${$}`\n'))).toContain('no-dollar')
  // optional chaining on a global
  expect(rules(sim('export const a = globalThis?.fetch\n'))).toEqual(['banned-token'])
  // JSX text containing a quote does not open a string
  expect(rules(withFile('hooks/game.tsx', "export const j = <div>don't</div>\nexport const k = fetch('x')\n"))).toEqual(['banned-token'])
})

test('test files are scanned like the rest, and may use claude-code/testing', () => {
  expect(rules(withFile('hooks/sim.test.ts', "import { test } from 'claude-code/testing'\ntest('x', () => { fetch('y') })\n"))).toEqual(['banned-token'])
  expect(rules(withFile('hooks/extra.test.tsx', "import fs from 'node:fs'\nexport default fs\n"))).toEqual(['import-allowlist'])
})

test('a class constructor declaration is not the banned property', () => {
  expect(sim('export class A { constructor(private a: number) {} }\n')).toEqual([])
})
