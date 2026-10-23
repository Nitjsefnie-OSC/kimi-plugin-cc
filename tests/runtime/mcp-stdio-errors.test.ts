import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import { serveMcpStdio } from "../../runtime/mcp/stdio.js";

describe("MCP stdio write failures", () => {
  test("a failed frame write rejects the transport instead of being swallowed", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.write = () => { throw new Error("EPIPE"); };
    const served = serveMcpStdio(input, output, async () => ({ jsonrpc: "2.0", id: 1, result: {} }));
    input.end('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    await expect(served).rejects.toThrow("EPIPE");
  }, 30_000);
});
