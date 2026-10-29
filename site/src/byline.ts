const MAX = 24

export function byline(name: string): string {
  const n = name.trim()
  return `by ${n.length > MAX ? n.slice(0, MAX) + '…' : n}`
}
