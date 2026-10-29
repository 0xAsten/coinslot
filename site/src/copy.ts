export type CopyDeps = {
  clipboard?: { writeText(t: string): Promise<void> }
  execCopy(t: string): boolean
}

export async function copyCommand(text: string, deps: CopyDeps): Promise<boolean> {
  if (deps.clipboard) {
    try {
      await deps.clipboard.writeText(text)
      return true
    } catch {
      // fall through to execCommand
    }
  }
  try {
    return deps.execCopy(text)
  } catch {
    return false
  }
}
