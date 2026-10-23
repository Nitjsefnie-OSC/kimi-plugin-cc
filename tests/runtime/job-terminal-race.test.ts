import { describe, expect, test } from "bun:test";

import { RuntimeError } from "../../runtime/errors.js";
import { resolveRepoIdentity } from "../../runtime/git.js";
import { JobStore } from "../../runtime/job-store.js";
import { markJobCancelled, markJobFailed } from "../../runtime/jobs.js";
import { ensurePluginPaths, resolvePluginPaths } from "../../runtime/paths.js";
import { writeArtifact, readArtifact } from "../../runtime/render.js";
import { cleanupTestPath, createGitRepoFixture, createTestPluginDataRoot } from "../helpers/test-env.js";

describe("terminal job artifact preservation", () => {
  test("late failure and cancellation cannot overwrite a completed answer", async () => {
    const data = await createTestPluginDataRoot("terminal-race");
    const repo = await createGitRepoFixture("terminal-race-repo");
    const paths = resolvePluginPaths({ KIMI_PLUGIN_CC_DATA: data });
    await ensurePluginPaths(paths);
    const store = new JobStore(paths);
    try {
      const identity = await resolveRepoIdentity(repo);
      const running = store.createJob({
        job_id: "terminal-race-job",
        repo_id: identity.repoId,
        command_type: "ask",
        cwd: repo,
        model: null,
        thinking: null,
        background: false,
        pid: null,
        kimi_pid: null,
        status: "running",
        kimi_session_id: null,
        agent_profile: "test",
        prompt_digest: "digest",
        summary: "Successful answer",
        final_output_path: null,
        stream_log_path: "unused",
        error: null,
      });
      const artifact = await writeArtifact(paths, running, "the successful answer\n");
      const completed = store.markCompleted(running.job_id, {
        summary: "Successful answer",
        final_output_path: artifact,
        error: null,
      })!;
      expect(completed.status).toBe("completed");

      const failed = await markJobFailed(store, paths, running, new RuntimeError("LATE_FAILURE", "late", "test"));
      expect(failed.status).toBe("completed");
      const cancelled = await markJobCancelled(store, paths, running, "late cancel");
      expect(cancelled.status).toBe("completed");
      expect(store.getJob(running.job_id)?.status).toBe("completed");
      expect(store.getJob(running.job_id)?.final_output_path).toBe(artifact);
      expect(await readArtifact(artifact)).toBe("the successful answer\n");
    } finally {
      store.close();
      await cleanupTestPath(data);
      await cleanupTestPath(repo);
    }
  }, 30_000);
});
