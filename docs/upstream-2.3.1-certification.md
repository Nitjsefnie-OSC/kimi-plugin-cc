# Kimi Code 2.3.1 certification evidence — 2026-10-23

## Scope and exact source

Candidate: `@moonshot-ai/kimi-code@2.3.1`, release commit
`684bae9ea6a437f3bae98bba1dcb797a917d500b`, compared with certified 2.3.0
(`b5e28fd6beac752a2cdcc0ff2f5fdf40e6494fbb`). GitHub published the release at
2026-10-23T07:31:22Z; npm `latest` is 2.3.1. The candidate binary was installed
separately with npm. The operator's installed CLI and host plugin pins were not
changed.

Status: the exact-tag scan, plan-ON/OFF controls, and all 15 operation smoke
tests passed. The production matrix now includes exact 2.3.1 for all eight
operations. Repository and release validation are recorded separately below
before publication. Plugin 2.3.1 deliberately aligns its number with the CLI;
that number is not compatibility evidence.

The morning monitor reported no release newer than 2.3.0. The later 2.3.1 npm
and GitHub releases supersede that snapshot and triggered this audit.

## Source review

Four independent reviews covered the hook/no-plan construction, stream-json,
CLI/config/bootstrap, and adversarial reachability. All returned
`COMPAT-PRESERVED` at source-audit level. Reports are retained locally under
`.claude/kimi-code-research/reports/2026-10-23-2.3.1-*.md`.

- CLI print mode, before-execute/permission gates, external hooks, and
  plan/restore are byte-identical to 2.3.0. All 15 load-bearing audit hashes
  are unchanged. The sole final `event.allow()` remains the active plan-file
  guard, and no new plan-arming vector or stream execution-outcome field was
  found.
- Workspace trust moved into an App-scoped store. It still combines the
  environment override with persisted trust; the plugin still strips
  `KIMI_CODE_TRUST_WORKSPACE` on every spawn. Trust-read failures propagate
  and can suppress initial MCP loading, an availability/diagnostics change,
  not a trust fail-open. Legacy migration can recognize more old path
  spellings and enable project MCP for those already trusted canonical roots.
- Session locking adds `KIMI_CODE_SESSION_LOCK=0` and explicit TUI/SDK/REST
  takeover paths. Print mode reports occupancy with exit 4 and never takes
  over. These changes affect concurrency, not permission or plan enforcement.
  The existing prohibition on concurrent clients and the statement that
  upstream locks are not security boundaries remain in force.
- POSIX lock contention can execute bare `ps` with inherited PATH and cwd
  outside PreToolUse. A PATH containing the workspace is therefore part of
  the internal-helper trust boundary. This is not a model tool call; errors
  retain the occupied refusal rather than failing open into concurrent writes.
- The raw occupied-session record can include holder details, now with an
  optional display name. The plugin continues to discard `details` and retain
  only bounded code/message diagnostics, never holder metadata, prose, or
  session lineage. Existing compiled parser tests and a supplemental
  holder-shape probe passed.

## Verification

- Frozen dependency install: `bun install --frozen-lockfile`, no changes.
- Exact-tag scan: **15 pass, 0 fail, 92 assertions**. All 15 load-bearing
  source files are byte-identical to the certified 2.3.0 pins.
- Plan-ON control: exit 0 in 30.4 seconds; first marker 2.3.1; Glob reached
  the deny hook, one 1006-byte plan file was written, no Write payload reached
  the hook. The journal contains the required `plan_mode.enter` precondition.
- Plan-OFF ordinary Write: exit 0 in 9.1 seconds; Write reached the deny hook,
  the target is absent, and no plan file exists. Plan-OFF EnterPlanMode: exit
  0 in 9.5 seconds; the tool reached the deny hook and no plan file exists.
- The controls used an explicitly authorized Kimi Agent Key only in process
  environment, the documented `https://api.kimi.com/coding/v1` endpoint and
  `kimi-for-coding` model. Empty isolated seed homes contained no personal
  config or OAuth stores. Initial missing-model and wrong-endpoint attempts
  produced no tool calls and are not treated as compatibility evidence; the
  documented coding endpoint was then used for the successful controls.
- Reviewed exact 2.3.1 hook schema: **76 setup tests, 0 fail**. Engine routing
  after the production table addition: **18 tests, 0 fail**. Stream/parser
  compatibility review: **148 tests, 0 fail**, plus the holder-shape probe.
- Operation smoke: **15 pass, 0 fail, 84 assertions in 324.53 seconds**, no
  skips. Goal confinement ran 8 turns and paused at its 120-second budget with
  no target files written. Both pursue terminal paths passed using the new
  `/goal -- <objective>` prompt form. Read-only swarm denied its child write.
  Write-swarm produced a **278-byte patch**, left the user tree clean, removed
  its worktree, and denied the child out-of-root write. The exact candidate
  seam was used before the production table was extended.
- Dependency audit: no vulnerabilities found.

Local source evidence: `.claude/kimi-code-research/reports/2026-10-23-2.3.1-*.md`.
The candidate binary and temporary control/smoke homes were isolated under the
repository's gitignored `.tmp/`; no host setup or CLI pin was changed.

## Post-certification implementation review

- Internal adversarial review identified four prompt/scope/metadata issues; all
  were fixed and rechecked. Normalized-code comparison confirmed that 20
  comment-only files retained identical executable code after comment stripping.
- Independent Claude and Codex reviews then found the write-swarm capture
  lifecycle and base-scope edge cases. Capture failure now fails the job and
  retains the worktree with its path in error details; timeout and cancellation
  keep their original terminal status. The `--base` fallback compares committed
  `HEAD`, not dirty working-tree files. Final re-reviews confirmed all findings
  resolved.
- Regression coverage includes ordinary capture failure, timeout, cancellation,
  successful cleanup and summary preservation, untracked-only base dirt,
  tracked dirty-base snapshots, and a forced three-dot failure. The candidate
  smoke's pursue lanes used the new `/goal -- <objective>` prompt form.

## Repository and release validation

- Frozen dependency install and dependency audit passed. A byte-for-byte
  comparison of every changed file, including both generated distributions and
  this evidence document, matched the isolated validation copy at
  `.tmp/release-2.3.1-validation.CMwk2o`.
- Full `bun run check` on that exact isolated tree: **1,134 pass, 28 opt-in
  skips, 0 fail, 14,752 assertions in 136.93 seconds**. The original Documents
  checkout had one installed-data timing failure; its isolated test passed at
  23.86 seconds under the unchanged 30-second limit. No assertions or timeouts
  were relaxed.
- Package validation: **passed**, 196 packed files, both compiled
  distributions, isolated hook setup/check and unsupported-version refusal.
  CI and publication results are recorded below after they complete.
