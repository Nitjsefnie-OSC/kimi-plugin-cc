import { describe, expect, test } from "bun:test";

import { RuntimeError } from "../../runtime/errors.js";
import { parseAskArgs, parsePursueArgs, parseSwarmArgs, parseJobLookupArgs, parseRescueArgs, parseReviewArgs } from "../../runtime/parsing.js";

describe("argument parsing", () => {
  test("parseAskArgs preserves text after the -- sentinel", () => {
    const parsed = parseAskArgs(["--fresh", "--", "--literal", "question"]);

    expect(parsed.thinkingEffort).toBeUndefined();
    expect(parsed.fresh).toBeTrue();
    expect(parsed.prompt).toBe("--literal question");
    expect(parsed.resume).toBeFalse();
  });



  test("parseAskArgs rejects unknown flag-shaped tokens in flag-position", () => {
    expect(() => parseAskArgs(["-m", "kimi-k2", "--mystery", "tail"])).toThrow(
      /Unknown flag --mystery for ask.*Supported flags:.*Use `--` before flag-shaped prompt text/s,
    );
  });

  test("parseAskArgs handles explicit resume targets", () => {
    const parsed = parseAskArgs(["--resume", "foo"]);

    expect(parsed).toEqual({
      background: false,
      wait: false,
      resume: true,
      resumeTarget: "foo",
      fresh: false,
      model: undefined,
      thinkingEffort: undefined,
      prompt: undefined,
    });
  });

  test("parseAskArgs treats -r as bare resume and preserves following prompt text", () => {
    const parsed = parseAskArgs(["-r", "my question"]);

    expect(parsed).toEqual({
      background: false,
      wait: false,
      resume: true,
      resumeTarget: undefined,
      fresh: false,
      model: undefined,
      thinkingEffort: undefined,
      prompt: "my question",
    });
  });

  test("parseAskArgs preserves trailing-mode prose with flag-shaped tokens", () => {
    const parsed = parseAskArgs(["explain", "git", "log", "-1"]);

    expect(parsed.prompt).toBe("explain git log -1");
  });

  test("parseAskArgs `--` sentinel passes through flag-shaped prompt text", () => {
    const parsed = parseAskArgs(["--", "--mystery", "foo"]);

    expect(parsed.prompt).toBe("--mystery foo");
  });

  test("parseAskArgs rejects bare --resume without a target", () => {
    expect(() => parseAskArgs(["--resume"])).toThrow(
      "--resume requires a job-id or session-id. Use -r to resume the latest ask session for this repo.",
    );
  });

  test("parseAskArgs rejects --resume followed by another flag", () => {
    expect(() => parseAskArgs(["--resume", "--fresh"])).toThrow(
      "--resume requires a job-id or session-id. Use -r to resume the latest ask session for this repo.",
    );
  });

  test("parseAskArgs rejects --model followed by another flag", () => {
    expect(() => parseAskArgs(["--model", "--background", "question"])).toThrow(RuntimeError);

    try {
      parseAskArgs(["--model", "--background", "question"]);
    } catch (error) {
      expect((error as RuntimeError).code).toBe("INVALID_ARGS");
      expect((error as RuntimeError).message).toBe(
        "--model value cannot start with '-'; pass a model name",
      );
    }
  });

  test("parseAskArgs rejects prompt text after --resume <id>", () => {
    expect(() => parseAskArgs(["--resume", "What", "changed?"])).toThrow(
      "--resume only accepts a job-id or session-id. Use -r to resume the latest ask session with a prompt.",
    );
  });

  test("parseAskArgs rejects --fresh and --resume together", () => {
    expect(() => parseAskArgs(["--fresh", "-r"])).toThrow(
      "ask does not allow --fresh and --resume together.",
    );
  });

  test("parseReviewArgs preserves adversarial focus text after known flags", () => {
    const parsed = parseReviewArgs(["--base", "main", "focus", "on", "rollback"]);

    expect(parsed.base).toBe("main");
    expect(parsed.thinkingEffort).toBeUndefined();
    expect(parsed.focus).toBe("focus on rollback");
  });






  test("parseReviewArgs rejects --model followed by another flag", () => {
    expect(() => parseReviewArgs(["--model", "--background", "focus"])).toThrow(RuntimeError);

    try {
      parseReviewArgs(["--model", "--background", "focus"]);
    } catch (error) {
      expect((error as RuntimeError).code).toBe("INVALID_ARGS");
      expect((error as RuntimeError).message).toBe(
        "--model value cannot start with '-'; pass a model name",
      );
    }
  });

  test("parseReviewArgs hard-fails on unknown flags in flag-position", () => {
    // v0.3.6: warn-and-swallow was producing invisible-to-agent corruption
    // when wrappers invented flags like `--file` / `--context`. The bloated
    // focus blob made Kimi spin inside the 10-min timeout, looking like a
    // hang. Now any flag-shaped token that isn't in the known set throws
    // INVALID_ARGS, with the supported list and `--` escape hatch in the
    // error message.
    expect(() => parseReviewArgs(["--from", "HEAD~2", "--to", "HEAD"], "review")).toThrow(
      /Unknown flag --from for review.*Use `--` before flag-shaped focus text/s,
    );
    expect(() => parseReviewArgs(["--file", "/tmp/x.md"], "challenge")).toThrow(
      /Unknown flag --file for challenge/,
    );
  });

  test("parseReviewArgs `--` sentinel still escapes flag-shaped focus text", () => {
    // The escape hatch documented in the error message must actually work.
    // After `--`, all remaining tokens are joined verbatim as focus, even
    // ones that look like flags.
    const parsed = parseReviewArgs(["--base", "main", "--", "--file", "/tmp/x.md"], "review");

    expect(parsed.base).toBe("main");
    expect(parsed.focus).toBe("--file /tmp/x.md");
  });

  test("parseAskArgs hard-fails on unknown flag-shaped tokens at position 0", () => {
    expect(() => parseAskArgs(["--mystery", "tail"])).toThrow(
      /Unknown flag --mystery for ask.*Supported flags:.*Use `--` before flag-shaped prompt text/s,
    );
  });

  test("parseRescueArgs handles explicit resume targets and flags", () => {
    const parsed = parseRescueArgs(["--resume", "job-123", "--background"]);

    expect(parsed.resume).toBeTrue();
    expect(parsed.resumeTarget).toBe("job-123");
    expect(parsed.background).toBeTrue();
    expect(parsed.prompt).toBeUndefined();
  });

  test("parseRescueArgs treats -r as bare resume and preserves following prompt text", () => {
    const parsed = parseRescueArgs(["-r", "continue", "work"]);

    expect(parsed.resume).toBeTrue();
    expect(parsed.resumeTarget).toBeUndefined();
    expect(parsed.prompt).toBe("continue work");
  });

  test("parseRescueArgs preserves trailing-mode prose with flag-shaped tokens", () => {
    const parsed = parseRescueArgs(["explain", "git", "log", "-1"]);

    expect(parsed.prompt).toBe("explain git log -1");
  });

  test("parseRescueArgs `--` sentinel passes through flag-shaped prompt text", () => {
    const parsed = parseRescueArgs(["--", "--mystery", "foo"]);

    expect(parsed.prompt).toBe("--mystery foo");
  });

  test("parseRescueArgs rejects bare --resume without a target", () => {
    expect(() => parseRescueArgs(["--resume"])).toThrow(
      "--resume requires a job-id or session-id. Use -r to resume the latest rescue session for this repo.",
    );
  });

  test("parseRescueArgs rejects --resume followed by another flag", () => {
    expect(() => parseRescueArgs(["--resume", "--fresh"])).toThrow(
      "--resume requires a job-id or session-id. Use -r to resume the latest rescue session for this repo.",
    );
  });

  test("parseRescueArgs rejects --model followed by another flag", () => {
    expect(() => parseRescueArgs(["--model", "--background", "task"])).toThrow(RuntimeError);

    try {
      parseRescueArgs(["--model", "--background", "task"]);
    } catch (error) {
      expect((error as RuntimeError).code).toBe("INVALID_ARGS");
      expect((error as RuntimeError).message).toBe(
        "--model value cannot start with '-'; pass a model name",
      );
    }
  });

  test("parseRescueArgs rejects unknown flag-shaped tokens in flag-position", () => {
    expect(() => parseRescueArgs(["--mystery", "tail"])).toThrow(
      /Unknown flag --mystery for rescue.*Supported flags:.*Use `--` before flag-shaped prompt text/s,
    );
  });

  test("parseRescueArgs rejects prompt text after --resume <id>", () => {
    expect(() => parseRescueArgs(["--resume", "What", "changed?"])).toThrow(
      "--resume only accepts a job-id or session-id. Use -r to resume the latest rescue session with a prompt.",
    );
  });

  test("parseJobLookupArgs accepts an optional type filter and job id", () => {
    const parsed = parseJobLookupArgs(["--type", "rescue", "job-123"]);

    expect(parsed.type).toBe("rescue");
    expect(parsed.jobId).toBe("job-123");
    expect(parsed.json).toBeFalse();
  });

  test("parseJobLookupArgs accepts --json", () => {
    const parsed = parseJobLookupArgs(["job-123", "--json"]);

    expect(parsed.jobId).toBe("job-123");
    expect(parsed.json).toBeTrue();
  });

  test("parseJobLookupArgs unknown flag error includes supported flags", () => {
    expect(() => parseJobLookupArgs(["--kind", "rescue"])).toThrow(
      "Unknown flag --kind. Supported flags: --type <review|challenge|rescue|review_gate|ask>, --json.",
    );
  });
});

