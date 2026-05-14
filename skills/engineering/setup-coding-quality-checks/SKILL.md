---
name: setup-coding-quality-checks
description: Onboards a repo for local-only development by installing and documenting strict Coding Quality Checks that make AI-agent coding safer and more correct. Use when the user wants to set up or strengthen local formatters, linters, typechecks, tests, security scanners, build checks that already exist, or git hooks for a greenfield or brownfield repo.
---

# Setup Coding Quality Checks

Set up a local correctness environment where AI agents can work safely. Keep scope tight: formatter, linter, typecheck, tests, security scanners when warranted, git hooks, and existing build checks only. Do not turn this into a broad validation framework.

## Principles

- Use **Coding Quality Checks** as the umbrella term.
- Explore before asking. If repo evidence answers a question, use it.
- Ask one decision at a time, with a recommended answer.
- Prefer strict correctness over convenience; brownfield repos may fail immediately.
- Do not auto-format or lint-autofix source without separate confirmation.
- Do not invent build steps or aggregate commands. Preserve repo terminology.
- Sub-agents may discover and draft plans; the main agent owns decisions, confirmation, and edits.

## 1. Discover

Inspect before asking. Use sub-agents freely when useful; give each a radically different angle: stack discovery, existing tooling, security/hook risks, or greenfield planning clues.

Look for repo instructions (`AGENTS.md`, `.cursor/rules`, copilot instructions), Sandcastle docs (`.sandcastle/**/*.md`), package manifests, lockfiles, existing configs/scripts, tests, source layout, and existing CI files. Use CI as evidence, but ask before editing it.

For Beads, inspect `.beads/` and use read-only `bd` commands when available. Use issues for stack clues and acceptance criteria; never mutate Beads unless separately asked.

For greenfield repos, inspect README, PRDs, roadmap, Beads issues, package manifests, and planning docs before asking the user for the intended stack.

For transcripts, search only repo-local notes such as `.opencode/`, `.aider*`, `.continue/`, `transcripts/`, `chat.md`, `SESSION.md`, or `notes/`. Treat transcript evidence as weak and use it only for quality-check clues.

Evidence order: current user instruction; agent/repo docs and Sandcastle prompts; scripts/configs/manifests/lockfiles; Beads acceptance criteria; CI files; transcripts; source layout; ecosystem defaults.

Stop and ask if package-manager signals conflict. Never create a second lockfile family.

## 2. Interview

Present only relevant findings, then walk the user through decisions in this order. Skip irrelevant categories.

1. Local-only meaning: ask whether installs/scanner network access are allowed for this repo.
2. Formatter: recommend one formatter matching repo convention; add check-mode scripts; do not format files automatically.
3. Linter: recommend strict correctness linting that does not fight the formatter; add fix scripts only as explicit commands; do not autofix automatically.
4. Typecheck: recommend strict practical settings; warn brownfield repos about blast radius.
5. Tests: recommend local test tooling; if no tests exist, ask whether to add a minimal runner proof, no test files, or real starter tests.
6. Existing build checks: only discuss if the repo already has a meaningful build/package/compile command; no fake builds.
7. Security scanners: ask when warranted. Secret scanning is conditional opt-in for real credential risk. Dependency audits are opt-in when package-manager/lockfile evidence supports them. Call out network or telemetry.
8. Git hooks: recommend strict fast pre-commit hooks and keep slower checks separate unless the user accepts slow hooks.
9. Extra static-style checks: ask before including every extra, even when evidence suggests one.
10. Repo docs: recommend `docs/agents/coding-quality-checks.md` plus optional `AGENTS.md` agent block.
11. CI: if CI exists, ask whether to update it; default to no CI edits unless the user opts in.

For command naming, preserve repo lingo. If Sandcastle docs name exact commands like `npm run typecheck` and `npm run test`, preserve them as agent-facing commands. If no local lingo exists, ask before creating a fallback aggregate such as `check`.

## 3. Confirm

Before installing or editing, show this exact confirmation shape:

```text
I will set up local Coding Quality Checks with:
Package manager: <pm or none>
Tools/dev dependencies: <list>
Files expected to change: <list>
Scripts/commands added or changed: <list>
Git hooks: <exact behavior or none>
Security scanners: <local/offline/networked/none>
CI edits: <yes/no>
Auto-format/autofix source writes: none unless separately confirmed

Proceed with these exact changes?
```

Stop if target files are dirty and conflict with planned edits, package-manager detection is ambiguous, a scanner violates the chosen local-only meaning, or an existing config cannot be merged safely.

## 4. Implement

After confirmation, make minimal, idempotent edits. Prefer existing config files and script conventions. Follow existing version pinning style. Never delete or replace existing configs unless explicitly approved.

Allowed after confirmation: package/tool configs, dev dependencies and lockfile updates, agreed scripts, agreed hook-manager config, `docs/agents/coding-quality-checks.md`, and optional agent instruction block.

Forbidden without separate confirmation: repo-wide formatting, lint autofix, generated-code rewrites, runtime dependency changes, CI edits unless opted in, and Beads mutations.

## 5. Document

Write `docs/agents/coding-quality-checks.md` with exact commands, what each command proves, known brownfield failures, and what agents should run before commits. If updating `AGENTS.md`, keep the block short and point to the doc.
