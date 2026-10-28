import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const pluginsDir = join(root, 'plugins')
const names = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : []

if (names.length === 0) {
  console.log('no plugins')
  process.exit(0)
}

function run(plugin: string, step: string, cmd: string[], okOnNoTests = false): void {
  const p = Bun.spawnSync(cmd, { cwd: root, stdout: 'pipe', stderr: 'pipe' })
  const out = p.stdout.toString() + p.stderr.toString()
  if (p.exitCode !== 0) {
    if (okOnNoTests && /no test files|no tests found|no \*\.test\.ts/i.test(out)) {
      console.log(`  ${step}: no tests (ok)`)
      return
    }
    console.error(out)
    console.error(`FAIL ${plugin}: ${step}`)
    process.exit(1)
  }
  console.log(`  ${step}: ok`)
}

for (const name of names) {
  const dir = join(pluginsDir, name)
  console.log(name)

  // _probe is a throwaway and never carries shared/; every other plugin, including
  // the _shared-tests host, must be in sync.
  if (name !== '_probe') {
    run(name, 'bundle --check', ['bun', 'scripts/bundle-shared.ts', '--check', `--plugin=${name}`])
  }
  run(name, 'validate', ['claude', 'plugin', 'validate', dir])

  const laid = join(dir, '.claude-plugin', 'types', 'tsconfig.json')
  if (existsSync(laid)) {
    run(name, 'tsc', ['npx', '-y', '-p', 'typescript@5.9.3', 'tsc', '-p', laid])
  } else {
    if (!existsSync(join(root, 'vendor', 'claude-code.d.ts'))) {
      console.error('FAIL ' + name + ': tsc: vendor/claude-code.d.ts missing; run scripts/vendor-types.sh')
      process.exit(1)
    }
    const tmp = join(tmpdir(), `coinslot-tsconfig-${name}-${process.pid}.json`)
    writeFileSync(
      tmp,
      JSON.stringify({
        extends: join(root, 'tsconfig.check.json'),
        include: [join(root, 'vendor', 'claude-code.d.ts'), join(dir, 'hooks'), join(dir, 'types')],
      }),
    )
    try {
      run(name, 'tsc', ['npx', '-y', '-p', 'typescript@5.9.3', 'tsc', '-p', tmp])
    } finally {
      rmSync(tmp, { force: true })
    }
  }

  // shared/ is not a plugin, so `claude plugin test` cannot reach its tests. The
  // _shared-tests plugin carries the bundled copy (shared/*.test.ts included) and
  // runs them where claude-code/testing resolves; it ships in no marketplace entry.
  run(name, 'test', ['claude', 'plugin', 'test', dir], true)
}
console.log('check: all ok')
