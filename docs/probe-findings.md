# Linkage probe findings (spec section 6, step 0)

Status: RUN 2026-10-28 16:37–16:41 local, Claude Code 2.1.312, author's terminal (inline layout, auto permission mode), probe hot-loaded from dev-mods.

## How to run

1. In `/Users/hanlynn/Projects/my/coinslot`: `bun run check` (must pass).
2. Start a real session with the probe loaded:
   `claude --plugin-dir /Users/hanlynn/Projects/my/coinslot/plugins/_probe`
3. Run `/probe`. A pane opens with a header line `tick N (x/s) focused=...` and a live event log.
4. Do each scenario below, watching the pane (and take notes on timestamps):
   - (a) Click the pane, then press Esc.
   - (b) Ask Claude for a task that runs a Bash command needing approval (for example "run `touch /tmp/probe-test` with Bash"). Do not answer the prompt for a few seconds; look at the log.
   - (c) Ask Claude for a task that spawns a subagent (for example "use the Explore agent to list files in this repo").
   - (d) Ask a plain question that needs no tools.
5. While the pane is NOT focused (chat focused), watch whether `tick` keeps counting and `focused=` and the log update.
6. Paste evidence (log lines, tick/fps header) into the slots below.

## Checklist

| # | Question | yes/no | Evidence |
|---|----------|--------|----------|
| 1 | Props reach a running Client while the pane is unfocused (log length updates)? | yes | `focused=false`, `props.log length` 19 → 28 while chat had focus |
| 2 | The 250 ms tick keeps running while unfocused? | yes | `tick 941 (3.9/s) focused=false` |
| 3 | `isFocused` flips on click and on Esc (`focused=true/false` in the header; `ui.focus` log lines)? | yes | header showed `focused=true` then `focused=false`; no `ui.focus` lines captured in the pasted excerpt |
| 4 | `turn.complete`: main turn has no agentId; a subagent turn shows `[agentId]`? | yes | `turn.complete answer` vs `turn.complete answer [ac69cc775a9370409]` |
| 5 | `tool.check` logs `ask` before the approval prompt appears (scenario b)? | **unusable as a 'needs you' signal** | `ask` appears where no person was ever prompted: `SubagentHandback -> ask`, subagent `Bash -> ask` (auto mode approved it silently), `AskUserQuestion -> ask`. Per the type docs tool.check fires *before the mode settles an ask*, so `ask` ≠ a prompt was shown. Scenario (b) itself never prompted (auto mode). |
| 6 | `tool.call` is logged once per tool call (scenarios b, c, d)? | yes | one line each: `Bash`, `SubagentHandback`, `AskUserQuestion`; subagent calls carry `[agentId]` |
| 7 | `AskUserQuestion` arrives as a `tool.call` (ask Claude to use the AskUserQuestion tool)? | yes | `16:39:43.644 tool.call AskUserQuestion` (main, no agentId) |
| 8 | `$.ui.notify` result (log line `ui.notify`: sent via which channel, or not sent: reason)? | not sent | `ui.notify not sent: no-channel` every time — author has no `preferredNotifChannel` configured |
| 9 | Measured tick rate (`x/s` in header; expected ~4/s): focused 3.9 / unfocused 3.9 | yes | no throttling when unfocused; 30 fps game tick still unmeasured (reef-net plays smoothly by eye) |

## Conclusion

Which layers work (pane props live update, background tick, focus awareness, turn/tool events, notify), and which are impossible (Task 3 drops those layers per spec section 13):

- **Layer 1, "Claude is done": works.** Main `turn.complete` (no agentId) reaches a running, unfocused Client within the same second.
- **Layer 1, "Claude needs you": partly.** `AskUserQuestion` tool.call (main) is a reliable signal. Permission prompts have no reliable signal yet — `tool.check -> ask` fires for calls that never prompt. Dropped for now (spec §13: ship what works); revisit if a later probe finds the permission dialog's own render event.
- **Layer 2, bonuses on tool calls: works.** One `tool.call` per tool; filter to main turns or count subagent calls too (they are Claude working).
- **Focus-pause: works.** `isFocused` reaches the Client; the tick keeps running unfocused, so the game must skip `step` itself.
- **System notification: works only if the user configured a channel.** `no-channel` here. Keep the call (silent when unsent) and document `preferredNotifChannel` in the README. 
