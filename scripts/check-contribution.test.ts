import { expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkContribution, type Violation } from './check-contribution'
import { MARKER, scaffoldFiles } from './new-game'

const root = resolve(import.meta.dir, '..')
const baseMarketplace = readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')
// The engine types are not in the repo: without them the tests run the --no-types path.
const hasVendor = existsSync(join(root, 'vendor', 'claude-code.d.ts'))
// cases that need the type layer
const typed = test.skipIf(!hasVendor)
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

function run(files: Record<string, string>, head: string, extraChanged: string[] = [], opts: { types?: boolean; vendorTypes?: string } = {}): Violation[] {
  return checkContribution({
    types: hasVendor,
    ...opts,
    changed: [...Object.keys(files), ...extraChanged, '.claude-plugin/marketplace.json'],
    read: p => {
      const t = files[p] ?? (p.startsWith('shared/') ? readFileSync(join(root, p), 'utf8') : undefined)
      if (t === undefined) throw new Error(`no ${p}`)
      return t
    },
    baseMarketplace,
    headMarketplace: head,
    sharedFiles: readdirSync(join(root, 'shared')).filter(n => /\.tsx?$/.test(n)),
  })
}

function withFileAll(path: string, text: string, opts: { types?: boolean } = {}): Violation[] {
  const { files, head } = fixture()
  files[`${P}${path}`] = text
  return run(files, head, [], opts)
}
// The older tests pin the syntactic rules; the type-aware ones are pinned further down.
const TYPE_RULES = new Set(['global-allowlist', 'no-any', 'type-error'])
const rulesAll = (v: Violation[]): string[] => [...new Set(v.map(x => x.rule))].sort()
const rules = (v: Violation[]): string[] => rulesAll(v.filter(x => !TYPE_RULES.has(x.rule)))
const withFile = (path: string, text: string): Violation[] => withFileAll(path, text).filter(x => !TYPE_RULES.has(x.rule))
const sim = (body: string): Violation[] => withFile('hooks/sim.ts', body)
// replacing sim.ts leaves the scaffold's game untyped, so judge sim.ts alone
const simAll = (body: string): Violation[] => withFileAll('hooks/sim.ts', body).filter(x => x.file.endsWith('/sim.ts'))
// the same with the type layer off: what CI (no vendor types) can still pin
const simSyn = (body: string): Violation[] => withFileAll('hooks/sim.ts', body, { types: false }).filter(x => x.file.endsWith('/sim.ts'))

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
    sharedFiles: [],
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
  expect(rules(withFile('hooks/game.tsx', "export const f = (x: any) => $['tool']\n"))).toEqual(['no-bracket-dollar', 'no-dollar'])
  expect(rules(sim("export const f = (x: any) => x['ev' + 'al']\n"))).toEqual(['banned-token'])
  expect(sim("export const f = (x: any) => x['ev' + 'al']\n")[0]!.detail).toBe('computed access')
  expect(rules(sim('export const f = (x: any) => x[`fetch`]\n'))).toEqual(['banned-token'])
  expect(rules(sim("export const f = (x: any) => x?.['a']\n"))).toEqual([])
  expect(rules(sim("export const f = (x: any) => ({ ['fe' + 'tch']: 1, ...x })\n"))).toEqual(['banned-token'])
  expect(sim('export const f = (a: number[], i: number) => a[(i + 1) | 0]\n')).toEqual([])
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

// ---- fix round 1 ----

const hit = (v: Violation[], rule: string, detail?: string): boolean => v.some(x => x.rule === rule && (detail === undefined || x.detail.includes(detail)))

test('reflection routes to Function are closed (probe: variable key)', () => {
  const v = simAll("const k = 'constr' + 'uctor'\nconst j = 'fet' + 'ch'\nexport const go = () => { const g = (() => 0)[k]('return this')(); return g[j]('https://evil') }\n")
  expect(hit(v, 'banned-token', 'computed access')).toBe(true)
  expect(hit(v, 'banned-token', 'banned property name')).toBe(false)
})

