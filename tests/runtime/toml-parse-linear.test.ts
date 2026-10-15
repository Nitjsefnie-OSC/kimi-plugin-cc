import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

// 16x more input: linear parsing lands near 16x (JIT warm-up can make it less),
// the pre-1.9 quadratic parseKey near 256x. 64x separates the two with margin.
test("vendored TOML key scanning scales far below quadratic from 2k to 32k lines", () => {
  // Isolate JIT/GC state from other parser tests; prepare input before timing.
  const parser = pathToFileURL(path.resolve("runtime/vendor/smol-toml/parse.js")).href;
  const child = spawnSync(process.execPath, ["--eval", `
    import { parse } from ${JSON.stringify(parser)};
    const docs = [2000, 8000, 32000].map(n =>
      Array.from({length:n}, (_, i) => 'key' + i + ' = ' + i).join('\\n'));
    parse('warmup = 1');
    const times = docs.map(doc => {
      const start = performance.now();
      parse(doc);
      return performance.now() - start;
    });
    console.log(JSON.stringify(times));
  `], { encoding: "utf8", timeout: 10_000 });
  expect(child.status).toBe(0);
  const [small, middle, large] = JSON.parse(child.stdout) as number[];
  expect(middle).toBeGreaterThan(0);
  expect(large / small).toBeLessThan(64);
});
