import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// A synchronous parse regression must not hang the test runner. Run the actual
// vendored modules under Node with an OS-enforced timeout, including both
// committed distribution copies that zero-build plugin installs execute.
// 1.9.1 changes the diagnostic and returns null-prototype tables; the malformed
// inputs, prompt-rejection contract, child timeout and mirror coverage are unchanged.
describe("GHSA-7w5x-hrqm-74c2: EOF comments in unfinished TOML structures", () => {
  for (const modulePath of [
    "../../runtime/vendor/smol-toml/parse.js",
    "../../dist/vendor/smol-toml/parse.js",
    "../../plugins/kimi-codex/dist/vendor/smol-toml/parse.js",
  ]) {
    test(modulePath, () => {
      const moduleUrl = new URL(modulePath, import.meta.url).href;
      const script = `
        import assert from 'node:assert/strict';
        import { parse } from ${JSON.stringify(moduleUrl)};
        for (const malformed of ['a=[1 #', 'a={b=1 #', 'a=[1 #\\r']) {
          assert.throws(() => parse(malformed), /expected comma or end of structure|control characters are not allowed in comments/);
        }
        assert.deepEqual({ ...parse('a=[1 # comment\\n]') }, { a: [1] });
        assert.deepEqual({ ...parse('a=1 # EOF comment') }, { a: 1 });
      `;
      const result = spawnSync("node", ["--input-type=module", "--eval", script], {
        encoding: "utf8",
        timeout: 2_000,
        killSignal: "SIGKILL",
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    });
  }
});
