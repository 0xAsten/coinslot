import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const checkOnly = process.argv.includes('--check')
const only = process.argv.find(a => a.startsWith('--plugin='))?.slice(9)

const sharedDir = join(root, 'shared')
const shared = existsSync(sharedDir) ? readdirSync(sharedDir).filter(f => f.endsWith('.ts')) : []
const pluginsDir = join(root, 'plugins')
const plugins = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      .map(d => d.name)
      .filter(n => !only || n === only)
  : []

let drift = 0
for (const name of plugins) {
  const dest = join(pluginsDir, name, 'hooks', 'shared')
  for (const file of shared) {
    const src = readFileSync(join(sharedDir, file), 'utf8')
    const target = join(dest, file)
    if (checkOnly) {
      if (!existsSync(target) || readFileSync(target, 'utf8') !== src) {
        console.error(`bundle: plugins/${name}/hooks/shared/${file} differs from shared/${file}`)
        drift += 1
      }
    } else {
      mkdirSync(dest, { recursive: true })
      writeFileSync(target, src)
    }
  }
}

if (drift > 0) {
  console.error('run `bun run bundle` to refresh')
  process.exit(1)
}
console.log(checkOnly ? 'bundle: in sync' : `bundle: ${shared.length} file(s) -> ${plugins.length} plugin(s)`)