for (const [name, parse] of [["ask", parseAskArgs], ["rescue", parseRescueArgs], ["review", parseReviewArgs], ["challenge", (args: string[]) => parseReviewArgs(args, "challenge")]] as const) {
  describe(`${name} per-job budget`, () => {
    test.each([["30m", 1_800_000], ["1h", 3_600_000], ["90s", 90_000], ["15", 900_000], ["24h", 86_400_000]])("parses %s", (duration, expected) => {
      expect(parse(["--budget", String(duration), "scope"]).budgetMs).toBe(expected as number);
    });
    test("omission keeps the command default and -- escapes prompt text", () => {
      expect(parse(["scope"]).budgetMs).toBeUndefined();
      expect(parse(["--", "--budget", "25h"]).budgetMs).toBeUndefined();
    });
    test.each([[], ["0"], ["-1"], ["25h"], ["nope"], ["--fresh"]])("rejects invalid duration %j", (...value) => {
      expect(() => parse(["--budget", ...value])).toThrow(RuntimeError);
      try { parse(["--budget", ...value]); } catch (error) {
        expect(error).toMatchObject({ code: "INVALID_ARGS", stage: `${name}.parse` });
      }
    });
  });
}

for (const [name, parse] of [["ask", parseAskArgs], ["rescue", parseRescueArgs], ["review", parseReviewArgs], ["challenge", (args: string[]) => parseReviewArgs(args, "challenge")], ["pursue", parsePursueArgs], ["swarm", parseSwarmArgs]] as const) {
  test(`${name} budget errors have command stage and policy-specific advice`, () => {
    for (const value of ["invalid", "0", "25h", "--background"]) {
      let caught: unknown;
      try { parse(["--budget", value]); } catch (error) { caught = error; }
      expect(caught).toMatchObject({ code: "INVALID_ARGS", stage: `${name}.parse` });
      const message = (caught as Error).message;
      if (value === "--background") expect(message).toBe("--budget requires a duration (e.g. 30m, 1h, 90s).");
      if (value === "25h") expect(message).toContain(name === "swarm" || name === "pursue"
        ? "the budget is a safety ceiling, not a scheduler"
        : "the budget is a response-time limit; a timed-out job is still a safe failure");
    }
  });
}

