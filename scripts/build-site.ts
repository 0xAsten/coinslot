import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolveSiteUrl } from './site-url'

const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1)
}

const deploy = process.argv.includes('--deploy')
let siteUrl: string
try {
  siteUrl = resolveSiteUrl(process.env.SITE_URL, deploy)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}

rmSync('site/dist', { recursive: true, force: true })
sh(['bun', 'scripts/record-loops.ts', 'site/dist/loops'])
sh(['bun', 'build', 'site/src/main.ts', '--outdir', 'site/dist', '--target', 'browser', '--minify'])
sh(['bun', 'scripts/og-image.ts', 'site/dist/loops', 'site/dist/og.png'])
writeFileSync('site/dist/index.html', readFileSync('site/index.html', 'utf8').replaceAll('%SITE_URL%', siteUrl))
copyFileSync('site/src/style.css', 'site/dist/style.css')
copyFileSync('site/favicon.svg', 'site/dist/favicon.svg')
