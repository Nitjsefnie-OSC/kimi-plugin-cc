import { ensurePluginPaths, resolvePluginPaths } from "../paths.js";
import type { CommandContext } from "../types.js";
import { createMcpMessageHandler } from "./protocol.js";
import { serveMcpStdio } from "./stdio.js";

export async function runMcpServer(context: CommandContext): Promise<void> {
  const paths = resolvePluginPaths(context.env);
  await ensurePluginPaths(paths);
  await serveMcpStdio(process.stdin, process.stdout, createMcpMessageHandler(context.env));
}
