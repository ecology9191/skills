---
name: setup-agent-skills
description: Configure AGENTS.md and docs/agents so engineering skills share an issue tracker, triage labels, and domain-doc layout, defaulting to existing Beads or local Markdown with hosted trackers available by explicit choice.
disable-model-invocation: true
---

# Setup Agent Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker** — where issues live and how tracker-native operations work
- **Triage labels** — the strings used for the five canonical triage roles
- **Domain docs** — where `CONTEXT.md` and ADRs live, and the consumer rules for reading them

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config` — inventory hosted services that could be offered as explicit opt-ins; a remote does not select the issue tracker
- `.beads/` — is Beads already initialized for local issue tracking?
- `bd --help` or `command -v bd` — is the Beads CLI available?
- `.sandcastle/` — does existing Sandcastle prompt/config scaffolding mention Beads commands such as `bd ready --json`?
- If `.sandcastle/` exists, inspect prompts for stale RALPH anti-patterns: autonomous dispatch from raw `bd ready --json` without the mapped AFK label and epic/map exclusions, planner analyzing dependencies from readiness output, implementer saying "fill your context window", implementer preloading full recent commits, implementer fetching issue context itself instead of using provided task context, merge prompt running tests after each branch, or merge prompt closing all listed issues instead of only merge-eligible issues.
- `AGENTS.md` at the repo root — does it exist? Is there already an `## Agent skills` section?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/` — does this skill's prior output already exist?
- `.scratch/` — sign that a local-Markdown issue tracker convention is already in use
- Monorepo signals such as `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or populated `packages/*` directories with their own source trees

### 2. Present findings and ask

Summarise what's present and what's missing. Then walk the user through the three decisions **one at a time** — present a section, get the user's answer, then move to the next. Lead with the recommended answer, based on the evidence you found.

Assume the user does not know what these terms mean. Each section starts with a short explainer: what it is, why the skills need it, and what changes if they pick differently.

**Section A — Issue tracker.**

> The issue tracker is where this repo's work items live. `/to-issues`, `/to-spec`, `/triage`, `/to-qa`, and `/wayfinder` need to know which tool and conventions to use. `/to-qa` reads completed child work without mutating tracker state; `/wayfinder` also needs map, child, blocking, frontier, claim, and resolution operations.

Default posture is always local-first:

- If `.beads/` exists or the repo's Sandcastle/RALPH configuration explicitly uses the `bd` CLI, recommend **Beads**.
- Otherwise recommend **Local Markdown** under `.scratch/`, even when the repo has a GitHub or GitLab remote.
- Never select a hosted tracker merely because a Git remote exists. GitHub, GitLab, and other remote services require an explicit user choice.

Offer choices in this order:

- **Beads** — issues live in `.beads/` and use the `bd` CLI; this is the default only when Beads is already initialized or explicitly configured
- **Local Markdown** — specs and issues live under `.scratch/<feature>/`; this is the default everywhere else
- **GitHub** — opt in to GitHub Issues and the `gh` CLI
- **GitLab** — opt in to GitLab Issues and the `glab` CLI
- **Other** — ask the user to describe the workflow in one paragraph; remote services remain opt-in

Make sure the chosen tracker documentation explains how to fetch completed child work for `/to-qa`. It must also define the tracker-specific operations `/wayfinder` needs. The bundled Beads and local templates include completed-child lookup; custom, GitHub, and GitLab configurations may need a repo-specific parent/child convention for QA.

If — and only if — the user picked **GitHub** or **GitLab**, ask one follow-up:

> Open-source repos often receive feature requests as pull or merge requests, not just issues. If enabled, `/triage` includes external contributions in the same queue while leaving collaborators' in-flight work alone.

- **External PRs/MRs as a request surface** — yes / no (recommended: no). Record the answer in `docs/agents/issue-tracker.md`.

If stale `.sandcastle/` prompt anti-patterns are present, warn that the prompts should be updated before autonomous work. Beads-backed Sandcastle loops should build their queue with the mapped `ready-for-agent` label and exclude epics and `wayfinder:map`; `.scratch` loops should use the configured local frontier contract. Every loop should pass compact readiness output to the planner, load task context once before implementer launch, use completion signals for merge eligibility, and run verification at the right level rather than repeatedly per branch.

**Section B — Triage label vocabulary.**

> `/triage`, `/to-spec`, and `/to-issues` apply state labels. The skills need the strings this repo actually uses so they do not invent duplicate labels.

The five canonical roles are:

- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter
- `ready-for-agent` — fully specified and AFK-ready
- `ready-for-human` — needs human implementation or interaction
- `wontfix` — will not be actioned

Recommend keeping these defaults unless the tracker already uses other names. Ask whether the user wants any overrides, then record the mapping.

**Section C — Domain docs.**

> Skills read `CONTEXT.md` for project vocabulary and ADRs for past decisions. They need to know whether the repo has one shared context or several.

Recommend **single-context** when exploration found no substantial monorepo structure; recommend **multi-context** when it did. Ask the user to confirm:

- **Single-context** — one `CONTEXT.md` and `docs/adr/` at the repo root
- **Multi-context** — a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files and ADR directories

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to `AGENTS.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`

Let them edit the draft before writing.

### 4. Write

If `AGENTS.md` exists, edit it; otherwise create it. Update an existing `## Agent skills` block in place rather than appending a duplicate, and preserve surrounding user content.

The block:

```markdown
## Agent skills

### Issue tracker

[Where issues are tracked, including whether external PRs/MRs are a triage surface]. See `docs/agents/issue-tracker.md`.

### Triage labels

[The label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[Single-context or multi-context]. See `docs/agents/domain.md`.
```

Write the three docs using the templates in this skill folder:

- [issue-tracker-github.md](./issue-tracker-github.md)
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md)
- [issue-tracker-beads.md](./issue-tracker-beads.md)
- [issue-tracker-local.md](./issue-tracker-local.md)
- [triage-labels.md](./triage-labels.md)
- [domain.md](./domain.md)

The issue-tracker templates use `<mapped-...-label>` placeholders. Replace every placeholder with the exact string agreed in Section B; never leave a placeholder or silently fall back to the canonical default.

For a custom tracker, write `docs/agents/issue-tracker.md` from the user's description. It must cover publishing and reading issues, native parent/blocking relationships where available, completed-child lookup for `/to-qa`, and a `## Wayfinding operations` section.

### 5. Done

Tell the user setup is complete and which engineering skills will read these files. They can edit `docs/agents/*.md` directly later; re-run this skill only when switching workflows or rebuilding the configuration.
