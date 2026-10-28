import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const checkOnly = process.argv.includes('--check')
const only = process.argv.find(a => a.startsWith('--plugin='))?.slice(9)

const sharedDir = join(root, 'shared')
const HOST = '_shared-tests'
const allShared = existsSync(sharedDir) ? readdirSync(sharedDir).filter(f => /\.tsx?$/.test(f)) : []
// A test whose first line is `// @host-only` needs files only the host plugin has
// (the dummy game), so it is bundled into _shared-tests alone.
const hostOnly = (f: string) => readFileSync(join(sharedDir, f), 'utf8').startsWith('// @host-only')
const sharedFor = (name: string) => allShared.filter(f => name === HOST || !hostOnly(f))
const pluginsDir = join(root, 'plugins')
const plugins = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_probe')
      .map(d => d.name)
      .filter(n => !only || n === only)
  : []

let drift = 0
for (const name of plugins) {
  const dest = join(pluginsDir, name, 'hooks', 'shared')
  // files left in a bundle after leaving shared/ are orphans
  const shared = sharedFor(name)
  const orphans = existsSync(dest) ? readdirSync(dest).filter(f => !shared.includes(f)) : []
  for (const file of orphans) {
    if (checkOnly) {
      console.error(`bundle: plugins/${name}/hooks/shared/${file} is not in shared/`)
      drift += 1
    } else {
      rmSync(join(dest, file), { force: true })
    }
  }
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
console.log(checkOnly ? 'bundle: in sync' : `bundle: ${allShared.length} file(s) -> ${plugins.length} plugin(s)`)
