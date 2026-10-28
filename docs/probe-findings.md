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

## Follow-up: the Client remounts when a dialog opens and closes

The author noticed the tick counter restart whenever Claude asked them something. The pasted header lines agree: `tick 941` → `tick 48` → `tick 215` at 3.9/s puts one remount at ~16:39:51 (inside the AskUserQuestion dialog, 16:39:43–16:40:03) and another at ~16:40:00 (as it closed). The tick lives in the Client's local state, so a reset means the engine dropped the instance and made a new one.

Consequence: a game that keeps its state only in the Client loses the run every time Claude asks a question, which is exactly the moment layer 1 pauses it. Each game must save a snapshot outside the Client (hooks-side `$.state`, fed by `surface.post`) and restore from it on mount.

The Bash call in scenario (b) ran without a prompt because the session was in auto mode, so no permission dialog was ever shown in this run; whether one also remounts the pane is untested (assume it does).

## reef-net live check (2026-10-28, build bcb7dff)

- `/reef` after a finished turn opens without a stale overlay (fix in bcb7dff).
- Pane `isFocused` reads false the whole time in the inline layout (debug readout `f:0`), so focus cannot gate play. The unfocused pause was dropped.
- AskUserQuestion: the engine **hides the pane while the dialog is up** and restores it afterwards. Coins survived the remount, so save/restore works. A `needs-you` overlay is never seen in time and was stale on return, so AskUserQuestion no longer pauses.
- Golden bonus fish could not be told apart from the yellow small fish, so they were redesigned.

Passed on c46fd20: bonus fish recognisable, done overlay at turn end, click/key resumes, coins survive the dialog.
