import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { MARKER, SCAFFOLDED, scaffoldFiles } from './new-game'

export type Violation = { file: string; rule: string; detail: string }
export type Input = {
  changed: string[]
  read(path: string): string
  baseMarketplace: string
  headMarketplace: string
}

const MARKET = '.claude-plugin/marketplace.json'
const ID = /^[a-z][a-z0-9-]{2,30}$/
const HAND = new Set(['hooks/sim.ts', 'hooks/render.ts', 'hooks/game.tsx', 'hooks/showcase.ts'])
const TEST = /^hooks\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.test\.tsx?$/
const SHARED = /^hooks\/shared\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.tsx?$/
const IMAGE = /^assets\/(?:[^/]+\/)*[^/]+\.(?:png|jpe?g|gif|webp)$/
const SCAFFOLD_PATHS = [...SCAFFOLDED, 'types/index.d.ts']

// Whole identifiers, matched on the parsed tree, so comments and string text never count.
const BANNED = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'eval', 'globalThis', 'process', 'Bun', 'Deno',
  'navigator', 'localStorage', 'document', 'window', 'atob', 'require', 'fromCharCode',
  // beyond the plan: other ways to reach a global or build code from data
  'fromCodePoint', 'constructor', '__proto__', 'global', 'self', 'Reflect', 'WebAssembly', 'Worker', 'importScripts',
])

const v = (file: string, rule: string, detail: string): Violation => ({ file, rule, detail })

function canon(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
  }
  return JSON.stringify(x)
}

function tryRead(read: Input['read'], path: string): string | null {
  try {
    return read(path)
  } catch {
    return null
  }
}

function hasStringLiteral(n: ts.Node): boolean {
  if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) return true
  return ts.forEachChild(n, hasStringLiteral) ?? false
}

function importOk(spec: string, isTest: boolean): boolean {
  if (spec === './sim' || spec === './render' || spec === 'claude-code') return true
  if (/^\.\/shared\/[A-Za-z0-9_-]+$/.test(spec)) return true
  return isTest && spec === 'claude-code/testing'
}

function typeOnlyImport(n: ts.ImportDeclaration): boolean {
  const c = n.importClause
  if (!c) return false
  if (c.isTypeOnly) return true
  const nb = c.namedBindings
  return !c.name && !!nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every(e => e.isTypeOnly)
}

function typeOnlyExport(n: ts.ExportDeclaration): boolean {
  if (n.isTypeOnly) return true
  const c = n.exportClause
  return !!c && ts.isNamedExports(c) && c.elements.length > 0 && c.elements.every(e => e.isTypeOnly)
}

// Scan one hand-written source for every rule that lives in the code itself.
export function scanSource(file: string, text: string, isTest: boolean): Violation[] {
  const out: Violation[] = []
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, kind)
  const diags = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics
  if (diags.length > 0) out.push(v(file, 'banned-token', 'syntax error'))

  const checkSpec = (spec: string, typeOnly: boolean | null): void => {
    if (!importOk(spec, isTest)) out.push(v(file, 'import-allowlist', spec))
    else if (spec === 'claude-code' && typeOnly === false) out.push(v(file, 'type-only-claude-code', 'value import from claude-code'))
  }

  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const name = n.text
      if (n.getText(sf).includes('\\')) out.push(v(file, 'banned-token', `unicode escape in identifier ${name}`))
      if (name === '$') out.push(v(file, 'no-dollar', '$'))
      else if (name === 'Function') {
        // `Function` as a type annotation is harmless; anything else can build code
        if (!(n.parent && ts.isTypeReferenceNode(n.parent))) out.push(v(file, 'banned-token', name))
      } else if (BANNED.has(name)) out.push(v(file, 'banned-token', name))
    } else if (ts.isElementAccessExpression(n)) {
      if (ts.isIdentifier(n.expression) && n.expression.text === '$') out.push(v(file, 'no-bracket-dollar', '$[...]'))
      if (hasStringLiteral(n.argumentExpression)) out.push(v(file, 'banned-token', 'computed access'))
    } else if (ts.isComputedPropertyName(n)) {
      if (hasStringLiteral(n.expression)) out.push(v(file, 'banned-token', 'computed access'))
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      out.push(v(file, 'banned-token', 'import('))
    } else if (ts.isImportTypeNode(n)) {
      out.push(v(file, 'banned-token', 'import('))
    } else if (ts.isImportDeclaration(n)) {
      if (ts.isStringLiteral(n.moduleSpecifier)) checkSpec(n.moduleSpecifier.text, typeOnlyImport(n))
    } else if (ts.isExportDeclaration(n)) {
      if (n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) checkSpec(n.moduleSpecifier.text, typeOnlyExport(n))
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      out.push(v(file, 'banned-token', 'require('))
      const e = n.moduleReference.expression
      out.push(v(file, 'import-allowlist', ts.isStringLiteral(e) ? e.text : 'require'))
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)

  return out
}

