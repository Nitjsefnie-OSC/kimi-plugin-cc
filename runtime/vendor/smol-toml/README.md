# Vendored TOML parser

This directory contains the parser subset of `smol-toml@1.9.1`, under the
included BSD-3-Clause license. The JavaScript has no local modifications.
The plugin uses the internal context-based `parseKey`, `extractValue`, and
`skipVoid` interfaces to preserve config text. Public declarations are copied
from upstream; local declarations describe internal APIs upstream does not ship.

The EOF-comment guard for GHSA-7w5x-hrqm-74c2 is included upstream; no backport
is needed. The GHSA-r4xh-jqrq-34v2 quadratic key-scanning residual is closed by
this port. The linear-scaling regression exercises 2k, 8k and 32k key lines.

The development dependency also uses 1.9.1; it does not supply the shipped
parser. `bun audit` cannot see the vendored copy, so review future advisories
against both. `tests/runtime/toml-eof-comment.test.ts` checks this copy and both
shipped mirrors in child processes with a hard timeout.
