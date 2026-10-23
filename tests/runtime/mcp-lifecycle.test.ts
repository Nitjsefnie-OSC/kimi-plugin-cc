import { describe, expect, test } from "bun:test";

import { createMcpFixture, McpClient, modernMeta } from "../helpers/mcp.js";

describe("MCP supervised job lifecycle", () => {
  test("Claude task start, polling, result, and restart recovery", async () => {
    const fixture = await createMcpFixture("mcp-modern", { delayMs: "1000" });
    let client: McpClient | undefined;
    try {
      client = await McpClient.modern(fixture);
      const started = await client.request("tools/call", {
        name: "kimi_ask",
        arguments: { workspace: fixture.repo, prompt: "Explain the job store" },
        _meta: modernMeta(),
      });
      expect(started.resultType).toBe("task");
      expect(started.status).toBe("working");
      expect(started.ttlMs).toBeNull();

      const taskId = started.taskId as string;
      let view: any;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        view = await client.request("tasks/get", { taskId, _meta: modernMeta() });
        if (view.status !== "working") break;
        await Bun.sleep(100);
      }
      expect(view.resultType).toBe("complete");
      expect(view.status).toBe("completed");
      expect(view.result.isError).toBe(false);
      expect(view.result.content[0].text).toContain("Ask answer from mock Kimi.");
      await client.close();
      client = undefined;

      client = await McpClient.modern(fixture);
      const recovered = await client.request("tasks/get", { taskId, _meta: modernMeta() });
      expect(recovered.status).toBe("completed");
      expect(recovered.result.content[0].text).toContain("Ask answer from mock Kimi.");
    } finally {
      if (client) await client.close();
      await fixture.cleanup();
    }
  }, 60_000);

  test("Codex ordinary start, workspace-free job control, and cancellation", async () => {
    const fixture = await createMcpFixture("mcp-legacy-cancel", { delayMs: "30000" });
    let client: McpClient | undefined;
    try {
      client = await McpClient.legacy(fixture);
      const started = await client.request("tools/call", {
        name: "kimi_ask",
        arguments: { workspace: fixture.repo, prompt: "Wait for cancellation", fresh: true },
      });
      expect(started.resultType).toBeUndefined();
      expect(started.isError).toBe(false);
      expect(started.structuredContent.status).toBe("running");
      const jobId = started.structuredContent.job_id as string;

      const status = await client.request("tools/call", {
        name: "kimi_job_status",
        arguments: { job_id: jobId },
      });
      expect(status.structuredContent.status).toBe("running");
      expect(status.structuredContent.operation_kind).toBe("ask");

      const cancelled = await client.request("tools/call", {
        name: "kimi_job_cancel",
        arguments: { job_id: jobId },
      });
      expect(cancelled.isError).toBe(false);
      expect(cancelled.structuredContent.cancellation.status).toBe("cancelled");

      const result = await client.request("tools/call", {
        name: "kimi_job_result",
        arguments: { job_id: jobId },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent.status).toBe("cancelled");
    } finally {
      if (client) await client.close();
      await fixture.cleanup();
    }
  }, 60_000);

  test("Codex ordinary start can return a settled artifact", async () => {
    const fixture = await createMcpFixture("mcp-legacy-result", { delayMs: "100" });
    let client: McpClient | undefined;
    try {
      client = await McpClient.legacy(fixture);
      const started = await client.request("tools/call", {
        name: "kimi_ask",
        arguments: { workspace: fixture.repo, prompt: "Answer briefly", fresh: true },
      });
      const jobId = started.structuredContent.job_id as string;
      let result: any;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        result = await client.request("tools/call", {
          name: "kimi_job_result",
          arguments: { job_id: jobId },
        });
        if (result.isError === false) break;
        await Bun.sleep(100);
      }
      expect(result.isError).toBe(false);
      expect(result.structuredContent.status).toBe("completed");
      expect(result.content[0].text).toContain("Ask answer from mock Kimi.");
    } finally {
      if (client) await client.close();
      await fixture.cleanup();
    }
  }, 60_000);
});
