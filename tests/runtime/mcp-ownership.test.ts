import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { JobStore } from "../../runtime/job-store.js";
import { resolveRepoIdentity } from "../../runtime/git.js";
import { resolvePluginPaths } from "../../runtime/paths.js";
import { createMcpFixture, McpClient } from "../helpers/mcp.js";
import { cleanupTestPath, createGitRepoFixture } from "../helpers/test-env.js";

describe("MCP task ownership and data-root isolation", () => {
  test("another repository, a nested cwd, and an arbitrary CLI job cannot be read through MCP", async () => {
    const first = await createMcpFixture("mcp-owner-first", { delayMs: "30000" });
    const secondRepo = await createGitRepoFixture("mcp-owner-second");
    const nested = path.join(first.repo, "nested");
    await mkdir(nested);
    let client: McpClient | undefined;
    try {
      client = await McpClient.legacy(first);
      const started = await client.request("tools/call", {
        name: "kimi_ask",
        arguments: { workspace: first.repo, prompt: "Keep this job private", fresh: true },
      });
      const jobId = started.structuredContent.job_id as string;
      for (const [workspace, code] of [[secondRepo, "MCP_WORKSPACE_OUTSIDE_DEFAULT"], [nested, "JOB_NOT_FOUND"]] as const) {
        const denied = await client.request("tools/call", {
          name: "kimi_job_status",
          arguments: { job_id: jobId, workspace },
        });
        expect(denied.isError).toBe(true);
        expect(denied.structuredContent.error.code).toBe(code);
      }

      const foreground = spawnSync(path.join(first.pluginRoot, "scripts/companion.sh"), ["ask", "--fresh", "Create a CLI-only job"], {
        cwd: first.repo,
        env: { ...first.env, KIMI_PLUGIN_CC_MOCK_DELAY_MS: "0" },
        encoding: "utf8",
      });
      expect(foreground.status).toBe(0);
      const store = new JobStore(resolvePluginPaths(first.env));
      let cliJobId: string | undefined;
      try {
        const repo = await resolveRepoIdentity(first.repo);
        cliJobId = store.findLatestJob({ repoId: repo.repoId, commandType: "ask", terminalOnly: true })?.job_id;
      } finally {
        store.close();
      }
      expect(cliJobId).toBeDefined();
      expect(cliJobId).not.toBe(jobId);
      const denied = await client.request("tools/call", {
        name: "kimi_job_status",
        arguments: { job_id: cliJobId, workspace: first.repo },
      });
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent.error.code).toBe("JOB_NOT_FOUND");

      const cancelled = await client.request("tools/call", {
        name: "kimi_job_cancel",
        arguments: { job_id: jobId },
      });
      expect(cancelled.structuredContent.cancellation.status).toBe("cancelled");
    } finally {
      if (client) await client.close();
      await first.cleanup();
      await cleanupTestPath(secondRepo);
    }
  }, 60_000);

  test("conflicting shared data roots fail before store access or model launch", async () => {
    const fixture = await createMcpFixture("mcp-data-conflict");
    const other = path.join(fixture.data, "other-data");
    const env: NodeJS.ProcessEnv = { ...fixture.env, CLAUDE_PLUGIN_DATA: path.join(fixture.data, "shared-a"), PLUGIN_DATA: other };
    delete env.KIMI_PLUGIN_CC_DATA;
    try {
      const result = spawnSync(path.join(fixture.pluginRoot, "scripts/companion.sh"), ["mcp"], {
        cwd: fixture.repo,
        env,
        encoding: "utf8",
        input: "",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("PLUGIN_DATA_CONFLICT");
      expect(existsSync(other)).toBe(false);
      expect(existsSync(path.join(fixture.data, "shared-a"))).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  }, 30_000);
});
