#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

for (const entry of pkg.files) {
  const target = path.join(root, entry);
  if (!fs.existsSync(target)) {
    console.error(`Missing packaged path: ${entry}`);
    process.exit(1);
  }
}

console.log(`Verified ${pkg.files.length} packaged paths.`);
