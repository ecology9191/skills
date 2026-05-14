---
name: to-qa
description: Create a local QA To Do session from completed child work under an explicit parent issue. Use when user runs `/to-qa <parent issue>` or asks to turn completed issue work into QA checks.
compatibility: opencode
metadata:
  workflow: sandcastle-ralph-qa
---

# To QA

Use this skill when the user runs `/to-qa <parent issue>`.

The issue tracker workflow should have been provided to you — run `/setup-agent-skills` if `docs/agents/issue-tracker.md` is missing or if it does not explain how to fetch completed child work for a parent issue.

This skill reads from the configured issue tracker and writes to QA To Do. It does not mutate tracker issues.

## Required Inputs

- An explicit parent issue reference from the user.
- A configured issue tracker workflow in `docs/agents/issue-tracker.md`.
- A parent/child issue relationship where completed child work can be identified.
- Completed implementation work only.
- `qa-to-do` MCP server access.

## Workflow

1. Inspect the explicit parent issue in the current repo.
2. Using `docs/agents/issue-tracker.md`, find completed source work only: closed/completed/done Beads child issues, structured `.scratch` child files, GitHub/GitLab child issues if the repo documents that convention, or another repo-documented completed-child convention.
3. Read commits, changed files, and implementation context only as needed to write concrete QA checks.
4. Create human-verifiable QA checks with title, runnable steps, expected result, source issue ID, source evidence, stable ID, and fingerprint.
5. Call the `qa-to-do` MCP server to create the QA session.
6. Report the session title, source parent, item count, and warnings.

## Rules

- Do not create checks from open/incomplete child work; warn about excluded children.
- If there is no completed source work, fail clearly and do not create a session.
- If `docs/agents/issue-tracker.md` does not define how to find completed children for the parent issue, ask the user for explicit child issue references; do not infer from unrelated closed work.
- For Beads, fetch children with `bd list --parent <parent-id> --status all --json --limit 0`, include only closed/completed/done children, read each child with `bd show <child-id> --json` and `bd comments <child-id> --json`, and look for related RALPH commits with `git log --grep="RALPH:.*<child-id>" --oneline`.
- Create QA checks from acceptance criteria and QA notes before changed files. Do not create QA checks for parent PRDs, open children, blocked children, or review-only refactor commits unless they changed user-visible behavior.
- Do not write vague checks like "verify implementation" or "works as expected".
- Do not mutate pass/fail/skip/edit/archive/delete state through MCP.
- Do not file, close, or update tracker issues during `/to-qa`.
- QA To Do owns checklist execution, evidence, pass/fail state, and archive.
- No app-managed secrets are stored by this setup.
