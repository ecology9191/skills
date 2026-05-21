import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { dedupePaths, formatInstallSummary, shortenPath } from "./install-summary.mjs";

test("dedupePaths removes duplicate install destinations", () => {
  assert.deepEqual(
    dedupePaths(["~/.agents/skills/tdd", "~/.agents/skills/tdd", "~/.cursor/skills/tdd"]),
    ["~/.agents/skills/tdd", "~/.cursor/skills/tdd"],
  );
});

test("formatInstallSummary shows one destination line per skill", () => {
  const dest = path.join(os.homedir(), ".agents", "skills", "diagnose");
  const grouped = new Map([
    [
      "engineering",
      [{ name: "diagnose", dest }],
    ],
  ]);

  const summary = formatInstallSummary(grouped, { mode: "copy", dryRun: false });
  assert.equal(summary.title, "Installed 1 skill");
  assert.equal(summary.lines.split("\n").filter((line) => line.startsWith("  →")).length, 1);
});

test("shortenPath replaces home prefix with tilde", () => {
  const dest = path.join(os.homedir(), ".agents", "skills", "tdd");
  assert.equal(shortenPath(dest), "~/.agents/skills/tdd");
});
