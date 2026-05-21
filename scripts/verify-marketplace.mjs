#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSkillsByBucket } from "../bin/collect-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const marketplacePath = path.join(root, ".claude-plugin", "marketplace.json");

const catalog = collectSkillsByBucket(root, "/tmp/unused");
const expected = {
  metadata: { pluginRoot: "./skills" },
  plugins: catalog.map((bucket) => ({
    name: bucket.id,
    source: `./${bucket.id}`,
    skills: bucket.skills.map((skill) => `./${skill.name}`),
  })),
};

if (!fs.existsSync(marketplacePath)) {
  console.error("Missing .claude-plugin/marketplace.json — run: npm run generate:marketplace");
  process.exit(1);
}

const actual = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error(
    ".claude-plugin/marketplace.json is out of date — run: npm run generate:marketplace",
  );
  process.exit(1);
}

console.log("Verified .claude-plugin/marketplace.json matches promoted skills.");
