# Kimi Code 2.3.0 certification evidence — 2026-10-22

## Scope and exact source

Candidate: `@moonshot-ai/kimi-code@2.3.0`, release commit
`b5e28fd6beac752a2cdcc0ff2f5fdf40e6494fbb`, compared with certified 2.2.0
(`472192c34c1efad89a369870eff0da0b708ce9bb`). npm published the candidate at
2026-10-21T05:55:55.979Z. The candidate binary was installed separately with
npm; the operator's plugin pin remains 2.2.0. Plugin 2.2.2 ships this
certification without changing host setup.

Status: source scan, exact-binary controls and operation smoke passed. The
checkout matrix now includes exact 2.3.0 for all eight operations; full
repository and package validation passed on a byte-verified isolated copy.
Release follow-through uses plugin version 2.2.2, independently of CLI 2.3.0.

## Source review and monitor correction

Four independent source reviews covered the hook contract, stream-json,
CLI/config/bootstrap, and adversarial reachability. The source no-plan
construction is preserved; stream review identified the diagnostic change
implemented below. Evidence is retained locally under
`.claude/kimi-code-research/reports/2026-10-22-2.3.0-*.md`.

The morning monitor called stale-session reload a fix-first blocker. That
conclusion was too strong: the report did not account for the already accepted
trusted-state assumption in [provenance §2](native-v2-certification-provenance.md#2-native-v2-entry-gate).

- `run-v2-print.ts` now wraps its run in `reloadOnStale()`. A stale error closes
  and resumes the session, restores `auto` permission mode, and retries once.
- `sessionRunGateService.ts` checks for externally modified wire journals.
  Reload restores the same `agents/<id>/wire.jsonl` records already covered by
  the plugin's raw taint scan; there is no additional plan-state source or
  model-reachable plan writer. The dispatcher serializes late attachments;
  `readRestoreChains()` still derives both passes from the same journal.
- A different client could modify that journal after the plugin preflight.
  This is a real check-to-use limitation, already present before the initial
  resume in prior versions. Operator config and journals were explicitly
  trusted before this audit. No new in-boundary exploit was demonstrated.
- No speculative parent watcher/rescan was added: it cannot make an upstream
  in-process reload atomic. Do not concurrently operate on or edit a managed
  session from another client. The new upstream lock is not claimed as a
  security fix: publication can fail open and stale detection is length-based.
- The exact print runner, reload helper and run gate now have audit hash pins,
  alongside updated wire/dispatcher pins. A later semantic change requires
  another review, not a blind hash refresh.

## Other changed surfaces

- The sole final `event.allow()` remains the active plan-file guard at
  `features/plan/planService.ts:110`. Plan config, tools, event type strings,
  before-execute gate, external hook schema and deny/aggregation semantics
  are unchanged. `EnterPlanMode`/`ExitPlanMode` remain denied by every label.
- External hook processes now use the session CWD. Print mode still binds
  that CWD to the process and rejects resume CWD mismatch; the plugin still
  uses its trusted environment root, not hook payload CWD, for writes.
- `btw` installs its deny-only policy at child scope creation. The DI core and
  AgentSwarm implementation are unchanged; eager per-agent external hooks and
  hard concurrency export remain intact. Dynamic tool listing filters
  availability; no new final allow was introduced.
- Normal stream records and goal exit statuses remain compatible. The new
  role-less `session.occupied` error is stdout-only and exits 4. The plugin now
  retains bounded code/message diagnostics, never holder metadata, prose or
  session lineage. It preserves marker-first verification and nonzero-exit
  semantics, exposing the reason in `CLI_NONZERO_EXIT.details.cli_error`.
- Hook-escape findings remain detection-only: 2.3.0 still supplies no
  execution-outcome field that distinguishes executed tools from refusals.
- Hook-schema recognition includes exact 2.3.0 only. Schema recognition alone
  does not authorize model execution. Legacy `KIMI_TESTED_MINORS` stays at 0.41.

## Verification

- Frozen dependency install: `bun install --frozen-lockfile`, no changes.
- Exact-tag scan: **15 pass, 0 fail, 92 assertions**.
- Plan-ON control: exit 0 in 19.69 seconds; first marker 2.3.0; Glob reached
  the deny hook, one 801-byte plan file was written, no Write payload reached
  the hook. Its journal contains one `plan_mode.enter` record (the ON
  precondition); both OFF journals contain zero.
- Plan-OFF ordinary Write: exit 0 in 10.20 seconds; Write reached the deny
  hook, target absent, no plan file.
- Plan-OFF EnterPlanMode: exit 0 in 12.70 seconds; tool reached the deny hook,
  no plan file.
- Controls used the explicitly authorized Kimi Agent Keys credential against
  the coding API endpoint, held only in process environment. Empty isolated
  homes, no personal config or OAuth stores, no paid retries. Captured output
  was credential-redacted before being retained. All three control homes
  and the empty smoke seed were removed; smoke removes each per-lane home.
- Focused parser/client/schema regressions: **220 pass, 0 fail**. A separate
  Node regression executes both emitted distributions and preserves the
  stdout-only refusal (**1 pass, 0 fail**).
- Operation smoke: **15 pass, 0 fail, 84 assertions in 316.41 seconds**, no
  skips or paid retries. Goal confinement ran 15 turns and paused at its
  120-second budget, with no target files written. Both pursue terminal paths
  passed. Read-only swarm denied its child write. Write-swarm produced a
  **278-byte patch**, left the user tree clean, removed its worktree, and
  denied the child out-of-root write. The exact candidate seam was used
  before the checkout certification table was extended.
- Final `bun run check`: **1,104 pass, 28 opt-in skips, 0 fail, 14,452
  assertions in 111.28 seconds**, including build, generated surfaces,
  typecheck and drift gate. The tag scan and live smoke skipped by the ordinary
  suite were run separately above.
- Validation location caveat: the original Documents checkout had two full
  runs with installed-data fixture timeouts (first: 1,102 pass / 2 fail;
  second: 1,103 pass / 1 fail). The unchanged four-test fixture passed alone;
  a timed first-launch probe completed in 2.49 seconds. To separate location
  effects, 381 source/distribution files were SHA-256 verified against an
  isolated temporary Git clone, dependencies installed frozen, and the full
  check run there. All four installed-data cases passed in 0.21–1.21 seconds.
  No runtime changes, assertion removal, or timeout increase were used to
  obtain green. The failing logs and snapshot hash manifest are retained.
- Package validation: **passed**, 196 packed files, both distributions
  byte-verified, isolated hook setup/check and unsupported-version refusal.
  This initial certification tarball used the pre-release-bump version 2.2.1;
  it is validation evidence, not the 2.2.2 release artifact.
- Post-edit code review: no actionable defects. Document review reconciled
  the four source reports, control summaries, smoke counts and exact-version
  rows. Its two unreleased-status wording fixes were applied.

Local live evidence: `.claude/kimi-code-research/cert-2.3.0-live/`.
The user subsequently authorized commit, push and release as plugin 2.2.2.
The final versioned build is validated separately before publication.

## Plugin 2.2.2 release validation

After explicit release authorization, the version surfaces and manifest hashes
were updated and both host distributions regenerated. Frozen dependencies and
`bun audit` passed. A fresh 381-file SHA-256-matched temporary checkout passed
`bun run check`: **1,104 pass, 28 opt-in skips, 0 fail, 14,452 assertions in
110.55 seconds**. The versioned package gate passed: **196 files**, both compiled
distributions, isolated setup/check and unsupported-version refusal. The only
subsequent changes before the release commit are this evidence addendum and the
manual smoke workflow's recommended/default CLI version (2.3.0); runtime and
package bytes are unchanged from that validation. CI validates the final commit
before tagging; the release workflow validates the immutable tag before npm.
No further paid calls were made, and no host installation or pin was changed.
