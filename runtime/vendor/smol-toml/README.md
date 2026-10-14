# Vendored TOML parser

This directory contains the parser subset of `smol-toml@1.6.1`, under the
included BSD-3-Clause license. The plugin uses its internal `parseKey`,
`extractValue`, and `skipVoid` interfaces when preserving existing config text.
Newer upstream releases changed those internal interfaces, so replacing this
copy requires a separate integration review.

Security patch: `util.js` includes the EOF-comment guard from upstream commit
[30f5c36](https://github.com/squirrelchat/smol-toml/commit/30f5c36), released in
1.7.1 for [GHSA-7w5x-hrqm-74c2](https://github.com/advisories/GHSA-7w5x-hrqm-74c2).
When an unfinished array or inline table ends with a comment without a newline,
`skipUntil` now throws instead of resetting its cursor and looping forever.
This is the only local change to the vendored JavaScript.

Known residual — [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2)
(moderate, published 2026-10-14, fixed upstream in 1.9.0): `parseKey` rescans
toward the end of the document on each key line, so `parse()` is quadratic in
the number of key lines. Measured on this copy 2026-10-15: 2k lines 2.3 ms,
8k lines 15.9 ms, 32k lines 229 ms (1.9.1: 1.5 / 2.6 / 8.0 ms). Bounded, not a
hang, and the only input is the operator's own `<KIMI_CODE_HOME>/config.toml`
(mode 0600), never repository content. Porting the 1.9.x `parseKey` changes
its `end` parameter from a string to a char code and reshapes its state
machine, which touches the `config-safety.ts` call sites — tracked as the next
integration review, not a hot patch.

The development dependency uses upstream 1.9.1 for round-trip tests;
it does not supply the shipped parser. `bun audit` scans that dependency but
cannot discover issues in this source copy. Review future parser advisories
against both. `tests/runtime/toml-eof-comment.test.ts` checks prompt rejection
in this copy and both shipped mirrors, in a child process with a hard timeout.
