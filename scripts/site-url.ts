export function resolveSiteUrl(raw: string | undefined, deploy: boolean): string {
  const url = raw?.trim().replace(/\/+$/, '')
  if (!url) {
    if (deploy) throw new Error('SITE_URL is required for a deploy build')
    console.warn('warning: SITE_URL unset, using http://localhost:4173')
    return 'http://localhost:4173'
  }
  if (/[\s?#]/.test(url)) throw new Error(`SITE_URL must not contain whitespace, ? or #, got "${url}"`)
  if (deploy) {
    if (!/^https:\/\/[^/]+/.test(url)) {
      throw new Error(`SITE_URL must be an https:// URL for a deploy build, got "${url}"`)
    }
  } else if (!/^https:\/\/[^/\s]+/.test(url) && !/^http:\/\/localhost(:\d+)?$/.test(url)) {
    throw new Error(`SITE_URL must be https:// or http://localhost[:port], got "${url}"`)
  }
  return url
}
