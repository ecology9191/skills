# Issue tracker: Beads

Issues and specs (formerly called PRDs) for this repo live in `.beads/`. Use the `bd` CLI for all operations. `.beads/` must be committed/tracked in git for OpenCode/Sandcastle worktree sandboxes to see it; untracked local Beads state will not appear in worktrees.

This file is a seed template. When setup writes `docs/agents/issue-tracker.md`, replace every `<mapped-...-label>` placeholder with the exact string from `docs/agents/triage-labels.md`.

## Conventions

- **Issue IDs**: Beads IDs are strings like `bd-a1b2` or hierarchical IDs, never numeric issue numbers. If another skill says `#42`, issue number, or numeric issue reference, use the Beads string ID instead; if only a number is supplied, ask for or search for the Beads ID.
- **Create an issue**: `bd create "Title" --body-file - -t task -p 2 -l <mapped-needs-triage-label> --json`. Pipe multiline bodies through stdin or a body file. `--stdin` is an alias for `--body-file -`.
- **Create an AFK child issue**: `bd create "Title" --body-file - --parent <parent-id> -t task -p 2 -l <mapped-ready-for-agent-label> --json`.
- **Create a HITL child issue**: `bd create "Title" --body-file - --parent <parent-id> -t task -p 2 -l <mapped-ready-for-human-label> --json`.
- **Issue type**: `-t, --type` accepts `bug|feature|task|epic|chore|decision`; default is `task`.
- **Priority**: `-p 2` is Beads' default medium priority. `0` / `P0` is highest; `4` / `P4` is lowest. Sandcastle does not parse priority itself.
- **Labels**: `-l, --labels` accepts comma-separated labels, for example `-l <mapped-needs-triage-label>,bug`.
- **Read an issue**: `bd show <ID> --json` and `bd comments <ID> --json`.
- **List autonomous work**: `bd ready --label <mapped-ready-for-agent-label> --exclude-type epic --exclude-label wayfinder:map --json` returns unblocked AFK work. Never dispatch from raw `bd ready --json`: it can include HITL issues and coordination epics.
- **Query children for QA**: `bd list --parent <parent-id> --all --json --limit 0` returns the full parent-scoped child set.
- **List open work**: `bd list --status open --json` returns open issues, including blocked issues; don't use it as an autonomous queue.
- **Add a dependency**: `bd dep add <blocked-issue-id> <blocking-issue-id> --type blocks`. The blocking issue is the second positional argument. `--blocked-by` is also accepted, but prefer the positional form.
- **Comment on an issue**: `bd comments add <ID> "..." --json`. For multiline agent briefs or triage notes, use `bd comments add <ID> -f notes.md --json` or a safely quoted multiline shell string.
- **Apply / remove labels**: `bd label add <ID> <label>` / `bd label remove <ID> <label>`
- **Claim work**: `bd update <ID> --claim --json` when a workflow asks an agent to claim an issue.
- **Close**: `bd close <ID> --reason "..." --json`

## When a skill says "publish to the issue tracker"

Create a Beads issue with `bd create "Title" --body-file - -t task -p 2 -l <mapped-needs-triage-label> --json`, passing the Markdown body on stdin or from a body file.

## When a skill says "fetch the relevant issue"

Run `bd show <ID> --json` and `bd comments <ID> --json`.

## When the triage skill asks for incoming work

Run `bd list --status open --json`, then inspect relevant issues with `bd show <ID> --json` and `bd comments <ID> --json`. Queue helpers: `bd list --status open --no-labels --json`, `bd list --status open --label <mapped-needs-triage-label> --json`, and `bd list --status open --label <mapped-needs-info-label> --json`.

For large parent-scoped triage, fetch the full child set up front with `bd list --parent <parent-id> --all --json --limit 0`. Apply label changes in batches where possible, then add generated comments in small chunks of 5 to 10 issues to avoid command timeouts and duplicate comments.

Derive triage buckets from labels and comments:

- **Unlabeled**: open issues with no triage-role label.
- **Needs triage**: issues carrying the mapped `needs-triage` label.
- **Needs info**: issues carrying the mapped `needs-info` label; read comments to see what information was requested and whether the reporter has answered.

Process oldest first when timestamp fields are present. For triage transitions, remove existing state-role labels before adding the new mapped triage label. Use `bd label add <ID> <label>`, `bd label remove <ID> <label>`, and `bd comments add <ID> -f notes.md --json` to record transitions. Category labels `bug` and `enhancement` are literal Beads labels unless the repo documents another mapping.

## When `/to-qa` needs completed child work

Fetch the full child set with `bd list --parent <parent-id> --all --json --limit 0`.

Include only child issues whose stored status is `closed`. Exclude open, in-progress, blocked, deferred, or otherwise incomplete children and report them as warnings.

For each included child, read `bd show <child-id> --json` and `bd comments <child-id> --json`.

Do not mutate Beads issues during `/to-qa`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a Beads epic and each investigation is a child issue.

- **Map**: create an epic labelled `wayfinder:map`, with no ready-role label. Its body contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child issue**: create it with `--parent <map-id>`, a `wayfinder:<type>` label, and the mapped mode label. Use Beads type `decision` for research, prototype, and grilling issues; use `task` for a prerequisite task. AFK issues get `<mapped-ready-for-agent-label>`; HITL issues get `<mapped-ready-for-human-label>`.
- **Blocking**: `bd dep add <blocked-id> <blocker-id> --type blocks`.
- **AFK frontier**: `bd ready --parent <map-id> --label <mapped-ready-for-agent-label> --exclude-type epic --exclude-label wayfinder:map --unassigned --json`. Only this queue may be dispatched autonomously.
- **HITL frontier**: `bd list --parent <map-id> --status open --ready --label <mapped-ready-for-human-label> --no-assignee --json --limit 0`. Surface these issues to the human; do not dispatch them autonomously.
- **Claim**: `bd update <id> --claim --json` as the session's first write.
- **Resolve**: post the answer with `bd comments add`, close the child with `bd close`, then update the map body's Decisions so far with a one-line gist and child reference.
