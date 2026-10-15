import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assignmentParseContext } from "../../runtime/hooks/config-safety.js";

// The inline-hooks assignment walker re-states smol-toml's parse() defaults by
// hand. If a vendored bump changes a default, the walker would diverge from the
// parser that validated the document; pin the two together here.
describe("assignment walker parse context tracks the vendored parse() defaults", () => {
  const source = readFileSync(new URL("../../runtime/vendor/smol-toml/parse.js", import.meta.url), "utf8");
  const defaults = {
    d: /d: options\.maxDepth \?\? (\d+)/.exec(source)?.[1],
    bi: /bi: options\.integersAsBigInt \?\? (true|false)/.exec(source)?.[1],
    ld: /ld: options\.useLegacyDate \?\? (true|false)/.exec(source)?.[1],
    uk: /: (\d) ?,?\s*\};/.exec(source.slice(source.indexOf("unsafeKeyBehaviour === 'drop'")))?.[1],
  };
  test("vendored parse() still declares the four defaults this test reads", () => {
    expect(defaults).toEqual({ d: "1000", bi: "false", ld: "true", uk: "0" });
  });
  test("walker context equals those defaults and skips a BOM", () => {
    expect(assignmentParseContext("a = 1")).toEqual({ s: "a = 1", p: 0, d: 1000, bi: false, ld: true, uk: 0 });
    expect(assignmentParseContext("\ufeffa = 1").p).toBe(1);
  });
});
