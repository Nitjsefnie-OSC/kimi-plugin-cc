import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveRepoIdentity } from "../../runtime/git.js";
import { JobStore } from "../../runtime/job-store.js";
import { ensurePluginPaths, resolvePluginPaths } from "../../runtime/paths.js";

const repo = path.resolve(import.meta.dir, "../..");
const node = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).stdout.trim();
let scratch: string;
beforeAll(async () => { scratch = await mkdtemp(path.join(tmpdir(), "kimi-data-installed-")); });
afterAll(async () => { await rm(scratch, { recursive: true, force: true }); });

describe("installed data-root isolation", () => {
  for (const host of ["claude", "codex"] as const) {
    test(`${host}: first shell launch accepts a symlinked home before data exists`, async () => {
      const home = path.join(scratch, `${host}-first-home`);
      const alias = path.join(scratch, `${host}-first-home-alias`);
      const install = path.join(home, "plugins/cache/kimi-marketplace/kimi/2.0.1");
      const dataName = host === "claude" ? "kimi-kimi-marketplace" : "kimi-marketplace-kimi";
      const data = path.join(home, "plugins/data", dataName);
      const aliasedData = path.join(alias, "plugins/data", dataName);
      await mkdir(install, { recursive: true });
      for (const dir of ["dist", "scripts"]) {
        await cp(path.join(repo, host === "codex" ? "plugins/kimi-codex" : "", dir), path.join(install, dir), { recursive: true });
      }
      const manifest = host === "codex" ? ".codex-plugin" : ".claude-plugin";
      await mkdir(path.join(install, manifest));
      await writeFile(path.join(install, manifest, "plugin.json"), '{"name":"kimi"}');
      await symlink(home, alias);
      const aliasedInstall = path.join(alias, "plugins/cache/kimi-marketplace/kimi/2.0.1");
      expect(existsSync(data)).toBe(false);
      const result = spawnSync(path.join(aliasedInstall, "scripts/review-gate-hook.sh"), [], {
        cwd: repo, encoding: "utf8",
        env: { PATH: "/usr/bin:/bin", KIMI_PLUGIN_CC_NODE_BIN: node,
          CLAUDE_PLUGIN_ROOT: aliasedInstall, PLUGIN_ROOT: aliasedInstall,
          CLAUDE_PLUGIN_DATA: aliasedData, PLUGIN_DATA: aliasedData },
        input: JSON.stringify({ hook_event_name: "Stop", cwd: repo }),
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).systemMessage).toContain("disabled");
      expect(existsSync(path.join(data, "kimi-plugin-cc"))).toBe(true);
      expect(existsSync(path.join(aliasedData, "kimi-plugin-cc"))).toBe(true);
    }, 30_000);

    test(`${host}: conflict refuses writes; explicit recovery retains old jobs and settings`, async () => {
      const plugins = path.join(scratch, host, "plugins");
      const install = path.join(plugins, "cache/kimi-marketplace/kimi/2.0.0");
      const data = path.join(plugins, "data", host === "claude" ? "kimi-kimi-marketplace" : "kimi-marketplace-kimi");
      const foreign = path.join(plugins, "data/other-plugin");
      const custom = path.join(scratch, `${host}-custom-data`);
      await mkdir(install, { recursive: true });
      for (const dir of ["dist", "scripts"]) {
        await cp(path.join(repo, host === "codex" ? "plugins/kimi-codex" : "", dir), path.join(install, dir), { recursive: true });
      }
      const manifest = host === "codex" ? ".codex-plugin" : ".claude-plugin";
      await mkdir(path.join(install, manifest));
      await writeFile(path.join(install, manifest, "plugin.json"), '{"name":"kimi"}');
      const paths = resolvePluginPaths({ KIMI_PLUGIN_CC_DATA: data });
      await ensurePluginPaths(paths);
      const config = '{"reviewGateEnabled":true}\n';
      await writeFile(paths.configPath, config);
      const store = new JobStore(paths);
      try {
        store.createJob({
          job_id: "existing-job", repo_id: (await resolveRepoIdentity(repo)).repoId,
          command_type: "ask", cwd: repo, model: null, thinking: null, background: false,
          pid: null, kimi_pid: null, status: "completed", kimi_session_id: null,
          agent_profile: "read-only", prompt_digest: "old", summary: "Existing history",
          phase: "done", final_output_path: null, stream_log_path: "unused", error: null,
        });
      } finally { store.close(); }
      const env = {
        PATH: "/usr/bin:/bin", KIMI_PLUGIN_CC_NODE_BIN: node,
        CLAUDE_PLUGIN_ROOT: install, PLUGIN_ROOT: install,
        CLAUDE_PLUGIN_DATA: foreign, PLUGIN_DATA: data,
        KIMI_CODE_HOME: path.join(scratch, `${host}-unused-kimi-home`),
      };
      const run = (extra: NodeJS.ProcessEnv = {}) => spawnSync(path.join(install, "scripts/companion.sh"), ["status", "existing-job"], { cwd: repo, env: { ...env, ...extra }, encoding: "utf8" });
      const refused = run();
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("PLUGIN_DATA_CONFLICT");
      expect(refused.stderr).toContain(data);
      expect(existsSync(foreign)).toBe(false);
      expect(await readFile(paths.configPath, "utf8")).toBe(config);
      const recovered = run({ KIMI_PLUGIN_CC_DATA: data });
      expect(recovered.status).toBe(0);
      expect(JSON.parse(recovered.stdout)).toMatchObject({ job_id: "existing-job", summary: "Existing history" });
      expect(existsSync(foreign)).toBe(false);
      // No shared variables: a standard install finds its existing store itself.
      const automatic = run({ CLAUDE_PLUGIN_DATA: undefined, PLUGIN_DATA: undefined });
      expect(automatic.status).toBe(0);
      expect(JSON.parse(automatic.stdout).job_id).toBe("existing-job");

      const stop = (extra: NodeJS.ProcessEnv = {}) => spawnSync(path.join(install, "scripts/review-gate-hook.sh"), [], {
        cwd: repo, env: { ...env, ...extra }, encoding: "utf8",
        input: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true, cwd: repo }),
      });
      const skipped = stop();
      expect(skipped.status).toBe(0);
      expect(JSON.parse(skipped.stdout).systemMessage).toContain("PLUGIN_DATA_CONFLICT");
      expect(stop({ KIMI_PLUGIN_CC_DATA: data }).stdout).toContain("stop hook already active");
      // A deliberately selected custom root remains supported without migrating it.
      expect(stop({ KIMI_PLUGIN_CC_DATA: custom }).stdout).toContain("disabled");
      expect(existsSync(path.join(custom, "kimi-plugin-cc"))).toBe(true);
      expect(existsSync(foreign)).toBe(false);
      expect(existsSync(env.KIMI_CODE_HOME)).toBe(false);
      expect(await readFile(paths.configPath, "utf8")).toBe(config);
    }, 30_000);
  }
});
