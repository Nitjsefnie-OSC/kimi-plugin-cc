import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

// Execute shipped JS under Node, not Bun's .js -> .ts resolution. The stdout
// refusal has no stderr fallback: losing it makes a busy session opaque.
test("compiled distributions preserve the stdout-only CLI refusal", () => {
  for (const root of ["./dist", "./plugins/kimi-codex/dist"]) {
    const script = `
      import assert from 'node:assert/strict';
      import { StreamJsonParser } from '${root}/stream-json.js';
      import { assertCliResultSuccess } from '${root}/commands/cli-helpers.js';
      const raw = {type:'error', code:'session.occupied', message:'Session is in use',
        details:{holder:{token:'do-not-persist'},sessionId:'not-a-resume-hint'}};
      const [outcome] = new StreamJsonParser().push(JSON.stringify(raw) + '\\n');
      assert.equal(outcome.record, undefined);
      assert.equal(outcome.cliError.code, 'session.occupied');
      const result = {exitCode:4,aborted:false,signal:null,records:[],malformed:[],
        stderrTail:'',cliError:outcome.cliError};
      assert.throws(() => assertCliResultSuccess(result, 'ask.runtime'), error => {
        assert.equal(error.code, 'CLI_NONZERO_EXIT');
        assert.equal(error.details.cli_error.code, 'session.occupied');
        assert.match(error.message, /Session is in use/);
        assert.ok(!JSON.stringify(error).includes('do-not-persist'));
        return true;
      });
    `;
    const result = spawnSync("node", ["--input-type=module", "-e", script], {
      cwd: process.cwd(), encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  }
});