test('reflection routes to Function are closed (probe: getOwnPropertyDescriptor, syntactic)', () => {
  const v = simSyn("export const F = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(() => 0), 'constructor')!.value\nexport const g = F('return this')()\n")
  expect(hit(v, 'banned-token', 'banned property name constructor')).toBe(true)
})

typed('reflection routes to Function are closed (probe: getOwnPropertyDescriptor)', () => {
  const v = simAll("export const F = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(() => 0), 'constructor')!.value\nexport const g = F('return this')()\n")
  expect(hit(v, 'global-allowlist', 'Object')).toBe(true)
  expect(hit(v, 'banned-token', 'banned property name constructor')).toBe(true)
})

test('reflection routes to Function are closed (probe: string-key destructure)', () => {
  const v = simAll("const { 'constructor': F } = (() => 0) as any\nexport const g = F('return this')()\n")
  expect(hit(v, 'banned-token', 'banned property name constructor')).toBe(true)
  expect(hit(v, 'no-any', 'any')).toBe(true)
})

test('reflection routes to Function are closed (probe: Object.entries scan, syntactic)', () => {
  const v = simSyn('const fn: any = () => 0\nexport const F = Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(fn))).find(([n]) => n.length === 11)![1].value\n')
  expect(hit(v, 'no-any')).toBe(true)
})

typed('reflection routes to Function are closed (probe: Object.entries scan)', () => {
  const v = simAll('const fn: any = () => 0\nexport const F = Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(fn))).find(([n]) => n.length === 11)![1].value\n')
  expect(hit(v, 'global-allowlist', 'Object')).toBe(true)
  expect(hit(v, 'no-any')).toBe(true)
})

test('reflection routes to Function are closed (probe: inside the parseSave region)', () => {
  const { files, head } = fixture()
  files[`${P}hooks/save-store.ts`] = files[`${P}hooks/save-store.ts`]!.replace('void v', "const k = 'constr'+'uctor'; ((() => 0) as any)[k]('return this')()")
  const v = run(files, head)
  expect(hit(v, 'no-any')).toBe(true)
  expect(hit(v, 'banned-token', 'computed access')).toBe(true)
  // the scaffolded half still passes: only the region is judged
  expect(run(fixture().files, head)).toEqual([])
})

test('global-allowlist: declare and reference directives are syntactic', () => {
  expect(hit(simSyn('declare const Object: { keys(o: object): string[] }\nexport const a = Object.keys({})\n'), 'global-allowlist', 'declare')).toBe(true)
  expect(hit(simSyn('/// <reference lib="dom" />\nexport const a = 1\n'), 'global-allowlist', 'reference directive')).toBe(true)
})

typed('global-allowlist: free identifiers must be allowed globals or own/imported', () => {
  for (const g of ['Object', 'Reflect', 'Proxy', 'Symbol', 'Date', 'Promise']) {
    expect(hit(simAll(`export const a = ${g}\n`), 'global-allowlist', g), g).toBe(true)
  }
  expect(hit(simAll('export const a = Date.now()\n'), 'global-allowlist', 'Date')).toBe(true)
  // shadowing a global with an own declaration is judged on what it is initialised with
  expect(simAll('export const a = [1, 2].map(x => Math.floor(x * 2.5)).length + Number.parseInt("1") + Array.from({ length: 2 }).length + "ab".length\n')).toEqual([])
  expect(simAll("export const a = new Map<string, number>([['a', 1]]).get('a') ?? JSON.parse('1')\n")).toEqual([])
  // ambient declarations and reference directives cannot smuggle a global in
  expect(hit(simAll('declare const Object: { keys(o: object): string[] }\nexport const a = Object.keys({})\n'), 'global-allowlist', 'declare')).toBe(true)
  expect(hit(simAll('/// <reference lib="dom" />\nexport const a = 1\n'), 'global-allowlist', 'reference directive')).toBe(true)
  expect(hit(simAll('export const a = { Object: 1 }\nconst Object2 = a\nexport { Object2 }\n'), 'global-allowlist')).toBe(false)
  expect(hit(simAll('const Object = 1\nexport const a = { Object }\n'), 'global-allowlist')).toBe(false)
})

