const MAX = 24

export function byline(name: string): string {
  const chars = Array.from(name.trim())

  return `by ${chars.length > MAX ? chars.slice(0, MAX).join('') + '…' : chars.join('')}`
}
