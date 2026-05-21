Skills are organized into bucket folders under `skills/`:

- `engineering/` — daily code work
- `productivity/` — daily non-code workflow tools
- `misc/` — kept around but rarely used
- `personal/` — tied to my own setup, not promoted
- `in-progress/` — drafts not yet ready to ship
- `deprecated/` — no longer used

Every skill in `engineering/`, `productivity/`, or `misc/` must have a reference in the top-level `README.md`. Those three bucket folders are exposed to opencode through `opencode.json`. Skills in `personal/`, `in-progress/`, and `deprecated/` must not appear in the top-level `README.md` or in `opencode.json` skill paths.

Promoted skills must also appear in `.claude-plugin/marketplace.json` so `npx skills add` shows the bucket-grouped install menu. After adding or moving a promoted skill, run `npm run generate:marketplace` and commit the updated manifest. Non-promoted skills must set `metadata.internal: true` in their `SKILL.md` frontmatter.

Each skill entry in the top-level `README.md` must link the skill name to its `SKILL.md`.

Each bucket folder has a `README.md` that lists every skill in the bucket with a one-line description, with the skill name linked to its `SKILL.md`.
