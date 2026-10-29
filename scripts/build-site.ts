import { copyFileSync, rmSync } from 'node:fs'

const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1)
}

rmSync('site/dist', { recursive: true, force: true })
sh(['bun', 'scripts/record-loops.ts', 'site/dist/loops'])
sh(['bun', 'build', 'site/src/main.ts', '--outdir', 'site/dist', '--target', 'browser', '--minify'])
copyFileSync('site/index.html', 'site/dist/index.html')
copyFileSync('site/src/style.css', 'site/dist/style.css')
