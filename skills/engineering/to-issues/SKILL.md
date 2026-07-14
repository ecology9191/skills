---
name: to-issues
description: Break a plan, spec, or the current conversation into independently-grabbable tracer-bullet issues with explicit blocking edges, published to the configured issue tracker.
disable-model-invocation: true
---

# To Issues

Break a plan, spec, or conversation into **issues** — tracer-bullet vertical slices, each declaring the issues that **block** it.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-agent-skills` if not. Setup defaults to existing Beads state, then local `.scratch`; it never chooses a hosted tracker from the Git remote without the user's explicit approval.

## Process

### 1. Gather context

Work from whatever is already in the conversation. If the user passes a spec path, issue number, URL, or local issue path, fetch it from the configured tracker and read its full body and comments.

### 2. Explore the codebase when needed

If the codebase has not already been explored, inspect enough of it to understand the current implementation. Issue titles and descriptions should use the project's domain glossary vocabulary and respect ADRs in the area being changed.

Look for prefactoring that would make the implementation easier: make the change easy, then make the easy change.

### 3. Draft vertical slices

Break the work into **tracer-bullet** issues.

<vertical-slice-rules>

- Each slice cuts a narrow but complete path through every required layer — vertical, not a horizontal slice of one layer.
- A completed slice is independently demoable or verifiable.
- Each slice fits in one fresh context window.
- Prefactoring lands first when later slices depend on it.

</vertical-slice-rules>

Give every issue its **blocking edges**: the other issues that must finish before it can start. An issue with no blockers is immediately on the **frontier**.

**Wide refactors are the exception to vertical slicing.** A wide refactor is one mechanical change whose blast radius spans the codebase, so no narrow slice can land green by itself. Sequence it as **expand–migrate–contract**:

1. **Expand** — add the new form beside the old so existing callers keep working.
2. **Migrate** — move callers in batches sized by blast radius, such as one package or directory per issue. Every batch is blocked by the expand issue.
3. **Contract** — remove the old form only after every migration issue is complete; it is blocked by all of them.

When individual migrations cannot stay green, keep the sequence on a shared integration branch and make every batch block a final integrate-and-verify issue. Do not pretend those batches are independently shippable tracer bullets.

### 4. Review the breakdown with the user

Present a numbered list. For each issue show:

- **Title** — a short descriptive name
- **Blocked by** — the issues that genuinely gate it, or none
- **What it delivers** — the end-to-end behavior that becomes real
- **User stories covered** — when the source spec contains user stories
- **Mode** — AFK (`ready-for-agent`) or HITL (`ready-for-human`)

Ask whether the granularity, blocking edges, modes, and boundaries are right. Merge or split issues until the user approves the complete list.

### 5. Publish to the configured tracker

Publish blockers first so later issues can reference real identifiers.

Read the actual label strings from `docs/agents/triage-labels.md`. The role names `ready-for-agent` and `ready-for-human` below are symbolic; every command and label field must use this repo's mapped string.

- **Local Markdown** — ensure `.scratch/<feature-slug>/spec.md` exists as a structured coordination parent, reusing the source spec when present or creating a concise parent record otherwise. Write one structured file per child at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order. Every file uses the frontmatter contract from the configured tracker doc; never write one combined or freeform issues file.
- **A hosted tracker** — create one tracker issue per slice. Use native parent/sub-issue and blocking relationships where available; otherwise record the relationships in the issue body.
- **Beads** — when the source is a parent issue, create each child with `--parent <parent-id>`. For AFK work use `bd create "Title" --body-file - --parent <parent-id> -t task -p 2 -l <mapped-ready-for-agent-label> --json`; for HITL work use the same command with `-l <mapped-ready-for-human-label>`. Add blocking edges with `bd dep add <blocked-child-id> <blocking-child-id> --type blocks`.

AFK issues receive the mapped `ready-for-agent` role; HITL issues receive the mapped `ready-for-human` role. A body-level `Blocked by` section documents the relationship for readers, but it does not replace a native tracker dependency.

Keep the source parent as a coordination record: do not close it or rewrite its body. If it already carries either mapped ready label, remove that label before publishing children so the parent cannot compete with them in an execution queue. That queue demotion is the only permitted parent mutation.

<local-issue-template>

```markdown
---
id: .scratch/<feature-slug>/issues/<NN>-<slug>.md
title: "<Issue title>"
status: open
labels: <mapped ready-for-agent or ready-for-human label>
parent: .scratch/<feature-slug>/spec.md
mode: AFK|HITL
type: task
---

# <NN> — <Issue title>

## Parent

.scratch/<feature-slug>/spec.md

## What to build

The end-to-end behavior this issue delivers from the user's perspective.

## Acceptance notes

- [ ] Human-visible behavior to verify after implementation
- [ ] Another observable outcome for QA

## Acceptance criteria

- [ ] Implementation criterion 1
- [ ] Implementation criterion 2

## Verification

Commands or checks the implementer should run. Prefer repository-standard commands.

## Out of scope

Adjacent behavior this issue must not change.

## Blocked by

- .scratch/<feature-slug>/issues/<blocking-issue>.md

Or `None — can start immediately` when there are no blockers.

## Comments
```

</local-issue-template>

<tracker-issue-template>

## Parent

A reference to the parent issue, if the source was an existing issue; otherwise omit this section.

## What to build

The end-to-end behavior this issue delivers from the user's perspective, not a layer-by-layer implementation list.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Verification

Commands or checks the implementer should run. Prefer repository-standard commands.

## QA notes

Human-visible behavior to verify after implementation.

## Out of scope

Adjacent behavior this issue must not change.

## Blocked by

- A reference to each blocking issue, or "None — can start immediately".

</tracker-issue-template>

In either template, avoid file paths and code snippets that will quickly go stale. If a prototype produced a compact snippet that encodes a decision more precisely than prose, include only that decision-rich portion and identify it as prototype evidence.

Work the **frontier**: any issue whose blockers are all complete. Tell the user to start each AFK issue in a fresh context and invoke `/implement` with only the spec, that issue, and the context pointers it needs. Surface HITL frontier issues to the human instead of dispatching them autonomously.
