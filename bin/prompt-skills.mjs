import { cancel, groupMultiselect, intro, isCancel, outro } from "@clack/prompts";

/**
 * @param {{ id: string, label: string, skills: { name: string, description: string }[] }[]} catalog
 * @returns {Promise<string[] | null>}
 */
export async function promptSkillSelection(catalog) {
  /** @type {Record<string, { value: string, label: string }[]>} */
  const options = {};
  const allNames = [];

  for (const bucket of catalog) {
    options[`${bucket.id} — ${bucket.label}`] = bucket.skills.map((skill) => ({
      value: skill.name,
      label: skill.description
        ? `${skill.name} — ${skill.description}`
        : skill.name,
    }));
    allNames.push(...bucket.skills.map((skill) => skill.name));
  }

  intro("ecology91-skills");

  const selected = await groupMultiselect({
    message: "Select skills to install",
    selectableGroups: true,
    options,
    initialValues: allNames,
    required: true,
  });

  if (isCancel(selected)) {
    cancel("Installation cancelled.");
    return null;
  }

  outro(`Selected ${selected.length} skill${selected.length === 1 ? "" : "s"}.`);
  return selected;
}
