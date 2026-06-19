import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json");

const promotedBuckets = new Set(["engineering", "productivity", "misc"]);

function findSkillFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(fullPath));
    } else if (entry.name === "SKILL.md") {
      results.push(fullPath);
    }
  }
  return results;
}

function frontmatter(content) {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
}

function hasMetadataInternalTrue(markdown) {
  const lines = frontmatter(markdown).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^metadata:\s*$/.test(lines[index])) continue;

    for (let nested = index + 1; nested < lines.length; nested += 1) {
      const line = lines[nested];
      if (/^\S/.test(line)) break;
      if (/^\s+internal:\s*true\s*$/.test(line)) return true;
    }
  }

  return false;
}

test("non-promoted skills are marked internal", () => {
  const leakedSkills = findSkillFiles(skillsRoot)
    .filter((skillPath) => {
      const relative = path.relative(skillsRoot, skillPath).split(path.sep);
      return !promotedBuckets.has(relative[0]);
    })
    .filter((skillPath) => !hasMetadataInternalTrue(fs.readFileSync(skillPath, "utf8")))
    .map((skillPath) => path.relative(root, skillPath));

  assert.deepEqual(leakedSkills, []);
});

test("marketplace exposes each promoted bucket exactly once", () => {
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  const pluginNames = marketplace.plugins.map((plugin) => plugin.name);

  assert.deepEqual([...new Set(pluginNames)].sort(), [...promotedBuckets].sort());
  assert.equal(pluginNames.length, promotedBuckets.size);
});
