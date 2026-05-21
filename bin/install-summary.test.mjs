import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupePaths, formatInstallSummary, shortenPath } from "./install-summary.mjs";

test("dedupePaths removes duplicate install destinations", () => {
  assert.deepEqual(
    dedupePaths(["~/.agents/skills/tdd", "~/.agents/skills/tdd", "~/.cursor/skills/tdd"]),
    ["~/.agents/skills/tdd", "~/.cursor/skills/tdd"],
  );
});

test("formatInstallSummary shows one destination line per skill", () => {
  const grouped = new Map([
    [
      "engineering",
      [{ name: "diagnose", dest: "/home/xd/.agents/skills/diagnose" }],
    ],
  ]);

  const summary = formatInstallSummary(grouped, { mode: "copy", dryRun: false });
  assert.equal(summary.title, "Installed 1 skill");
  assert.equal(summary.lines.split("\n").filter((line) => line.startsWith("  →")).length, 1);
});

test("shortenPath replaces home prefix with tilde", () => {
  assert.match(shortenPath("/home/xd/.agents/skills/tdd"), /^~\//);
});
