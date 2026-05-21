#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectSkillsByBucket,
  countByBucket,
  flattenCatalog,
  formatBucketCounts,
} from "./collect-skills.mjs";
import { promptSkillSelection } from "./prompt-skills.mjs";
import { parseArgs, resolveSelection, skillsFromNames } from "./resolve-selection.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destRoot = path.join(os.homedir(), ".agents", "skills");

function printHelp() {
  console.log(`Usage: npx @ecology91/skills [options]

Install promoted skills into ~/.agents/skills.

From a git checkout, symlinks by default so local edits are picked up live.
From the published npm package, copies by default.

Interactive mode (TTY): pick buckets and individual skills in one menu.
Non-interactive (CI, pipes): installs all promoted skills.

  --dry-run         Print actions without installing
  --copy            Force copies instead of symlinks
  --link            Force symlinks
  --all             Skip menu; install all promoted skills
  --bucket <ids>    Comma-separated buckets (engineering, productivity, misc)
  --skill <names>   Comma-separated skill names`);
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

const { flags, values } = parsed;

if (flags.has("--help") || flags.has("-h")) {
  printHelp();
  process.exit(0);
}

const dryRun = flags.has("--dry-run");
const isGitCheckout = fs.existsSync(path.join(root, ".git"));
const link = flags.has("--link") || (isGitCheckout && !flags.has("--copy"));
const isInteractive =
  Boolean(process.stdin.isTTY && process.stdout.isTTY) && !flags.has("--all");

const catalog = collectSkillsByBucket(root, destRoot);
const allSkills = flattenCatalog(catalog);

function assertSafeDest() {
  if (!fs.lstatSync(destRoot, { throwIfNoEntry: false })?.isSymbolicLink()) {
    return;
  }

  const resolved = fs.realpathSync(destRoot);
  const repoReal = fs.realpathSync(root);
  if (resolved === repoReal || resolved.startsWith(`${repoReal}${path.sep}`)) {
    console.error(
      `error: ${destRoot} is a symlink into this repo (${resolved}).`,
    );
    console.error(
      `Remove it (rm "${destRoot}") and re-run; the installer will recreate it as a real dir.`,
    );
    process.exit(1);
  }
}

/** @param {{ bucket: string, name: string }[]} skills */
function groupSkillsByBucket(skills) {
  /** @type {Map<string, typeof skills>} */
  const grouped = new Map();
  for (const skill of skills) {
    const list = grouped.get(skill.bucket) ?? [];
    list.push(skill);
    grouped.set(skill.bucket, list);
  }
  return grouped;
}

/** @param {{ bucket: string, name: string, src: string, dest: string }[]} skills */
function installCopy(skills) {
  if (!dryRun) {
    assertSafeDest();
    fs.mkdirSync(destRoot, { recursive: true });
  }

  const grouped = groupSkillsByBucket(skills);
  for (const [bucket, bucketSkills] of grouped) {
    console.log(`${bucket} (${bucketSkills.length})`);
    for (const skill of bucketSkills) {
      if (dryRun) {
        console.log(`  would install ${skill.name} -> ${skill.dest}`);
        continue;
      }

      fs.rmSync(skill.dest, { recursive: true, force: true });
      fs.cpSync(skill.src, skill.dest, { recursive: true, force: true });
      console.log(`  installed ${skill.name} -> ${skill.dest}`);
    }
  }
}

/** @param {{ bucket: string, name: string, src: string, dest: string }[]} skills */
function installLink(skills) {
  if (dryRun) {
    const grouped = groupSkillsByBucket(skills);
    for (const [bucket, bucketSkills] of grouped) {
      console.log(`${bucket} (${bucketSkills.length})`);
      for (const skill of bucketSkills) {
        console.log(`  would link ${skill.name} -> ${skill.dest} (${skill.src})`);
      }
    }
    return;
  }

  assertSafeDest();
  fs.mkdirSync(destRoot, { recursive: true });

  const grouped = groupSkillsByBucket(skills);
  for (const [bucket, bucketSkills] of grouped) {
    console.log(`${bucket} (${bucketSkills.length})`);
    for (const skill of bucketSkills) {
      const stat = fs.lstatSync(skill.dest, { throwIfNoEntry: false });
      if (stat) {
        fs.rmSync(skill.dest, { recursive: true, force: true });
      }

      fs.symlinkSync(skill.src, skill.dest);
      console.log(`  linked ${skill.name} -> ${skill.src}`);
    }
  }
}

let selectedSkills;
try {
  selectedSkills = resolveSelection(catalog, parsed, isInteractive);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}

if (selectedSkills === null) {
  const selectedNames = await promptSkillSelection(catalog);
  if (selectedNames === null) {
    process.exit(0);
  }
  selectedSkills = skillsFromNames(selectedNames, allSkills);
}

if (selectedSkills.length === 0) {
  console.log("No skills selected.");
  process.exit(0);
}

if (link) {
  installLink(selectedSkills);
  const verb = dryRun ? "Checked" : "Linked";
  console.log(
    `${verb} ${selectedSkills.length} skills to ~/.agents/skills (${formatBucketCounts(countByBucket(selectedSkills))}).`,
  );
} else {
  installCopy(selectedSkills);
  const verb = dryRun ? "Checked" : "Installed";
  console.log(
    `${verb} ${selectedSkills.length} skills to ~/.agents/skills (${formatBucketCounts(countByBucket(selectedSkills))}).`,
  );
}

console.log("Restart your agent (opencode, Cursor, etc.) to reload the skill list.");