const BAD_INDEX = ['xs[i]', 'xs[o.k]', 'xs[`a`]', 'xs[i + 1]', 'xs[i ? 1 : 2]', 'xs[f(i)]', 'xs[i || 0]', 'xs[i ?? 0]', 'xs[(i, 1)]', 'xs[i = 1]', 'xs[!i]', 'xs[++i]', "xs['constructor']", "xs['__proto__']", "xs['pro' + 'to']", 'xs[Math2.floor(i)]', 'xs[g(Math)]']

test('computed access: syntactic index rule (no types)', () => {
  for (const ok of ['xs[0]', "o['name']", 'xs[+i]', 'xs[-i]', 'xs[~i]', 'xs[i | 0]', 'xs[(i * 2 + 1) | 0]', 'xs[i - 1]', 'xs[i ** 2]', 'xs[i >>> 1]', 'xs[(+i)]']) {
    expect(simSyn(`export const a = (xs: any[], o: any, i: number) => ${ok}\n`).filter(x => x.rule === 'banned-token'), ok).toEqual([])
  }
  for (const bad of BAD_INDEX) {
    const v = simSyn(`declare const Math2: any\nexport const a = (xs: any[], o: any, i: number, f: (n: number) => number, g: (m: unknown) => number) => ${bad}\n`)
    expect(hit(v, 'banned-token', 'computed access') || hit(v, 'banned-token', 'banned property name'), bad).toBe(true)
  }
})

typed('computed access: Math calls need the type layer', () => {
  for (const ok of ['xs[Math.floor(i)]', 'xs[(Math.min(i, 3))]']) {
    expect(simAll(`export const a = (xs: any[], o: any, i: number) => ${ok}\n`).filter(x => x.rule === 'banned-token'), ok).toEqual([])
  }
  // Math shadowed by a local is not the lib Math
  expect(hit(simAll('export const a = (xs: number[], Math: { floor(n: number): number }) => xs[Math.floor(1)]\n'), 'banned-token', 'computed access')).toBe(true)
})

test('computed property names are banned everywhere', () => {
  for (const src of [
    'export const a = (k: string) => ({ [k]: 1 })\n',
    'export const a = (o: { x: number }, k: "x") => { const { [k]: v } = o; return v }\n',
    'export class A { [Symbol.iterator]() { return 1 } }\n',
    "export const a = { ['x']: 1 }\n",
  ]) expect(hit(simAll(src), 'banned-token', 'computed access'), src).toBe(true)
})

test('round 2 probes: type-lies cannot open the index (probe: json-any literal key)', () => {
  const v = simAll("const k: 'length' = JSON.parse('\"constructor\"')\nexport const F = (() => 0)[k]\n")
  expect(hit(v, 'banned-token', 'computed access')).toBe(true)
})

test('round 2 probes: lying type predicate', () => {
  const v = simAll("const isLen = (s: string): s is 'length' => s.length > 0\nconst k = 'con' + 'structor'\nexport const pwn = () => { if (isLen(k)) { const F = (() => 0)[k]; return F } }\n")
  expect(hit(v, 'banned-token', 'computed access')).toBe(true)
})

test('round 2 probes: as-literal lie', () => {
  const v = simAll("const k = ('con' + 'structor') as 'length'\nexport const F = (() => 0)[k]\n")
  expect(hit(v, 'banned-token', 'computed access')).toBe(true)
})

test('import.meta is banned', () => {
  expect(hit(simAll('export const a = import.meta\n'), 'banned-token', 'import.meta')).toBe(true)
  expect(hit(simAll('export const a = import.meta.dir\n'), 'banned-token', 'import.meta')).toBe(true)
})

test('type suppression comments are banned (no types)', () => {
  for (const c of ['@ts-ignore', '@ts-expect-error', '@ts-nocheck']) {
    expect(hit(simSyn(`// ${c}\nexport const z: number = 'x'\n`), 'banned-token', c), c).toBe(true)
    expect(hit(simSyn(`/* ${c} */\nexport const z = 1\n`), 'banned-token', c), c).toBe(true)
  }
})

