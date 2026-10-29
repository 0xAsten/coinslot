import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const sh = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1)
}

const deploy = process.argv.includes('--deploy')
let siteUrl = process.env.SITE_URL?.replace(/\/+$/, '')
if (!siteUrl) {
  if (deploy) {
    console.error('SITE_URL is required for a deploy build')
    process.exit(1)
  }
  console.warn('warning: SITE_URL unset, using http://localhost:4173')
  siteUrl = 'http://localhost:4173'
}

rmSync('site/dist', { recursive: true, force: true })
sh(['bun', 'scripts/record-loops.ts', 'site/dist/loops'])
sh(['bun', 'build', 'site/src/main.ts', '--outdir', 'site/dist', '--target', 'browser', '--minify'])
sh(['bun', 'scripts/og-image.ts', 'site/dist/loops', 'site/dist/og.png'])
writeFileSync('site/dist/index.html', readFileSync('site/index.html', 'utf8').replaceAll('%SITE_URL%', siteUrl))
copyFileSync('site/src/style.css', 'site/dist/style.css')
copyFileSync('site/favicon.svg', 'site/dist/favicon.svg')
