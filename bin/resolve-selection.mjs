import { buckets } from "./collect-skills.mjs";

const bucketIds = new Set(buckets.map((bucket) => bucket.id));

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const flags = new Set();
  /** @type {Record<string, string>} */
  const values = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--bucket" || arg === "--skill") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`);
      }
      values[arg.slice(2)] = value;
      i++;
      continue;
    }

    if (arg.startsWith("-")) {
      flags.add(arg);
    }
  }

  return { flags, values };
}

/**
 * @param {string | undefined} raw
 */
function splitList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {{ id: string, skills: { name: string, bucket: string }[] }[]} catalog
 * @param {{ flags: Set<string>, values: Record<string, string> }} parsed
 * @param {boolean} isInteractive
 */
export function resolveSelection(catalog, parsed, isInteractive) {
  const allSkills = catalog.flatMap((bucket) => bucket.skills);
  const allNames = new Set(allSkills.map((skill) => skill.name));
  const { flags, values } = parsed;

  const hasExplicitSelection =
    flags.has("--all") || values.bucket || values.skill || !isInteractive;

  if (hasExplicitSelection) {
    return filterByFlags(allSkills, values, allNames);
  }

  return null;
}

/**
 * @param {{ name: string, bucket: string }[]} allSkills
 * @param {Record<string, string>} values
 * @param {Set<string>} allNames
 */
function filterByFlags(allSkills, values, allNames) {
  const bucketFilter = new Set(splitList(values.bucket));
  const skillFilter = new Set(splitList(values.skill));

  for (const bucket of bucketFilter) {
    if (!bucketIds.has(bucket)) {
      throw new Error(
        `Unknown bucket "${bucket}". Expected one of: ${[...bucketIds].join(", ")}`,
      );
    }
  }

  for (const skill of skillFilter) {
    if (!allNames.has(skill)) {
      throw new Error(`Unknown skill "${skill}".`);
    }
  }

  return allSkills.filter((skill) => {
    if (bucketFilter.size > 0 && !bucketFilter.has(skill.bucket)) {
      return false;
    }
    if (skillFilter.size > 0 && !skillFilter.has(skill.name)) {
      return false;
    }
    return true;
  });
}

/**
 * @param {string[] | null} selectedNames
 * @param {{ name: string }[]} allSkills
 */
export function skillsFromNames(selectedNames, allSkills) {
  if (!selectedNames || selectedNames.length === 0) return [];
  const byName = new Map(allSkills.map((skill) => [skill.name, skill]));
  return selectedNames.map((name) => byName.get(name)).filter(Boolean);
}