// The part of save-store.ts after the marker line is the contributor's.
function splitSave(text: string): { head: string; region: string } | null {
  const i = text.indexOf(MARKER)
  if (i < 0) return null
  const nl = text.indexOf('\n', i)

  return { head: text.slice(0, i + MARKER.length), region: nl < 0 ? '' : text.slice(nl + 1) }
}

const OPENED_LINE = /^\s*opened: (?:'[^'\\\r\n`]*'|"[^"\\\r\n`]*"),?\s*$/

function checkRegister(file: string, got: string, want: string): string | null {
  const a = got.split('\n')
  const idx = a.flatMap((l, i) => (/^\s*opened:/.test(l) ? [i] : []))
  if (idx.length !== 1) return 'expected exactly one opened: line'
  if (!OPENED_LINE.test(a[idx[0]!]!)) return 'opened: must be a single plain string literal'
  const w = want.split('\n')
  const wi = w.findIndex(l => /^\s*opened:/.test(l))
  a[idx[0]!] = '__OPENED__'
  w[wi] = '__OPENED__'

  return a.join('\n') === w.join('\n') ? null : 'differs from scaffold'
}

function checkPluginJson(got: string, want: string): { scaffold: string | null; author: boolean } {
  let g: Record<string, unknown>
  try {
    g = JSON.parse(got)
  } catch {
    return { scaffold: 'not valid JSON', author: true }
  }
  if (!g || typeof g !== 'object' || Array.isArray(g)) return { scaffold: 'not an object', author: true }
  const { author, description, ...rest } = g
  const { author: _a, description: _d, ...wantRest } = JSON.parse(want) as Record<string, unknown>
  void _a
  void _d
  const name = author && typeof author === 'object' && !Array.isArray(author) ? (author as Record<string, unknown>).name : undefined
  const authorOk = typeof name === 'string' && name.trim() !== ''
  const authorShape = !!author && typeof author === 'object' && !Array.isArray(author) && Object.values(author).every(x => typeof x === 'string')
  let scaffold: string | null = null
  if (canon(rest) !== canon(wantRest)) scaffold = 'differs from scaffold outside description/author'
  else if (typeof description !== 'string') scaffold = 'description must be a string'
  else if (author !== undefined && !authorShape) scaffold = 'author fields must be strings'

  return { scaffold, author: authorOk }
}

function checkMarketplace(id: string, baseText: string, headText: string): string | null {
  let b: { plugins?: unknown[] } & Record<string, unknown>
  let h: { plugins?: unknown[] } & Record<string, unknown>
  try {
    b = JSON.parse(baseText)
    h = JSON.parse(headText)
  } catch {
    return 'marketplace.json is not valid JSON'
  }
  if (!Array.isArray(b.plugins) || !Array.isArray(h.plugins)) return 'plugins must be an array'
  const { plugins: bp, ...bRest } = b
  const { plugins: hp, ...hRest } = h
  if (canon(bRest) !== canon(hRest)) return 'top-level fields changed'
  if (hp!.length !== bp!.length + 1) return `expected exactly one new entry, got ${hp!.length - bp!.length}`
  for (let i = 0; i < bp!.length; i++) if (canon(bp![i]) !== canon(hp![i])) return `existing entry ${i} changed or moved`
  const e = hp![hp!.length - 1] as Record<string, unknown> | null
  if (!e || typeof e !== 'object') return 'new entry is not an object'
  if (e.name !== id) return `entry name must be ${id}`
  if (e.source !== `./plugins/${id}`) return `entry source must be ./plugins/${id}`
  const extra = Object.keys(e).filter(k => !['name', 'source', 'description'].includes(k))
  if (extra.length > 0) return `unexpected entry keys: ${extra.join(', ')}`

  return null
}

