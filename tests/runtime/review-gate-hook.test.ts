import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { resolveRepoIdentity } from "../../runtime/git.js";
import { JobStore } from "../../runtime/job-store.js";
import { resolvePluginPaths } from "../../runtime/paths.js";
import {
  cleanupTestPath,
  createTestPluginDataRoot,
} from "../helpers/test-env.js";

const mockCliPath = path.join(process.cwd(), "tests/helpers/mock-kimi-cli-v1.ts");
const hookScriptPath = path.join(process.cwd(), "runtime/hooks/review-gate-stop.ts");

describe("review gate stop hook", () => {
  test("disabled gate returns an allow result without invoking Kimi", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-disabled");

    try {
      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        [
          JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Do the thing." }] } }),
          JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "I fixed it." }] } }),
        ].join("\n") + "\n",
        "utf8",
      );

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      expect(output).toEqual({ systemMessage: "review-gate skipped: disabled" });
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  });

  test.each([undefined, "", "custom/provider-model", " alias with spaces "])("enabled gate honors model selection %j and blocks on high-confidence BLOCK", async (selectedModel) => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-block");
    const kimiHome = await createTestPluginDataRoot("review-gate-kimi-home");
    const invocationPath = path.join(pluginDataRoot, "review-gate-invocation.jsonl");
    const sessionId = "session_cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    try {
      const statePath = await seedKimiSession(kimiHome, sessionId);
      const paths = resolvePluginPaths({
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        [
          JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Fix the failing path." }] } }),
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "I fixed the issue and everything is complete." }] },
          }),
        ].join("\n") + "\n",
        "utf8",
      );

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
          KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH: invocationPath,
          KIMI_PLUGIN_CC_REVIEW_GATE_MODEL: selectedModel,
          KIMI_PLUGIN_CC_MOCK_SESSION_ID: sessionId,
          KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
          KIMI_CODE_HOME: kimiHome,
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      const invocation = JSON.parse(await readFile(invocationPath, "utf8")) as {
        argv: string[];
        env: { KIMI_PLUGIN_CC_CMD: string | null };
      };

      expect(output.decision).toBe("block");
      expect(output.reason).toContain("Kimi review gate blocked stop");
      expect(output.reason).toContain("Requested fix still missing");
      // v1.0: review_gate command label propagates via env, not argv.
      // The agent-file / --session flags are gone — kimi-code does not
      // load YAML agent profiles and assigns its own session id.
      expect(invocation.env.KIMI_PLUGIN_CC_CMD).toBe("review_gate");
      expect(invocation.argv).toContain("--output-format");
      expect(invocation.argv).toContain("stream-json");
      if (selectedModel) {
        expect(invocation.argv[invocation.argv.indexOf("-m") + 1]).toBe(selectedModel);
      } else {
        expect(invocation.argv).not.toContain("-m");
      }
      // v1.0 alpha.4: review-gate sets `thinking: false` in the options
      // bag for future kimi-code support, but the runtime MUST NOT emit
      // `--no-thinking` in argv — kimi-code 0.1.1 has no such flag and
      // crashes on unknown options. (Round 2 Codex finding.)
      expect(invocation.argv).not.toContain("--no-thinking");

      const state = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
      expect(state.title).toBe("New Session");
      expect(state.isCustomTitle).toBe(false);

      const repoIdentity = await resolveRepoIdentity(process.cwd());
      const store = new JobStore(paths);
      try {
        const latest = store.findLatestJob({
          repoId: repoIdentity.repoId,
          commandType: "review_gate",
        });
        expect(latest?.status).toBe("completed");
        expect(latest?.model).toBe(selectedModel || null);
        expect(latest?.summary).toContain("requested work was complete");
        expect(latest?.final_output_path).toBeTruthy();
      } finally {
        store.close();
      }
    } finally {
      await cleanupTestPath(pluginDataRoot);
      await cleanupTestPath(kimiHome);
    }
  });

  test("enabled gate skips without spawning Kimi when hook enforcement is absent", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-missing-hook");
    const kimiHome = await createTestPluginDataRoot("review-gate-missing-hook-kimi-home");
    const invocationPath = path.join(pluginDataRoot, "review-gate-missing-hook-invocation.jsonl");

    try {
      const paths = resolvePluginPaths({
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_CODE_HOME: kimiHome,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
          KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH: invocationPath,
          KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_user_message: "Fix the failing path.",
          last_assistant_message: "I fixed the issue and everything is complete.",
        },
      );

      expect(output.decision).toBeUndefined();
      expect(output.systemMessage).toContain(
        "review-gate skipped: canonical PreToolUse hook is missing or invalid",
      );
      expect(output.systemMessage).toContain("allowing stop without invoking Kimi");
      expect(existsSync(invocationPath)).toBe(false);
    } finally {
      await cleanupTestPath(pluginDataRoot);
      await cleanupTestPath(kimiHome);
    }
  });

  test("enabled gate accepts Codex-style inline last assistant message", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-codex-inline");

    try {
      const paths = resolvePluginPaths({
        ...process.env,
        PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const output = await invokeHook(
        {
          ...process.env,
          PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
          KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_user_message: "Fix the failing path.",
          last_assistant_message: {
            role: "assistant",
            content: [{ type: "text", text: "I fixed the issue and everything is complete." }],
          },
        },
      );

      expect(output.decision).toBe("block");
      expect(output.reason).toContain("Kimi review gate blocked stop");
      expect(output.reason).toContain("Requested fix still missing");
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  });

  test("enabled gate allows stop with a warning on medium-confidence block output", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-medium");

    try {
      const paths = resolvePluginPaths({
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        [
          JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Double-check this answer." }] } }),
          JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "This looks correct to me." }] } }),
        ].join("\n") + "\n",
        "utf8",
      );

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block-medium",
          KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      expect(output.decision).toBeUndefined();
      expect(output.systemMessage).toContain("noted concerns but allowed stop");
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  });

  test("enabled gate allows stop with a warning on malformed output", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-malformed");

    try {
      const paths = resolvePluginPaths({
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        [
          JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Check this answer carefully." }] } }),
          JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "I am fully done." }] } }),
        ].join("\n") + "\n",
        "utf8",
      );

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-malformed",
          KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      expect(output.decision).toBeUndefined();
      expect(output.systemMessage).toBe("Kimi review gate returned malformed output; allowing stop.");
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  });

  test("enabled gate returns an empty result when the transcript has no assistant message", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-no-assistant");

    try {
      const paths = resolvePluginPaths({
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginDataRoot,
      });
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");

      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        `${JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Start the work." }] } })}\n`,
        "utf8",
      );

      const output = await invokeHook(
        {
          ...process.env,
          CLAUDE_PLUGIN_DATA: pluginDataRoot,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
        },
        {
          cwd: process.cwd(),
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      expect(output).toEqual({ systemMessage: "review-gate skipped: no assistant message" });
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  });
});