typed('type errors are violations', () => {
  const v = simAll("export const z: number = 'x'\n")
  expect(v.some(x => x.rule === 'type-error' && x.file.endsWith('/sim.ts') && x.detail.includes('TS2322'))).toBe(true)
  // implicit any is no-any
  expect(hit(simAll('export function g(o, k) { return o }\n'), 'no-any')).toBe(true)
  // a type error in the parseSave region counts too, one above the marker does not exist to be judged
  const { files, head } = fixture()
  files[`${P}hooks/save-store.ts`] += "\nexport const bad: number = 'x'\n"
  expect(run(files, head).some(x => x.rule === 'type-error')).toBe(true)
})

test('JSON results assigned to typed variables are fine', () => {
  expect(simAll("export type G = { a: number }\nexport const clone = (g: G): G => JSON.parse(JSON.stringify(g)) as G\n")).toEqual([])
})

test('no-any', () => {
  expect(hit(simAll('export const a = (x: any) => 1\n'), 'no-any')).toBe(true)
  expect(hit(simAll('export const a = (x: number) => x as any\n'), 'no-any')).toBe(true)
  expect(hit(simAll('export const a = (x: number) => <any>x\n'), 'no-any')).toBe(true)
  expect(hit(simAll('export const a = (x: number) => x as unknown\n'), 'no-any', 'as unknown')).toBe(true)
  expect(hit(simAll('export const a = (x: number): unknown => x\n'), 'no-any')).toBe(false)
})

test('banned property names in every position', () => {
  for (const name of ['constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']) {
    for (const src of [
      `export const a = (o: { ${name}: number }) => o.${name}\n`,
      `export const a = { '${name}': 1 }\n`,
      `export const a = { ['${name}']: 1 }\n`,
      `export const a = (o: { ${name}: number }) => { const { ${name}: x } = o; return x }\n`,
      `export const a = (o: { ${name}: number }) => { const { '${name}': x } = o; return x }\n`,
      `export const a = { ${name}: 1 }\n`,
    ]) {
      expect(hit(simAll(src), 'banned-token'), `${name}: ${src}`).toBe(true)
    }
  }
})

test('md files: only README.md and CHANGELOG.md at the plugin root; images only under assets/', () => {
  for (const p of ['commands/pwn.md', 'skills/arcade/SKILL.md', 'agents/x.md', 'hooks/notes.md', 'docs/README.md', 'assets/x.md', 'assets/x.svg', 'shot.png']) {
    expect(hit(withFileAll(p, 'x'), 'import-allowlist', 'unexpected file'), p).toBe(true)
  }
  for (const p of ['README.md', 'CHANGELOG.md', 'assets/a.png', 'assets/b.jpg', 'assets/c.gif', 'assets/d.webp', 'assets/sub/e.png']) {
    expect(withFileAll(p, 'x'), p).toEqual([])
  }
})

test('imports narrowed to the five shared modules', () => {
  for (const m of ['cells', 'envelope', 'overlay', 'shell', 'link']) {
    expect(sim(`import type * as m from './shared/${m}'\nexport type T = typeof m\n`), m).toEqual([])
  }
  for (const m of ['hooks-pane', 'hooks-link', 'cells.test']) {
    expect(rules(sim(`import * as m from './shared/${m}'\nexport default m\n`)), m).toEqual(['import-allowlist'])
  }
})

test('marketplace entry description: string, at most 200 chars', () => {
  const { files } = fixture()
  expect(rules(run(files, headWith([{ ...ENTRY, description: 'x'.repeat(201) }])))).toEqual(['marketplace-append'])
  expect(rules(run(files, headWith([{ ...ENTRY, description: 5 }])))).toEqual(['marketplace-append'])
  expect(rules(run(files, headWith([{ name: ID, source: `./plugins/${ID}` }])))).toEqual(['marketplace-append'])
  expect(run(files, headWith([{ ...ENTRY, description: 'x'.repeat(200) }]))).toEqual([])
})

