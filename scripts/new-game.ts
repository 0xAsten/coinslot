import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const templates = join(import.meta.dir, 'templates')

export const MARKER = '// --- parseSave: game-specific below ---'

// Glue files the checker compares byte-for-byte against this scaffold (plugin-relative).
export const SCAFFOLDED = [
  '.claude-plugin/plugin.json',
  'hooks/hooks.json',
  'hooks/register.tsx',
  'hooks/link-apply.ts',
  'hooks/save-store.ts',
]

// plugin-relative path -> template file
const FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': 'plugin.json.tpl',
  'hooks/hooks.json': 'hooks.json.tpl',
  'hooks/register.tsx': 'register.tsx.tpl',
  'hooks/link-apply.ts': 'link-apply.ts.tpl',
  'hooks/save-store.ts': 'save-store.ts.tpl',
  'hooks/sim.ts': 'sim.ts.tpl',
  'hooks/render.ts': 'render.ts.tpl',
  'hooks/game.tsx': 'game.tsx.tpl',
  'hooks/showcase.ts': 'showcase.ts.tpl',
  'hooks/sim.test.ts': 'sim.test.ts.tpl',
  'types/index.d.ts': 'types.d.ts.tpl',
}

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

// Format only; the CLI also refuses an id that already exists.
export function scaffoldFiles(id: string, title: string): Record<string, string> {
  if (id.length < 3 || id.length > 31 || !ID.test(id)) throw new Error(`id must be 3-31 chars, lowercase letters, digits and single hyphens, starting with a letter: ${id}`)
  // the title lands inside single-quoted strings
  if (!title.trim() || /['\\\n\r]/.test(title)) throw new Error('title must be non-empty, without quotes, backslashes or newlines')

  const out: Record<string, string> = {}
  for (const [path, tpl] of Object.entries(FILES)) {
    const text = readFileSync(join(templates, tpl), 'utf8')
    out[`plugins/${id}/${path}`] = text.replaceAll('__ID__', () => id).replaceAll('__TITLE__', () => title)
  }

  return out
}

function main(): void {
  const [id, title] = process.argv.slice(2)
  if (!id || !title) {
    console.error('usage: bun run new-game <id> "<Title>"')
    process.exit(2)
  }
  try {
    const files = scaffoldFiles(id, title)
    if (existsSync(join(root, 'plugins', id))) throw new Error(`plugins/${id} already exists`)
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
  } catch (e) {
    console.error(`new-game: ${(e as Error).message}`)
    process.exit(1)
  }

  const marketPath = join(root, '.claude-plugin', 'marketplace.json')
  const market = JSON.parse(readFileSync(marketPath, 'utf8'))
  market.plugins.push({ name: id, source: `./plugins/${id}`, description: 'TODO' })
  writeFileSync(marketPath, JSON.stringify(market, null, 2) + '\n')

  const p = Bun.spawnSync(['bun', join(root, 'scripts', 'bundle-shared.ts'), `--plugin=${id}`], { cwd: root, stdout: 'inherit', stderr: 'inherit' })
  if (p.exitCode !== 0) process.exit(p.exitCode ?? 1)

  console.log(`\nCreated plugins/${id}. Next: edit hooks/{sim,render,game,showcase}.ts(x), fill description and author in`)
  console.log(`plugins/${id}/.claude-plugin/plugin.json and marketplace.json, then run: bun run check`)
}

if (import.meta.main) main()
