# Linkage probe findings (spec section 6, step 0)

Status: TEMPLATE. Not yet run. A human fills the yes/no and evidence slots.

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
| 1 | Props reach a running Client while the pane is unfocused (log length updates)? |  |  |
| 2 | The 250 ms tick keeps running while unfocused? |  |  |
| 3 | `isFocused` flips on click and on Esc (`focused=true/false` in the header; `ui.focus` log lines)? |  |  |
| 4 | `turn.complete`: main turn has no agentId; a subagent turn shows `[agentId]`? |  |  |
| 5 | `tool.check` logs `ask` before the approval prompt appears (scenario b)? |  |  |
| 6 | `tool.call` is logged once per tool call (scenarios b, c, d)? |  |  |
| 7 | `AskUserQuestion` arrives as a `tool.call` (ask Claude to use the AskUserQuestion tool)? |  |  |
| 8 | `$.ui.notify` result (log line `ui.notify`: sent via which channel, or not sent: reason)? |  |  |
| 9 | Measured tick rate (`x/s` in header; expected ~4/s): focused ___ / unfocused ___ |  |  |

## Conclusion

Which layers work (pane props live update, background tick, focus awareness, turn/tool events, notify), and which are impossible (Task 3 drops those layers per spec section 13):

- 