async function invokeHook(
  env: NodeJS.ProcessEnv,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const child = spawn("node", ["--import", "tsx", hookScriptPath], {
    cwd: process.cwd(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(`${JSON.stringify(payload)}\n`);

  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  if (exitCode !== 0) {
    throw new Error(stderr || `hook exited with code ${String(exitCode)}`);
  }

  return JSON.parse(stdout.trim() || "{}") as Record<string, unknown>;
}

async function seedKimiSession(kimiHome: string, sessionId: string): Promise<string> {
  const sessionDir = path.join(kimiHome, "sessions", "wd_repo_123", sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(kimiHome, "session_index.jsonl"),
    `${JSON.stringify({
      sessionId,
      sessionDir,
      workDir: process.cwd(),
    })}\n`,
    "utf8",
  );
  const statePath = path.join(sessionDir, "state.json");
  await writeFile(
    statePath,
    `${JSON.stringify({ title: "New Session", isCustomTitle: false }, null, 2)}\n`,
    "utf8",
  );
  return statePath;
}

// Codex second-round F3: the Stop-hook entry script runs from the plugin root
// (scripts/review-gate-hook.sh `cd`s there), while the child is spawned with
// cwd = payload.cwd. A RELATIVE KIMI_CODE_HOME must resolve against the SAME
// base for hook verification and for the spawn, or verification can pass on
// one home while the child reads another. Here the entry script runs from the
// repo root (standing in for the plugin root) and the payload cwd is a temp
// dir that holds the only real home + managed hook.
describe("review gate resolves a relative KIMI_CODE_HOME against the payload cwd", () => {
  test("hook verification and the spawned child use the same home", async () => {
    const pluginDataRoot = await createTestPluginDataRoot("review-gate-rel-home");
    const relHome = "rel-kimi-home";
    const kimiHome = path.join(pluginDataRoot, relHome);
    const invocationPath = path.join(pluginDataRoot, "review-gate-invocation.jsonl");
    const sessionId = "session_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const nodeExecPath = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).stdout.trim();
    const hostEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: process.cwd(),
      CLAUDE_PLUGIN_DATA: pluginDataRoot,
      KIMI_PLUGIN_CC_NODE_BIN: nodeExecPath,
    };
    delete hostEnv.KIMI_PLUGIN_CC_SKIP_HOOK_CHECK;

    try {
      await seedKimiSession(kimiHome, sessionId);
      const paths = resolvePluginPaths(hostEnv);
      await mkdir(paths.pluginRoot, { recursive: true });
      await writeFile(paths.configPath, `${JSON.stringify({ reviewGateEnabled: true }, null, 2)}\n`, "utf8");
      const transcriptPath = path.join(pluginDataRoot, "transcript.jsonl");
      await writeFile(
        transcriptPath,
        [
          JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "Fix the failing path." }] } }),
          JSON.stringify({
            type: "assistant",
            message: { content: [{ type: "text", text: "I fixed the issue and everything is complete." }] },
          }),
        ].join("\n") + "\n",
        "utf8",
      );

      // Install the managed hook into the ABSOLUTE home through the real
      // entry script so the canonical command byte-matches at verify time.
      const setup = spawnSync(path.join(process.cwd(), "scripts", "companion.sh"), ["setup"], {
        env: { ...hostEnv, KIMI_CODE_HOME: kimiHome },
        encoding: "utf8",
      });
      expect(setup.status, `${setup.stdout}\n${setup.stderr}`).toBe(0);
      expect(existsSync(path.join(kimiHome, "config.toml"))).toBe(true);

      // No SKIP_HOOK_CHECK: verification must find the hook under
      // <payload.cwd>/rel-kimi-home, not <entry cwd>/rel-kimi-home.
      const output = await invokeHook(
        {
          ...hostEnv,
          KIMI_PLUGIN_CC_KIMI_BIN: "bun",
          KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify(["run", mockCliPath]),
          KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-block",
          KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH: invocationPath,
          KIMI_PLUGIN_CC_MOCK_SESSION_ID: sessionId,
          KIMI_CODE_HOME: relHome,
        },
        {
          cwd: pluginDataRoot,
          hook_event_name: "Stop",
          stop_hook_active: false,
          transcript_path: transcriptPath,
        },
      );

      expect(String(output.systemMessage ?? "")).not.toContain("hook is missing");
      expect(output.decision).toBe("block");
      const invocation = JSON.parse(await readFile(invocationPath, "utf8")) as {
        env: { KIMI_CODE_HOME: string | null };
      };
      expect(invocation.env.KIMI_CODE_HOME).toBe(kimiHome);
    } finally {
      await cleanupTestPath(pluginDataRoot);
    }
  }, 60_000);
});

