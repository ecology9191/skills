#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buckets = ["engineering", "productivity", "misc"];
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: npx @ecology91/skills [--dry-run]\n\nCopies promoted skills into ~/.config/opencode/skills.`);
  process.exit(0);
}

const dryRun = args.has("--dry-run");
const destRoot = path.join(os.homedir(), ".config", "opencode", "skills");

function copySkill(src, dest) {
  if (dryRun) {
    console.log(`would install ${path.basename(src)} -> ${dest}`);
    return;
  }

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`installed ${path.basename(src)} -> ${dest}`);
}

const skills = [];

for (const bucket of buckets) {
  const bucketDir = path.join(root, "skills", bucket);
  if (!fs.existsSync(bucketDir)) continue;

  for (const entry of fs.readdirSync(bucketDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const src = path.join(bucketDir, entry.name);
    if (!fs.existsSync(path.join(src, "SKILL.md"))) continue;

    skills.push([src, path.join(destRoot, entry.name)]);
  }
}

if (!dryRun) fs.mkdirSync(destRoot, { recursive: true });

for (const [src, dest] of skills) copySkill(src, dest);

console.log(`${dryRun ? "Checked" : "Installed"} ${skills.length} skills for opencode.`);
console.log("Restart opencode to reload the skill list.");
