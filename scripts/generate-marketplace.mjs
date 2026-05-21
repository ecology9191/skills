#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSkillsByBucket } from "../bin/collect-skills.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, ".claude-plugin", "marketplace.json");

const catalog = collectSkillsByBucket(root, "/tmp/unused");

const manifest = {
  metadata: { pluginRoot: "./skills" },
  plugins: catalog.map((bucket) => ({
    name: bucket.id,
    source: `./${bucket.id}`,
    skills: bucket.skills.map((skill) => `./${skill.name}`),
  })),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${path.relative(root, outPath)} (${catalog.flatMap((b) => b.skills).length} skills).`);
