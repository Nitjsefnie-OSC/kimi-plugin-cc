import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createMcpMessageHandler } from "../../runtime/mcp/protocol.js";
import { resolveMcpWorkspace } from "../../runtime/mcp/workspace.js";
import { cleanupTestPath, createGitRepoFixture } from "../helpers/test-env.js";
import { createMcpFixture, modernMeta } from "../helpers/mcp.js";

describe("MCP version negotiation", () => {
  test("direct modern requests allow omitted clientInfo and preserve request IDs", async () => {
    const fixture = await createMcpFixture("mcp-direct-modern");
    try {
      const handler = createMcpMessageHandler(fixture.env);
      const meta = modernMeta();
      delete meta["io.modelcontextprotocol/clientInfo"];
      const direct = await handler({ jsonrpc: "2.0", id: 7, method: "tools/list", params: { _meta: meta } });
      expect(direct).toMatchObject({ jsonrpc: "2.0", id: 7, result: { resultType: "complete" } });

      const invalid = await handler({ jsonrpc: "2.0", id: 8, method: "ping", params: [] });
      expect(invalid).toMatchObject({ jsonrpc: "2.0", id: 8, error: { code: -32602 } });
    } finally {
      await fixture.cleanup();
    }
  }, 30_000);

  test("unsupported modern versions return the specified negotiation error", async () => {
    const fixture = await createMcpFixture("mcp-version-error");
    try {
      const handler = createMcpMessageHandler(fixture.env);
      const response = await handler({
        jsonrpc: "2.0",
        id: 9,
        method: "server/discover",
        params: { _meta: { ...modernMeta(), "io.modelcontextprotocol/protocolVersion": "1900-01-01" } },
      });
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 9,
        error: {
          code: -32022,
          data: { supported: ["2026-07-28"], requested: "1900-01-01" },
        },
      });
    } finally {
      await fixture.cleanup();
    }
  }, 30_000);
});

describe("MCP workspace containment", () => {
  test("the host default is a boundary, while an unset default permits an explicit workspace", async () => {
    const fixture = await createMcpFixture("mcp-workspace-boundary");
    const outside = await createGitRepoFixture("mcp-workspace-outside");
    const nested = path.join(fixture.repo, "nested");
    await mkdir(nested);
    fixture.env.KIMI_PLUGIN_CC_MCP_WORKSPACE = fixture.repo;
    try {
      const allowed = await resolveMcpWorkspace(fixture.env, nested);
      expect(allowed.cwd).toBe(nested);
      await expect(resolveMcpWorkspace(fixture.env, outside)).rejects.toMatchObject({
        code: "MCP_WORKSPACE_OUTSIDE_DEFAULT",
      });
      const env = { ...fixture.env, KIMI_PLUGIN_CC_MCP_WORKSPACE: undefined };
      const explicit = await resolveMcpWorkspace(env, outside);
      expect(explicit.cwd).toBe(outside);
    } finally {
      await fixture.cleanup();
      await cleanupTestPath(outside);
    }
  }, 30_000);
});
