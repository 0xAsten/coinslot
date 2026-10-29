import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { MARKER, SCAFFOLDED, scaffoldFiles } from './new-game'

export type Violation = { file: string; rule: string; detail: string }
export type Input = {
  changed: string[]
  read(path: string): string
  baseMarketplace: string
  headMarketplace: string
  // file names in the repo's shared/ (the bundle every plugin must carry)
  sharedFiles: string[]
}

const MARKET = '.claude-plugin/marketplace.json'
const ID = /^[a-z][a-z0-9-]{2,30}$/
const HAND = new Set(['hooks/sim.ts', 'hooks/render.ts', 'hooks/game.tsx', 'hooks/showcase.ts'])
const TEST = /^hooks\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.test\.tsx?$/
const SHARED = /^hooks\/shared\/[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.tsx?$/
const IMAGE = /^assets\/(?:[^/]+\/)*[^/]+\.(?:png|jpe?g|gif|webp)$/
const DOCS = new Set(['README.md', 'CHANGELOG.md'])
const SHARED_IMPORT = /^\.\/shared\/(?:cells|envelope|overlay|shell|link)$/
const ALLOWED_GLOBALS = new Set(['Math', 'Number', 'Array', 'String', 'Boolean', 'Infinity', 'NaN', 'undefined', 'isFinite', 'isNaN', 'parseInt', 'parseFloat',
  // beyond the ruling: inert, and the scaffold and every shipped game use them (clone via JSON, pixel buffers)
  'JSON', 'Set', 'Map', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array',
])
const BANNED_PROPS = new Set(['constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'])
const VENDOR_TYPES = resolve(import.meta.dir, '..', 'vendor', 'claude-code.d.ts')
const SCAFFOLD_PATHS = [...SCAFFOLDED, 'types/index.d.ts']

// Whole identifiers, matched on the parsed tree, so comments and string text never count.
const BANNED = new Set([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'eval', 'globalThis', 'process', 'Bun', 'Deno',
  'navigator', 'localStorage', 'document', 'window', 'atob', 'require', 'fromCharCode',
  // beyond the plan: other ways to reach a global or build code from data
  'fromCodePoint', 'constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', 'global', 'self', 'Reflect', 'WebAssembly', 'Worker', 'importScripts',
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

function importOk(spec: string, isTest: boolean): boolean {
  if (spec === './sim' || spec === './render' || spec === 'claude-code') return true
  if (SHARED_IMPORT.test(spec)) return true
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

export type Typed = { sf: ts.SourceFile; program: ts.Program; checker: ts.TypeChecker; own(sf: ts.SourceFile): boolean }

const SAFE_BINARY = new Set([
  ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.BarToken, ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.CaretToken, ts.SyntaxKind.LessThanLessThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanToken, ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken, ts.SyntaxKind.AsteriskAsteriskToken,
])

// Index safety is syntactic: types are unsound, so only forms that cannot yield a banned string count.
function safeIndex(e: ts.Expression, typed?: Typed): boolean {
  while (ts.isParenthesizedExpression(e)) e = e.expression
  if (ts.isNumericLiteral(e)) return true
  if (ts.isStringLiteral(e)) return !BANNED_PROPS.has(e.text)
  if (ts.isPrefixUnaryExpression(e)) return e.operator === ts.SyntaxKind.PlusToken || e.operator === ts.SyntaxKind.MinusToken || e.operator === ts.SyntaxKind.TildeToken
  if (ts.isBinaryExpression(e)) return SAFE_BINARY.has(e.operatorToken.kind)
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && ts.isIdentifier(e.expression.expression) && e.expression.expression.text === 'Math' && typed) {
    const decls = typed.checker.getSymbolAtLocation(e.expression.expression)?.declarations ?? []

    return decls.length > 0 && decls.every(d => !typed.own(d.getSourceFile()))
  }

  return false
}

function inTypePosition(n: ts.Node): boolean {
  for (let a: ts.Node | undefined = n.parent; a && !ts.isStatement(a) && !ts.isSourceFile(a); a = a.parent) {
    if (ts.isExpressionWithTypeArguments(a) && ts.isHeritageClause(a.parent) && a.parent.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(a.parent.parent)) return false
    if (ts.isTypeNode(a)) return true
  }

  return false
}

// A free identifier is one that is not a property name, label, or part of an import.
function isFree(n: ts.Identifier): boolean {
  const p = n.parent
  if (!p) return false
  if (ts.isPropertyAccessExpression(p) && p.name === n) return false
  if (ts.isQualifiedName(p) && p.right === n) return false
  if (ts.isBindingElement(p) && p.propertyName === n) return false
  if (ts.isJsxAttribute(p) || ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === n && /^[a-z]/.test(n.text)) return false
  for (let a: ts.Node | undefined = p; a; a = a.parent) if (ts.isImportDeclaration(a) || ts.isExportDeclaration(a) || ts.isImportEqualsDeclaration(a)) return false

  return !inTypePosition(n)
}

function typedChecks(file: string, n: ts.Node, t: Typed, out: Violation[]): void {
  const { checker, own } = t
  if (ts.isIdentifier(n) && isFree(n)) {
    const sym = n.parent && ts.isShorthandPropertyAssignment(n.parent) ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n)
    const decls = sym?.declarations ?? []
    if (!decls.some(d => own(d.getSourceFile())) && !ALLOWED_GLOBALS.has(n.text)) out.push(v(file, 'global-allowlist', n.text))
  }
  if (n.kind === ts.SyntaxKind.AnyKeyword) out.push(v(file, 'no-any', 'any'))
  if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && n.type.kind === ts.SyntaxKind.UnknownKeyword) out.push(v(file, 'no-any', 'as unknown'))
  if (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword)) out.push(v(file, 'global-allowlist', 'declare'))
}

