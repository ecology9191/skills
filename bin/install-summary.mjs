import os from "node:os";
import path from "node:path";

const home = os.homedir();

/** @param {string} targetPath */
export function shortenPath(targetPath) {
  const normalized = path.resolve(targetPath);
  if (normalized.startsWith(`${home}${path.sep}`)) {
    return `~${path.sep}${path.relative(home, normalized)}`;
  }
  return normalized;
}

/** @param {string} bucketId */
export function bucketTitle(bucketId) {
  return bucketId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** @param {string[]} paths */
export function dedupePaths(paths) {
  return [...new Set(paths)];
}

/**
 * @param {Map<string, { name: string, dest: string, src?: string }[]>} grouped
 * @param {{ mode: "copy" | "link", dryRun: boolean }} options
 */
export function formatInstallSummary(grouped, { mode, dryRun }) {
  const lines = [];
  const actionLabel = dryRun ? (mode === "link" ? "would link" : "would install") : mode;

  for (const [bucket, bucketSkills] of grouped) {
    lines.push("");
    lines.push(bucketTitle(bucket));

    for (const skill of bucketSkills) {
      const shortDest = shortenPath(skill.dest);

      if (mode === "copy") {
        const marker = dryRun ? actionLabel : "copied";
        lines.push(`✓ ${skill.name} (${marker})`);
        lines.push(`  → ${shortDest}`);
        continue;
      }

      if (dryRun) {
        lines.push(`✓ ${skill.name} (${actionLabel})`);
        lines.push(`  → ${shortDest}`);
        if (skill.src) {
          lines.push(`  → ${shortenPath(skill.src)}`);
        }
        continue;
      }

      lines.push(`✓ ${skill.name}`);
      lines.push(`  → ${shortDest}`);
      if (skill.src) {
        lines.push(`  → ${shortenPath(skill.src)}`);
      }
    }
  }

  const skillCount = [...grouped.values()].reduce((total, skills) => total + skills.length, 0);
  const verb = dryRun ? "Checked" : mode === "link" ? "Linked" : "Installed";

  return {
    title: `${verb} ${skillCount} skill${skillCount === 1 ? "" : "s"}`,
    lines: lines.join("\n").trimStart(),
  };
}
