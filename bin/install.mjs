#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buckets = ["engineering", "productivity", "misc"];
const args = new Set(process.argv.slice(2));
const destRoot = path.join(os.homedir(), ".agents", "skills");
const isGitCheckout = fs.existsSync(path.join(root, ".git"));
const link =
  args.has("--link") || (isGitCheckout && !args.has("--copy"));

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: npx @ecology91/skills [--dry-run] [--copy] [--link]

Install promoted skills into ~/.agents/skills.

From a git checkout, symlinks by default so local edits are picked up live.
From the published npm package, copies by default.

  --link  Force symlinks (runs scripts/link-skills.sh)
  --copy  Force copies instead of symlinks`);
  process.exit(0);
}

const dryRun = args.has("--dry-run");

function collectSkills() {
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

  return skills;
}

function installCopy(skills) {
  if (!dryRun) fs.mkdirSync(destRoot, { recursive: true });

  for (const [src, dest] of skills) {
    if (dryRun) {
      console.log(`would install ${path.basename(src)} -> ${dest}`);
      continue;
    }

    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`installed ${path.basename(src)} -> ${dest}`);
  }
}

function installLink(skills) {
  if (dryRun) {
    for (const [src, dest] of skills) {
      console.log(`would link ${path.basename(src)} -> ${dest} (${src})`);
    }
    return;
  }

  execFileSync("bash", [path.join(root, "scripts/link-skills.sh")], {
    stdio: "inherit",
  });
}

const skills = collectSkills();

if (link) {
  installLink(skills);
  console.log(
    `${dryRun ? "Checked" : "Linked"} ${skills.length} skills to ~/.agents/skills.`,
  );
} else {
  installCopy(skills);
  console.log(
    `${dryRun ? "Checked" : "Installed"} ${skills.length} skills to ~/.agents/skills.`,
  );
}

console.log("Restart your agent (opencode, Cursor, etc.) to reload the skill list.");