test.each([undefined, "inherit", "high"])("gate thinking request %j reaches the child and job", async (thinking) => {
  const data = await createTestPluginDataRoot("gate-thinking");
  const invocation = path.join(data, "invocation.json");
  const env: NodeJS.ProcessEnv = { ...process.env, KIMI_PLUGIN_CC_DATA: data,
    KIMI_CODE_HOME: path.join(data, "home"), KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
    KIMI_PLUGIN_CC_KIMI_BIN: "bun", KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify([mockCliPath]),
    KIMI_PLUGIN_CC_MOCK_SCENARIO: "review-gate-allow", KIMI_PLUGIN_CC_MOCK_INVOCATION_PATH: invocation };
  delete env.KIMI_MODEL_THINKING_EFFORT;
  if (thinking === undefined) delete env.KIMI_PLUGIN_CC_REVIEW_GATE_THINKING;
  else env.KIMI_PLUGIN_CC_REVIEW_GATE_THINKING = thinking;
  try {
    const paths = resolvePluginPaths(env);
    await mkdir(paths.pluginRoot, { recursive: true });
    await writeFile(paths.configPath, JSON.stringify({ reviewGateEnabled: true }));
    await invokeHook(env, { cwd: process.cwd(), hook_event_name: "Stop", last_assistant_message: "done" });
    expect(JSON.parse(await readFile(invocation, "utf8")).env.KIMI_MODEL_THINKING_EFFORT).toBe(thinking === "inherit" ? null : thinking ?? "off");
    const store = new JobStore(paths);
    try {
      const repo = await resolveRepoIdentity(process.cwd());
      const job = store.findLatestJob({ repoId: repo.repoId, commandType: "review_gate" });
      expect(job?.thinking_effort).toBe(thinking === "inherit" ? null : thinking ?? "off");
      expect(job?.thinking).toBe(false);
    } finally { store.close(); }
  } finally { await cleanupTestPath(data); }
});

