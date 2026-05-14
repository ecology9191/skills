---
name: to-qa
description: Create a local QA To Do session from completed child work under an explicit parent issue. Use when user runs `/to-qa <parent issue>` or asks to turn completed issue work into QA checks.
compatibility: opencode
metadata:
  workflow: sandcastle-ralph-qa
---

# To QA

Use this skill when the user runs `/to-qa <parent issue>`.

This skill reads completed implementation work from the configured issue tracker and writes a local QA session to QA To Do. It does not mutate tracker issues, pass/fail state, checklist items, evidence, archive state, or deletion state.

## Required Inputs

- An explicit parent issue reference from the user.
- The current repository path.
- A configured issue tracker workflow in `docs/agents/issue-tracker.md`, or explicit child issue references from the user.
- Completed implementation child work only.
- Access to the `qa-to-do` MCP server.

## Supported Paths

- Prefer `qa-to-do.run_to_qa_parent` for normal `/to-qa` usage.
- Use `qa-to-do.qa_session_create` only when you have manually built a complete, validated QA session payload.
- `run_to_qa_parent` currently automates Beads and structured `.scratch` trackers.
- For GitHub, GitLab, or custom trackers, use the repo-documented parent/child convention to gather completed child work, then call `qa_session_create` with a concrete QA session payload.

## Workflow

1. Inspect the explicit parent issue in the current repo.
2. Read `docs/agents/issue-tracker.md` to understand how this repo identifies child work for a parent issue.
3. Find completed source work only: closed/completed/done Beads child issues, structured `.scratch` child files, or another repo-documented completed-child convention.
4. Exclude open, blocked, incomplete, or unrelated work and keep those exclusions as warnings for the final report.
5. Prefer acceptance criteria, QA notes, and source issue evidence over changed-file inference when creating checks.
6. Read commits, changed files, and implementation context only as needed to make checks concrete and human-verifiable.
7. Create QA checks with title, runnable steps, expected result, source issue ID, source evidence, stable ID, and fingerprint.
8. Call the `qa-to-do` MCP server to create the QA session.
9. Report the session title, source parent, item count, and warnings.

## MCP Usage

For Beads or structured `.scratch` repos, call `qa-to-do.run_to_qa_parent` with:

```json
{
  "parentIssueId": "<parent issue id>",
  "repoPath": "<absolute repo path>",
  "repoName": "<optional repo name>",
  "tracker": "auto"
}
```

Set `tracker` to `beads` or `scratch` only when the repo or user explicitly requires one. Use `auto` by default.

If `run_to_qa_parent` reports that no supported tracker was detected, multiple trackers require a choice, or no completed child work exists, stop and report the issue clearly. Do not invent QA checks from unrelated closed work.

When manually calling `qa_session_create`, the payload must include only completed source work and must preserve source evidence. Do not use it to mutate existing QA To Do state.

## Beads Guidance

- If the repo uses Beads and local automation is available, prefer `run_to_qa_parent` with `tracker: "auto"` or `tracker: "beads"`.
- If you must inspect Beads manually, fetch the full child set with `bd list --parent <parent-id> --status all --json --limit 0`.
- Include only child issues whose status is closed, completed, or done according to the repo's Beads vocabulary.
- Read included children with `bd show <child-id> --json` and `bd comments <child-id> --json` when extra evidence is needed.
- Look for related implementation commits only when issue evidence is not enough to write a concrete QA check.
- Do not create, update, label, comment on, close, or claim Beads issues during `/to-qa`.

## Scratch Guidance

- If the repo uses structured `.scratch` issues, prefer `run_to_qa_parent` with `tracker: "auto"` or `tracker: "scratch"`.
- Include only `.scratch` child files with frontmatter that identifies `id`, `title`, `status`, and the requested parent relationship.
- Prefer `## Acceptance notes` or `## Acceptance criteria` bullets for expected results.
- Do not create, edit, rename, move, close, or delete `.scratch` files during `/to-qa`.

## Rules

- Do not create checks from open, blocked, incomplete, review-only, or unrelated work.
- Do not create checks from parent PRD text alone; checks must trace to completed implementation child work.
- If there is no completed source work, fail clearly and do not create a session.
- If `docs/agents/issue-tracker.md` does not explain how to find completed children for the parent issue, ask the user for explicit child issue references.
- Do not write vague checks like "verify implementation" or "works as expected".
- Do not mutate pass/fail/skip/edit/archive/delete state through MCP.
- Do not file, close, claim, label, comment on, or update tracker issues during `/to-qa`.
- QA To Do owns checklist execution, evidence, pass/fail state, edits, archive, and deletion.
- Do not store app-managed secrets; rely on user environment, existing provider config, or provider-native auth.