// Scan one hand-written source. With `typed`, also run the type-aware allowlist layer.
// `minPos` skips everything before it (the scaffolded half of save-store.ts).
export function scanSource(file: string, text: string, isTest: boolean, typed?: Typed, minPos = 0): Violation[] {
  const out: Violation[] = []
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = typed?.sf ?? ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, kind)
  const diags = (sf as unknown as { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics
  if (diags.length > 0) out.push(v(file, 'banned-token', 'syntax error'))
  if (sf.referencedFiles.length + sf.typeReferenceDirectives.length + sf.libReferenceDirectives.length > 0) out.push(v(file, 'global-allowlist', 'reference directive'))

  const suppress = /@ts-(?:ignore|expect-error|nocheck)/.exec(text.slice(minPos))
  if (suppress) out.push(v(file, 'banned-token', suppress[0]))
  if (typed) {
    for (const d of [...typed.program.getSyntacticDiagnostics(sf), ...typed.program.getSemanticDiagnostics(sf)]) {
      if ((d.start ?? 0) < minPos) continue
      const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ')
      out.push(v(file, d.code >= 7000 && d.code < 8000 ? 'no-any' : 'type-error', `TS${d.code}: ${msg}`))
    }
  }

  const checkSpec = (spec: string, typeOnly: boolean | null): void => {
    if (!importOk(spec, isTest)) out.push(v(file, 'import-allowlist', spec))
    else if (spec === 'claude-code' && typeOnly === false) out.push(v(file, 'type-only-claude-code', 'value import from claude-code'))
  }

  const visit = (n: ts.Node): void => {
    if (n.end <= minPos) return
    if (typed) typedChecks(file, n, typed, out)
    if (ts.isStringLiteralLike(n) && BANNED_PROPS.has(n.text) && !(n.parent && ts.isImportDeclaration(n.parent))) {
      out.push(v(file, 'banned-token', `banned property name ${n.text}`))
    }
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
      if (!safeIndex(n.argumentExpression, typed)) out.push(v(file, 'banned-token', 'computed access'))
    } else if (ts.isComputedPropertyName(n)) {
      out.push(v(file, 'banned-token', 'computed access'))
    } else if (ts.isMetaProperty(n) && n.keywordToken === ts.SyntaxKind.ImportKeyword) {
      out.push(v(file, 'banned-token', 'import.meta'))
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

const libCache = new Map<string, ts.SourceFile>()

// One in-memory program over the plugin's files, the vendored claude-code types and lib es2023.
function buildProgram(vdir: string, files: Map<string, string>): ts.Program {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    lib: ['lib.es2023.d.ts'],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: ts.JsxEmit.React,
    jsxFactory: 'h',
    jsxFragmentFactory: 'Fragment',
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const virt = (f: string): string | undefined => files.get(f)
  host.fileExists = f => files.has(f) || ts.sys.fileExists(f)
  host.readFile = f => virt(f) ?? ts.sys.readFile(f)
  host.directoryExists = d => [...files.keys()].some(k => k.startsWith(d.endsWith('/') ? d : `${d}/`)) || ts.sys.directoryExists(d)
  host.getSourceFile = (f, lang) => {
    const t = virt(f)
    if (t !== undefined) return ts.createSourceFile(f, t, lang, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const hit = libCache.get(f)
    if (hit) return hit
    const disk = ts.sys.readFile(f)
    if (disk === undefined) return undefined
    const sf = ts.createSourceFile(f, disk, lang, true)
    libCache.set(f, sf)

    return sf
  }

  return ts.createProgram({ rootNames: [VENDOR_TYPES, ...files.keys()], options, host })
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
  if (typeof e.description !== 'string' || e.description.length > 200) return 'entry description must be a string of at most 200 characters'
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

  let regionStart = -1
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
        regionStart = got.length - g.region.length
      }
    } else if (got !== w) out.push(v(file, 'scaffold-equal', 'differs from scaffold'))
  }
  // Everything the type-aware layer needs, as virtual files under one root.
  const vdir = `/__contribution__/${id}/`
  const files = new Map<string, string>()
  const add = (rel: string): void => {
    const t = tryRead(read, dir + rel)
    if (t !== null && /\.(ts|tsx)$/.test(rel)) files.set(vdir + rel, t)
  }
  for (const rel of SCAFFOLD_PATHS) add(rel)
  const sharedExpected: string[] = []
  for (const name of input.sharedFiles) {
    const src = tryRead(read, `shared/${name}`)
    if (src !== null && !src.startsWith('// @host-only')) sharedExpected.push(name)
  }
  for (const name of sharedExpected) add(`hooks/shared/${name}`)
  for (const p of changed) {
    const rel = p.slice(dir.length)
    if (HAND.has(rel) || TEST.test(rel) || SHARED.test(rel)) add(rel)
  }
  const program = buildProgram(vdir, files)
  const checker = program.getTypeChecker()
  const typedFor = (rel: string): Typed | undefined => {
    const sf = program.getSourceFile(vdir + rel)

    return sf ? { sf, program, checker, own: f => f.fileName.startsWith(vdir) } : undefined
  }

  if (regionStart >= 0) {
    const file = `${dir}hooks/save-store.ts`
    const t = typedFor('hooks/save-store.ts')
    if (t) out.push(...scanSource(file, t.sf.text, false, t, regionStart))
  }

  // the bundle must carry exactly shared/'s files, changed or not
  for (const name of sharedExpected) {
    const p = `${dir}hooks/shared/${name}`
    const got = tryRead(read, p)
    if (got === null) out.push(v(p, 'scaffold-equal', 'missing from the shared bundle'))
    else if (got !== tryRead(read, `shared/${name}`)) out.push(v(p, 'scaffold-equal', `differs from shared/${name}`))
  }

  const scaffolded = new Set(SCAFFOLD_PATHS.map(p => dir + p))
  for (const p of changed) {
    if (p === MARKET || scaffolded.has(p)) continue
    const rel = p.slice(dir.length)
    if (HAND.has(rel) || TEST.test(rel)) {
      const t = typedFor(rel)
      if (t) out.push(...scanSource(p, t.sf.text, TEST.test(rel), t))
    } else if (SHARED.test(rel)) {
      if (!sharedExpected.includes(rel.slice('hooks/shared/'.length))) out.push(v(p, 'scaffold-equal', 'not in shared/'))
    } else if (DOCS.has(rel) || IMAGE.test(rel)) {
      // inert: root README/CHANGELOG and images under assets/
    } else out.push(v(p, 'import-allowlist', 'unexpected file'))
  }

  const seen = new Set<string>()

  return out.filter(x => {
    const k = `${x.file}|${x.rule}|${x.detail}`
    if (seen.has(k)) return false
    seen.add(k)

    return true
  })
}

function git(root: string, args: string[]): string {
  const p = Bun.spawnSync(['git', '-C', root, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  if (p.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${p.stderr.toString().trim()}`)

  return p.stdout.toString()
}

// Files come from --root (the PR checkout, default cwd); templates and vendored types
// come from wherever this script lives, so CI runs main's copy against a PR it never executes.
function main(): void {
  const argv = process.argv.slice(2)
  const ri = argv.indexOf('--root')
  const root = resolve(ri >= 0 ? (argv[ri + 1] ?? '') : process.cwd())
  const baseRef = argv.filter((_, i) => i !== ri && i !== ri + 1 || ri < 0)[0]
  if (!baseRef || (ri >= 0 && !argv[ri + 1])) {
    console.error('usage: bun scripts/check-contribution.ts [--root <dir>] <baseRef>')
    process.exit(2)
  }
  const range = `${baseRef}...HEAD`
  const changed = git(root, ['diff', '--no-renames', '--name-only', '-z', range]).split('\0').filter(Boolean)
  const sharedDir = resolve(root, 'shared')
  const violations = checkContribution({
    changed,
    read: p => readFileSync(resolve(root, p), 'utf8'),
    baseMarketplace: git(root, ['show', `${baseRef}:${MARKET}`]),
    headMarketplace: readFileSync(resolve(root, MARKET), 'utf8'),
    sharedFiles: readdirSync(sharedDir).filter(f => /\.tsx?$/.test(f)),
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
