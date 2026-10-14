# Field report: Kimi jobs timing out on repo-wide work (research-memex, October 14, 2026)

Status: **resolved in plugin 2.0.8 (same day)** — see the resolution note at the end. Originally: open, for the agents who maintain this plugin. Written by Claude (Opus 5.5) leading a
multi-model pre-release audit of `~/Documents/GitHub/research-memex`. The owner asked for
this note. Nothing here has been changed in the plugin.

Versions: plugin 2.0.6 (cache `~/.claude/plugins/cache/kimi-marketplace/kimi/2.0.6`),
kimi-code 2.1.1, engine native-v2.

## What happened

Three of six Kimi jobs failed on the fixed response budgets in `dist/kimi-timeouts.js`, each
after real work, and none returned partial output. Codex jobs of the same scope finished in
12 to 25 minutes.

| Job | Command | Started (UTC) | Ended | Error |
|---|---|---|---|---|
| `ee0c9e9b-cbd6-4e36-9d0d-6a7c778ee6a8` | `ask --background --fresh` (records audit, about 10 files) | 18:46:39 | 19:01:39 | `ASK_KIMI_RESPONSE_TIMEOUT`, "timed out after 900000ms (race detected post-result)" |
| `13d14393-22ef-463c-a1f6-3dec02fc571b` | `ask --background --fresh` (branch code review) | 18:55:46 | 19:10:46 | same, also "race detected post-result" |
| `6275990c-163e-42ca-860e-e5ae8e3b4210` | `task rescue --background --fresh` (design task in a clone: edit, render 61 images, iterate) | 19:04:26 | 19:34:27 | `RESCUE_KIMI_RESPONSE_TIMEOUT` (1,800,000 ms) |

Logs: `~/.claude/plugins/data/kimi-kimi-marketplace/kimi-plugin-cc/logs/{ask,rescue}-<id>.jsonl`
(118, 147 and 107 records). Artifacts: `.../artifacts/ask-<id>.md` (698 bytes, the error only).

Splitting the records audit into two narrower asks worked (both finished inside 15 minutes).

## Problems, in order of cost to the user

1. **No per-job budget on `ask`, `rescue` or `review`.** `pursue` and `swarm` take `--budget`;
   the single-turn commands are fixed at 15 and 30 minutes. Thinking-on Kimi on a repo-wide
   read can exceed both. Proposal: accept `--budget <dur>` on `ask`, `task rescue` and
   `review`, with the current constants as defaults.
2. **A timeout discards the work.** Each failed job had a long stream of records, but the
   artifact holds only the error. Proposal: on timeout, write the last assistant text from the
   stream log into the artifact, marked partial, so `result <id>` returns something usable.
3. **"race detected post-result" on both ask timeouts.** This reads as if a final result
   arrived at or after the deadline and was thrown away. Worth checking whether a result that
   lands during teardown can be kept.
4. **The error's advice is wrong for background jobs.** It says to "retry with --background to
   detach", but both asks were already `--background`. Proposal: when the job was already
   detached, suggest narrowing the prompt or raising the budget instead.
5. **`review` has no `--background` and rejects `--help`** ("Unknown flag --help for review"),
   so a caller cannot discover its flags or detach it. `ask --bogus` lists flags helpfully;
   `review` could do the same, and `--help` should print usage on every command.

## Upstream (kimi-code, not this plugin)

- `kimi --auto -p "..."` fails with "Cannot combine --prompt with --auto". Plain `kimi -p`
  does write files and run commands without prompting (checked in a scratch clone), so the
  workaround is to drop `--auto`, but the flag combination being rejected is surprising.

## The workaround the session used

For long work, the lead ran the kimi CLI directly in a remote-less clone under `~/.worktrees/`
(`timeout 5400 kimi -p "<task>" > .lane/kimi-run.log`) in a backgrounded shell, which has no
response cap. cc-fleet's `kimi-code` provider is the other route the owner suggested.

## Resolution (plugin 2.0.8, 2026-10-14)

- Root cause of problems 2 and 3 was one defect in `runtime/cli-client.ts`: `runCliPromptWithBudget` assumed the
  budget abort rejects the subprocess promise; it resolves with `aborted:true`, so every timeout reached the
  "race detected post-result" branch — the label was wrong on every timeout and the settled records were dropped.
  Fixed: the timeout error carries the partial result; ask/rescue/review/challenge write it into the failed job's
  artifact under a "partial output — NOT a final answer" section; a session id is kept only when Kimi announced it before the deadline — native v2 emits `session.resume_hint` at session end, so none of the three jobs above would have been resumable (their logs contain no hint); a follow-up may recover the id from the session directory.
  A non-aborted exit-0 result that settles in the same tick is returned as success; `settled_post_abort` keeps the diagnostic.
- Problem 1: `--budget <dur>` on ask, `task rescue`, review and challenge (24h ceiling; persisted per job; resumes inherit it).
  Defaults raised: ask 15m → 30m, rescue 30m → 45m; review/challenge stay 30m.
- Problem 4: timeout advice is context-aware; detached jobs are told to narrow scope or raise `--budget`, never to "retry with --background".
- Problem 5: `--help`/`-h` on every subcommand prints usage to stdout and exits 0. Review/challenge remain foreground-only by decision.
- Upstream note (`--auto` with `-p`): confirmed in 2.1.1/2.2.0 `options.ts`; the plugin never passes `--auto` (`-p` already auto-approves, which is why the hook is load-bearing). No plugin change.
- Related orchestration finding: a background job's completion is observable only via `status`/`result`; no notification reaches the caller (agents docs updated).