test.each(["executed", "unresolved"])("compiled Stop-hook wiring on hook escape %s: stays fail-open, annotates, persists the finding", async (kind) => {
  const data = await createTestPluginDataRoot("gate-escape");
  const env = { ...process.env, KIMI_PLUGIN_CC_DATA: data,
    KIMI_CODE_HOME: path.join(data, "home"), KIMI_PLUGIN_CC_SKIP_HOOK_CHECK: "1",
    KIMI_PLUGIN_CC_KIMI_BIN: "bun", KIMI_PLUGIN_CC_KIMI_PREFIX_ARGS: JSON.stringify([mockCliPath]),
    KIMI_PLUGIN_CC_MOCK_SCENARIO: `hook-escape-${kind}` };
  try {
    const paths = resolvePluginPaths(env);
    await mkdir(paths.pluginRoot, { recursive: true });
    await writeFile(paths.configPath, JSON.stringify({ reviewGateEnabled: true }));
    const result = spawnSync(path.resolve("scripts/review-gate-hook.sh"), [], { env, encoding: "utf8",
      input: JSON.stringify({ cwd: process.cwd(), hook_event_name: "Stop", last_assistant_message: "done" }) });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    // Detection evidence only: the gate never blocks on it, but says so.
    expect(output.decision).toBeUndefined();
    expect(output.systemMessage).toContain("safety hook notice");
    expect(output.systemMessage).toContain(kind === "executed" ? "Write mismatch" : "Write unresolved");
    const store = new JobStore(paths);
    try {
      const repo = await resolveRepoIdentity(process.cwd());
      const job = store.findLatestJob({ repoId: repo.repoId, commandType: "review_gate" });
      expect(job?.status).toBe("completed");
      expect(JSON.parse(job?.hook_escapes ?? "[]")[0]).toMatchObject({ kind: kind === "executed" ? "mismatch" : "unresolved", tool_name: "Write" });
    } finally { store.close(); }
  } finally { await cleanupTestPath(data); }
});