for (const parse of [parseAskArgs, parseRescueArgs]) {
  test(`${parse.name} handles help before validation or trailing-text slurp`, () => {
    for (const args of [["--help"], ["-h"], ["--budget", "--help"], ["-m", "kimi", "-h"], ["--unknown", "-h"]]) {
      expect(parse(args).help).toBe(true);
      expect(parse(args).prompt).toBeUndefined();
    }
    expect(parse(["--", "--help"]).help).toBeUndefined();
    expect(parse(["--", "--help"]).prompt).toBe("--help");
    // Prose ends the flag region: a later -h/--help is prompt text, not a help request.
    expect(parse(["what", "does", "du", "-h", "print"]).help).toBeUndefined();
    expect(parse(["what", "does", "du", "-h", "print"]).prompt).toBe("what does du -h print");
    expect(parse(["prose", "--help"]).help).toBeUndefined();
  });
}

for (const parse of [parseAskArgs, parseRescueArgs, parseReviewArgs, (a: string[]) => parseReviewArgs(a, "challenge"), parsePursueArgs, parseSwarmArgs]) {
  test("thinking syntax matrix: " + parse.name, () => {
    for (const effort of ["off", "LOW", "medium", "high", "future-effort2", "a".repeat(32)]) {
      for (const args of [["--thinking", effort], ["--thinking=" + effort]]) {
        expect(parse(args).thinkingEffort).toBe(effort.toLowerCase());
      }
    }
    for (const args of [["--thinking"], ["--thinking", "--budget"], ["--thinking="], ["--thinking", "a".repeat(33)], ["--thinking", "1high"], ["--thinking", "a_b"], ["--thinking", "high low"]]) {
      expect(() => parse(args)).toThrow(RuntimeError);
    }
    for (const flag of ["--no-thinking", "--no-thinking=false"]) {
      expect(() => parse([flag])).toThrow("use --thinking off");
    }
    expect(parse([]).thinkingEffort).toBeUndefined();
    expect(parse(["--", "--thinking", "off"]).thinkingEffort).toBeUndefined();
    expect(parse(["prose", "--thinking", "off"]).thinkingEffort).toBeUndefined();
  });
}
