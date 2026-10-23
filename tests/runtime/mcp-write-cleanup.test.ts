import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";

import { resolveRepoIdentity } from "../../runtime/git.js";
import { resolvePluginPaths } from "../../runtime/paths.js";
import { createMcpFixture, McpClient } from "../helpers/mcp.js";

describe("MCP write-operation cancellation cleanup", () => {
  test("pursue keeps its identity and write-swarm captures then removes its worktree", async () => {
    const fixture = await createMcpFixture("mcp-write-cleanup", { delayMs: "30000" });
    let client: McpClient | undefined;
    try {
      client = await McpClient.legacy(fixture);
      for (const [name, args, operation] of [
        ["kimi_pursue", { objective: "Cancel an autonomous goal" }, "pursue"],
        ["kimi_swarm_write", { objective: "Cancel a worktree run", cap: 1, max_concurrency: 1 }, "swarm-write"],
      ] as const) {
        const started = await client.request("tools/call", {
          name,
          arguments: { ...args, workspace: fixture.repo },
        });
        const jobId = started.structuredContent.job_id as string;
        const cancelled = await client.request("tools/call", {
          name: "kimi_job_cancel",
          arguments: { job_id: jobId },
        });
        expect(cancelled.isError).toBe(false);
        const result = await client.request("tools/call", {
          name: "kimi_job_result",
          arguments: { job_id: jobId },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent.status).toBe("cancelled");
        expect(result.structuredContent.operation_kind).toBe(operation);
        if (operation === "swarm-write") {
          const paths = resolvePluginPaths(fixture.env);
          const repo = await resolveRepoIdentity(fixture.repo);
          const worktree = path.join(paths.worktreesDir, repo.repoId, `swarm-write-${jobId}`);
          const patch = path.join(paths.artifactsDir, `swarm-write-${jobId}.patch`);
          expect(existsSync(patch)).toBe(true);
          expect(existsSync(worktree)).toBe(false);
        }
      }
    } finally {
      if (client) await client.close();
      await fixture.cleanup();
    }
  }, 60_000);
});
