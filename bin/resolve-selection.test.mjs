import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, resolveSelection, skillsFromNames } from "./resolve-selection.mjs";

const catalog = [
  {
    id: "engineering",
    label: "daily code work",
    skills: [
      { name: "tdd", bucket: "engineering" },
      { name: "diagnose", bucket: "engineering" },
    ],
  },
  {
    id: "productivity",
    label: "daily non-code workflow tools",
    skills: [{ name: "caveman", bucket: "productivity" }],
  },
];

test("parseArgs splits bucket and skill values", () => {
  const parsed = parseArgs(["--bucket", "engineering", "--skill", "tdd,diagnose"]);
  assert.equal(parsed.values.bucket, "engineering");
  assert.equal(parsed.values.skill, "tdd,diagnose");
});

test("resolveSelection returns all skills when non-interactive", () => {
  const parsed = parseArgs([]);
  const selected = resolveSelection(catalog, parsed, false);
  assert.equal(selected?.length, 3);
});

test("resolveSelection filters by bucket", () => {
  const parsed = parseArgs(["--bucket", "engineering"]);
  const selected = resolveSelection(catalog, parsed, true);
  assert.deepEqual(
    selected?.map((skill) => skill.name).sort(),
    ["diagnose", "tdd"],
  );
});

test("resolveSelection intersects bucket and skill filters", () => {
  const parsed = parseArgs(["--bucket", "engineering", "--skill", "tdd"]);
  const selected = resolveSelection(catalog, parsed, true);
  assert.deepEqual(selected?.map((skill) => skill.name), ["tdd"]);
});

test("resolveSelection rejects unknown bucket", () => {
  const parsed = parseArgs(["--bucket", "personal"]);
  assert.throws(
    () => resolveSelection(catalog, parsed, true),
    /Unknown bucket "personal"/,
  );
});

test("skillsFromNames preserves prompt order", () => {
  const allSkills = catalog.flatMap((bucket) => bucket.skills);
  const selected = skillsFromNames(["caveman", "tdd"], allSkills);
  assert.deepEqual(selected.map((skill) => skill.name), ["caveman", "tdd"]);
});