test('the shared bundle must be complete, not just unchanged', () => {
  const { files, head } = fixture()
  delete files[`${P}hooks/shared/shell.tsx`]
  const v = run(files, head)
  expect(v.some(x => x.rule === 'scaffold-equal' && x.detail.includes('missing') && x.file.endsWith('shell.tsx'))).toBe(true)
})

test('--no-types: syntactic rules still run without the type layer', () => {
  const bad = `export const a = 1\nexport function f(x: any, xs: number[], k: string) { return [xs[k], fetch('x'), x] }\n`
  const { files, head } = fixture()
  files[`${P}hooks/sim.ts`] = bad
  const got = run(files, head, [], { types: false, vendorTypes: '/nonexistent/claude-code.d.ts' })
  expect(rulesAll(got)).toEqual(['banned-token', 'global-allowlist', 'no-any'])
  const clean = fixture()
  expect(run(clean.files, clean.head, [], { types: false, vendorTypes: '/nonexistent/claude-code.d.ts' })).toEqual([])
  const save = fixture()
  save.files[`${P}hooks/save-store.ts`] += '\nexport const z = eval("1")\n'
  expect(rulesAll(run(save.files, save.head, [], { types: false }))).toEqual(['banned-token', 'global-allowlist'])
})

test('without --no-types a missing vendor file is a hard error', () => {
  const { files, head } = fixture()
  expect(() => run(files, head, [], { types: true, vendorTypes: '/nonexistent/claude-code.d.ts' })).toThrow('vendor-types.sh')
})

// ---- final review fixes ----

test('without the type layer the global allowlist still catches reflection to Function', () => {
  const probe = 'export const F = Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(() => 0))).map(d => d.value).find(f => f.name.length === 8)\n'
  const { files, head } = fixture()
  files[`${P}hooks/sim.ts`] = probe
  const got = run(files, head, [], { types: false, vendorTypes: '/nonexistent/claude-code.d.ts' }).filter(x => x.file.endsWith('/sim.ts'))
  expect(got.some(x => x.rule === 'global-allowlist' && x.detail === 'Object')).toBe(true)
  // no type-error noise in that mode
  expect(got.some(x => x.rule === 'type-error')).toBe(false)
  // and a Math index call still resolves to the lib Math
  files[`${P}hooks/sim.ts`] = 'export const a = (xs: number[], i: number) => xs[Math.floor(i)]\n'
  expect(run(files, head, [], { types: false }).filter(x => x.file.endsWith('/sim.ts'))).toEqual([])
})

test('placeholders are rejected: TODO author, <YOUR NAME>, TODO descriptions', () => {
  const { files, head } = fixture()
  const pj = JSON.parse(files[`${P}.claude-plugin/plugin.json`]!)
  const put = (o: object): void => void (files[`${P}.claude-plugin/plugin.json`] = JSON.stringify(o))
  for (const name of ['TODO', ' todo ', '<YOUR NAME>', '<your name>']) {
    put({ ...pj, author: { name } })
    expect(rules(run(files, head)), name).toEqual(['author'])
  }
  put({ ...pj, description: 'TODO' })
  expect(rules(run(files, head))).toEqual(['author'])
  put(pj)
  expect(rules(run(files, headWith([{ ...ENTRY, description: ' todo ' }])))).toEqual(['marketplace-append'])
})

test('ids: single hyphens only, 3 to 31 chars', () => {
  for (const id of ['foo-', 'foo--bar', '-foo', 'ab', 'a'.repeat(32), 'Foo']) {
    const v = checkContribution({ changed: [`plugins/${id}/hooks/sim.ts`], read: () => '', baseMarketplace, headMarketplace: baseMarketplace, sharedFiles: [], types: false })
    expect(rules(v), id).toEqual(['one-plugin'])
  }
  expect(() => scaffoldFiles('foo-', 'X')).toThrow()
  expect(() => scaffoldFiles('foo--bar', 'X')).toThrow()
  expect(() => scaffoldFiles('a'.repeat(32), 'X')).toThrow()
  expect(Object.keys(scaffoldFiles('foo-bar2', 'X')).length).toBeGreaterThan(0)
})
