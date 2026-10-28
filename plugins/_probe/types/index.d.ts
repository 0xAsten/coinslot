export type ProbeEntry = { t: number; event: string; detail: string; agentId?: string }

declare module 'claude-code' {
  interface PluginState {
    _probe: { log: Shaped<ProbeEntry[]> }
  }
}