export function checkContribution(input: Input): Violation[] {
  const out: Violation[] = []
  const { changed, read } = input

  const ids = new Set<string>()
  for (const p of changed) {
    if (p === MARKET) continue
    const m = /^plugins\/([^/]+)\/.+/.exec(p)
    const sane = !p.split('/').some(s => s === '' || s === '.' || s === '..') && !p.includes('\\')
    if (!m || !sane || !ID.test(m[1]!)) out.push(v(p, 'one-plugin', 'outside plugins/<id>/'))
    else ids.add(m[1]!)
  }
  if (ids.size > 1) out.push(v([...ids].join(', '), 'one-plugin', 'more than one plugin'))
  if (ids.size === 0 && out.length === 0) out.push(v(MARKET, 'one-plugin', 'no plugin changed'))
  if (ids.size !== 1 || out.length > 0) return out

  const id = [...ids][0]!
  const dir = `plugins/${id}/`

  try {
    const base = JSON.parse(input.baseMarketplace) as { plugins?: { name?: string; source?: string }[] }
    if ((base.plugins ?? []).some(p => p.name === id || p.source === `./plugins/${id}`)) {
      return [v(dir, 'new-plugin-only', 'plugin already exists; edits to existing games are for the author')]
    }
  } catch {
    out.push(v(MARKET, 'marketplace-append', 'base marketplace.json is not valid JSON'))
  }

  const bad = checkMarketplace(id, input.baseMarketplace, input.headMarketplace)
  if (bad) out.push(v(MARKET, 'marketplace-append', bad))

  // scaffold-equal. The title is recovered from register.tsx's `title:` line.
  const regText = tryRead(read, `${dir}hooks/register.tsx`)
  const title = regText === null ? null : /^\s*title: '([^'\\\r\n]*)',\s*$/m.exec(regText)?.[1] ?? null
  let want: Record<string, string> | null = null
  if (title === null) out.push(v(`${dir}hooks/register.tsx`, 'scaffold-equal', 'cannot recover title'))
  else {
    try {
      want = scaffoldFiles(id, title)
    } catch (e) {
      out.push(v(`${dir}hooks/register.tsx`, 'scaffold-equal', `cannot rebuild scaffold: ${(e as Error).message}`))
    }
  }

  let region: { file: string; text: string } | null = null
  for (const rel of SCAFFOLD_PATHS) {
    const file = dir + rel
    const got = tryRead(read, file)
    if (got === null) {
      out.push(v(file, 'scaffold-equal', 'missing'))
      continue
    }
    if (rel === '.claude-plugin/plugin.json') {
      const r = checkPluginJson(got, want ? want[file]! : '{}')
      if (want && r.scaffold) out.push(v(file, 'scaffold-equal', r.scaffold))
      if (!r.author) out.push(v(file, 'author', 'author.name must be non-empty'))
      continue
    }
    if (!want) continue
    const w = want[file]!
    if (rel === 'hooks/register.tsx') {
      const d = checkRegister(file, got, w)
      if (d) out.push(v(file, 'scaffold-equal', d))
    } else if (rel === 'hooks/save-store.ts') {
      const g = splitSave(got)
      const s = splitSave(w)!
      if (!g) out.push(v(file, 'scaffold-equal', 'parseSave marker is missing'))
      else {
        if (g.head !== s.head) out.push(v(file, 'scaffold-equal', 'differs from scaffold above the parseSave marker'))
        region = { file, text: g.region }
      }
    } else if (got !== w) out.push(v(file, 'scaffold-equal', 'differs from scaffold'))
  }
  if (region) out.push(...scanSource(region.file, region.text, false))

  const scaffolded = new Set(SCAFFOLD_PATHS.map(p => dir + p))
  for (const p of changed) {
    if (p === MARKET || scaffolded.has(p)) continue
    const rel = p.slice(dir.length)
    if (HAND.has(rel) || TEST.test(rel)) {
      const text = tryRead(read, p)
      if (text !== null) out.push(...scanSource(p, text, TEST.test(rel)))
    } else if (SHARED.test(rel)) {
      const name = rel.slice('hooks/shared/'.length)
      const got = tryRead(read, p)
      const src = tryRead(read, `shared/${name}`)
      if (got === null) continue
      if (src === null) out.push(v(p, 'scaffold-equal', 'not in shared/'))
      else if (src.startsWith('// @host-only')) out.push(v(p, 'scaffold-equal', 'host-only shared file'))
      else if (got !== src) out.push(v(p, 'scaffold-equal', `differs from shared/${name}`))
    } else if (rel.endsWith('.md') || IMAGE.test(rel)) {
      // docs and images are inert
    } else out.push(v(p, 'import-allowlist', 'unexpected file'))
  }

  return out
}

function git(root: string, args: string[]): string {
  const p = Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  if (p.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr.toString().trim()}`)

  return p.stdout.toString()
}

// Reads the checkout in the cwd; templates come from wherever this script lives,
// so CI can run it from the base branch while the PR is checked out.
function main(): void {
  const baseRef = process.argv[2]
  if (!baseRef) {
    console.error('usage: bun scripts/check-contribution.ts <baseRef>')
    process.exit(2)
  }
  const root = process.cwd()
  const range = `${baseRef}...HEAD`
  const changed = git(root, ['diff', '--no-renames', '--name-only', '-z', range]).split('\0').filter(Boolean)
  const violations = checkContribution({
    changed,
    read: p => readFileSync(resolve(root, p), 'utf8'),
    baseMarketplace: git(root, ['show', `${baseRef}:${MARKET}`]),
    headMarketplace: readFileSync(resolve(root, MARKET), 'utf8'),
  })

  // symlinks (120000) and submodules (160000) can point anywhere
  for (const line of git(root, ['diff', '--no-renames', '--raw', range]).split('\n')) {
    const m = /^:(\d+) (\d+) \S+ \S+ \S+\t(.+)$/.exec(line)
    if (m && [m[1], m[2]].some(x => x === '120000' || x === '160000')) violations.push(v(m[3]!, 'import-allowlist', 'symlink or submodule'))
  }

  for (const x of violations) console.log(`${x.file}: [${x.rule}] ${x.detail}`)
  if (violations.length > 0) {
    console.log(`\n${violations.length} violation(s)`)
    process.exit(1)
  }
  console.log('contribution check: clean')
}

if (import.meta.main) main()
