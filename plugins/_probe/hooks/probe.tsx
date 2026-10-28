import type { ClientSurface, JsonValue } from 'claude-code'

type Entry = { t: number; event: string; detail: string; agentId?: string }
type State = { frames: number; start: number; fps: number }
type Props = { log: Entry[]; focused: boolean }

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

function fmt(l: Entry): string {
  const d = new Date(l.t)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`

  return `${time} ${l.event} ${l.detail}${l.agentId ? ` [${l.agentId}]` : ''}`.replace(/\s+/g, ' ')
}

const fit = (text: string, cols: number) => (text.length > cols ? `${text.slice(0, cols - 1)}…` : text)

export default function Probe(props: JsonValue, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  const { log, focused } = props as unknown as Props

  if (surface.state === undefined) {
    const state: State = { frames: 0, start: Date.now(), fps: 0 }
    surface.every(250, () => {
      state.frames += 1
      state.fps = state.frames / Math.max(0.001, (Date.now() - state.start) / 1000)
      surface.setState({ ...state })
    })
    surface.setState(state)

    return <Text dimColor>probe starting</Text>
  }

  const s = surface.state
  const room = Math.max(1, surface.rows - 2)
  const cols = Math.max(10, surface.columns)
  const lines = log.slice(-room)

  return (
    <Box flexDirection="column">
      <Text bold>
        tick {s.frames} ({s.fps.toFixed(1)}/s) focused={String(focused)}
      </Text>
      <Text dimColor>props.log length {log.length}</Text>
      {lines.map(l => (
        <Text>{fit(fmt(l), cols)}</Text>
      ))}
    </Box>
  )
}
