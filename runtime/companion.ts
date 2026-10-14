import { companionHelp } from "./help.js";
import { runAsk } from "./commands/ask.js";
import { runModelInventory } from "./commands/models.js";
import { runCancel } from "./commands/cancel.js";
import { notImplementedCompanionCommand } from "./commands/not-implemented.js";
import { runReplay } from "./commands/replay.js";
import { runRepairSessions } from "./commands/repair-sessions.js";
import { runResult } from "./commands/result.js";
import { runReview } from "./commands/review.js";
import { runRescue } from "./commands/rescue.js";
import { runPursue } from "./commands/pursue.js";
import { runSwarm } from "./commands/swarm.js";
import { renderSetupResult, runSetup } from "./commands/setup.js";
import { runStatus } from "./commands/status.js";
import { runWorker } from "./commands/worker.js";
import { formatError, RuntimeError } from "./errors.js";
import { resolveKimiHome } from "./kimi-home.js";
import type { CommandContext } from "./types.js";

async function main(argv: string[]): Promise<void> {
  const help = companionHelp(argv);
  if (help !== undefined) {
    process.stdout.write(`${help}\n`);
    return;
  }
  const [command, ...rest] = argv as [string | undefined, ...string[]];
  const cwd = process.env.KIMI_PLUGIN_CC_WORKSPACE_CWD || process.cwd();
  const context: CommandContext = {
    cwd,
    env: {
      ...process.env,
      KIMI_CODE_HOME: resolveKimiHome(process.env, cwd),
    },
    stdout: process.stdout,
    stderr: process.stderr,
  };

  switch (command) {
    case "setup": {
      if (rest.includes("--models")) {
        const args = [...rest];
        args.splice(args.indexOf("--models"), 1);
        context.stdout.write(`${await runModelInventory(args, context)}\n`);
        return;
      }
      const result = await runSetup(rest, context);
      context.stdout.write(`${renderSetupResult(result)}\n`);
      // A failed probe means the hook did not actually deny when exercised —
      // enforcement is NOT in place, whichever action produced it. This must be
      // nonzero for `install` too, not just `check`: since v1.9.0 an agent may
      // run setup and then RETRY the refused command, and it keys that decision
      // on the exit code. Exiting 0 after a failed probe would walk it straight
      // past a proven-dead hook (a byte-exact command + a readable-but-broken
      // script passes `verifyHookInstalled`, since only the probe can tell that
      // the script cannot deny — e.g. a truncated `approval-hook.js`, which has
      // happened here via iCloud sync, or a half-extracted plugin cache).
      // `probe: "skipped"` (uninstall) is deliberately untouched.
      if (result.probe === "failed") {
        process.exitCode = 1;
      }
      return;
    }
    case "review": {
      const result = await runReview(rest, context, "review");
      context.stdout.write(`${result}\n`);
      return;
    }
    case "task": {
      const [taskType, ...taskArgs] = rest;
      if (taskType === "rescue") {
        const result = await runRescue(taskArgs, context);
        context.stdout.write(result);
        return;
      }

      if (taskType === "challenge") {
        const result = await runReview(taskArgs, context, "challenge");
        context.stdout.write(`${result}\n`);
        return;
      }

      if (taskType === "pursue") {
        const result = await runPursue(taskArgs, context);
        context.stdout.write(result);
        return;
      }

      if (taskType === "swarm") {
        const result = await runSwarm(taskArgs, context);
        context.stdout.write(result);
        return;
      }

      notImplementedCompanionCommand(taskType ? `task ${taskType}` : "task");
      return;
    }
    case "ask": {
      const result = await runAsk(rest, context);
      context.stdout.write(`${result}\n`);
      return;
    }
    case "status":
      context.stdout.write(await runStatus(rest, context));
      return;
    case "result":
      context.stdout.write(await runResult(rest, context));
      return;
    case "cancel":
      context.stdout.write(await runCancel(rest, context));
      return;
    case "replay":
      context.stdout.write(await runReplay(rest, context));
      return;
    case "repair-sessions":
      context.stdout.write(await runRepairSessions(rest, context));
      return;
    case "worker":
      await runWorker(rest, context);
      return;
    default:
      throw new RuntimeError(
        "INVALID_COMMAND",
        `Unknown or missing companion subcommand: ${command ?? "<none>"}. Expected one of setup, review, task, ask, status, result, cancel, replay, repair-sessions.`,
        "companion",
      );
  }
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exitCode = 1;
});
