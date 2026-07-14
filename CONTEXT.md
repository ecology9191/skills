# Agent Skills

A collection of agent skills (slash commands and behaviors) for OpenCode and other coding-agent harnesses. Skills are organized into buckets and consumed by per-repo configuration emitted by `/setup-agent-skills`.

## Language

**Issue tracker**:
The tool or local convention that holds a repo's issues — Beads, structured Markdown under `.scratch/`, or an explicitly configured hosted service such as GitHub or GitLab. Skills like `to-issues`, `to-spec`, and `triage` read from and write to it. `/to-qa` reads parent and completed child work from it, but writes QA checklist state to QA To Do instead. Default locally: existing Beads state first, then `.scratch`; never infer a hosted tracker from a Git remote.
_Avoid_: backlog manager, backlog backend, issue host

**Issue**:
A single tracked unit of work inside an **Issue tracker** — a bug, task, spec, or slice produced by `to-issues`.
_Avoid_: ticket (use only when quoting external systems that call them tickets)

**Triage role**:
A canonical state-machine label applied to an **Issue** during triage (e.g. `needs-triage`, `ready-for-agent`). Each role maps to a real label string in the **Issue tracker** via `docs/agents/triage-labels.md`.

## Relationships

- An **Issue tracker** holds many **Issues**
- An **Issue** carries one **Triage role** at a time

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
