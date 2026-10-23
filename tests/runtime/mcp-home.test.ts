import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { spawnSync } from "node:child_process";
import { createMcpFixture, McpClient } from "../helpers/mcp.js";

describe("MCP Kimi-home resolution", () => {
  test("a relative KIMI_CODE_HOME resolves against the operation workspace", async () => {
    const fixture = await createMcpFixture("mcp-relative-home");
    fixture.env.KIMI_CODE_HOME = "kimi-home";
    fixture.env.KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH = path.join(fixture.data, "invocation.json");
    let client: McpClient | undefined;
    try {
      const setup = spawnSync(path.join(fixture.pluginRoot, "scripts/companion.sh"), ["setup"], {
        cwd: fixture.repo,
        env: fixture.env,
        encoding: "utf8",
      });
      expect(setup.status).toBe(0);
      client = await McpClient.legacy(fixture);
      const started = await client.request("tools/call", {
        name: "kimi_ask",
        arguments: { workspace: fixture.repo, prompt: "Prove relative home resolution", fresh: true },
      });
      const jobId = started.structuredContent.job_id as string;
      let result: any;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        result = await client.request("tools/call", { name: "kimi_job_result", arguments: { job_id: jobId } });
        if (result.structuredContent?.status && result.structuredContent.status !== "running") break;
        await Bun.sleep(100);
      }
      expect(result.isError).toBe(false);
      const invocation = JSON.parse(await readFile(fixture.env.KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH, "utf8"));
      expect(invocation.env.KIMI_CODE_HOME).toBe(path.join(fixture.repo, "kimi-home"));
    } finally {
      if (client) await client.close();
      await fixture.cleanup();
    }
  }, 60_000);
});
