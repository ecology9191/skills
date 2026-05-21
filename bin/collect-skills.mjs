import fs from "node:fs";
import path from "node:path";

export const buckets = [
  { id: "engineering", label: "daily code work" },
  { id: "productivity", label: "daily non-code workflow tools" },
  { id: "misc", label: "kept around but rarely used" },
];

const DESCRIPTION_MAX = 80;

function readDescription(skillMdPath) {
  const content = fs.readFileSync(skillMdPath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";

  for (const line of match[1].split("\n")) {
    const desc = line.match(/^description:\s*(.+)$/);
    if (!desc) continue;

    let value = desc[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    const firstLine = value.split("\n")[0].trim();
    if (firstLine.length <= DESCRIPTION_MAX) return firstLine;
    return `${firstLine.slice(0, DESCRIPTION_MAX - 1)}…`;
  }

  return "";
}

/**
 * @param {string} root
 * @param {string} destRoot
 */
export function collectSkillsByBucket(root, destRoot) {
  /** @type {{ id: string, label: string, skills: { name: string, src: string, dest: string, description: string, bucket: string }[] }[]} */
  const catalog = [];

  for (const bucket of buckets) {
    const bucketDir = path.join(root, "skills", bucket.id);
    if (!fs.existsSync(bucketDir)) continue;

    /** @type {{ name: string, src: string, dest: string, description: string, bucket: string }[]} */
    const skills = [];

    for (const entry of fs.readdirSync(bucketDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const src = path.join(bucketDir, entry.name);
      const skillMd = path.join(src, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;

      skills.push({
        name: entry.name,
        src,
        dest: path.join(destRoot, entry.name),
        description: readDescription(skillMd),
        bucket: bucket.id,
      });
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    if (skills.length > 0) {
      catalog.push({ id: bucket.id, label: bucket.label, skills });
    }
  }

  return catalog;
}

/** @param {{ id: string, label: string, skills: { name: string }[] }[]} catalog */
export function flattenCatalog(catalog) {
  return catalog.flatMap((bucket) => bucket.skills);
}

/** @param {{ name: string, bucket: string }[]} skills */
export function countByBucket(skills) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const skill of skills) {
    counts[skill.bucket] = (counts[skill.bucket] ?? 0) + 1;
  }
  return counts;
}

/** @param {Record<string, number>} counts */
export function formatBucketCounts(counts) {
  return Object.entries(counts)
    .map(([bucket, count]) => `${bucket}: ${count}`)
    .join(", ");
}
