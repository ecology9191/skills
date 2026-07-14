# Issue tracker: GitLab

Issues and specs (formerly called PRDs) for this repo live as GitLab issues. Use the [`glab`](https://gitlab.com/gitlab-org/cli) CLI for all operations.

## Conventions

- **Create an issue**: `glab issue create --title "..." --description "..."`. Use a heredoc for multi-line descriptions. Pass `--description -` to open an editor.
- **Read an issue**: `glab issue view <number> --comments`. Use `-F json` for machine-readable output.
- **List issues**: `glab issue list -F json` with appropriate `--label` filters.
- **Comment on an issue**: `glab issue note <number> --message "..."`. GitLab calls comments "notes".
- **Apply / remove labels**: `glab issue update <number> --label "..."` / `--unlabel "..."`.
- **Close**: post the explanation with `glab issue note`, then run `glab issue close <number>`.

Infer the repo from `git remote -v` — `glab` does this automatically when run inside a clone.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, MRs run through the same labels and states as issues:

- **Read an MR**: `glab mr view <number> --comments` and `glab mr diff <number>`.
- **List external MRs for triage**: `glab mr list -F json`, then keep only contributions whose author is not a project member or owner.
- **Comment / label / close**: `glab mr note`, `glab mr update --label`/`--unlabel`, `glab mr close`.

Unlike GitHub, GitLab numbers issues and MRs separately, so `#42` is unambiguous once the surface is known.

## When a skill says "publish to the issue tracker"

Create a GitLab issue.

## When a skill says "fetch the relevant issue"

Run `glab issue view <number> --comments`.

## `/to-qa` support

This template does not define a default completed-child query for `/to-qa`. If this repo uses GitLab Issues with `/to-qa`, extend `docs/agents/issue-tracker.md` with:

- how parent issues link to child issues,
- how completed child work is identified,
- which issue states/labels count as completed,
- which command fetches the full child set.

Do not mutate GitLab issues during `/to-qa`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue and each investigation is a child issue.

- **Map**: create an issue labelled `wayfinder:map`. Its body contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope. A native epic may hold the map where the GitLab tier supports one.
- **Child issue**: put `Part of #<map>` at the top of the description and apply one `wayfinder:<type>` label plus the mapped mode label: `ready-for-agent` role for AFK or `ready-for-human` role for HITL.
- **Blocking**: use GitLab's native blocking link where available by posting `/blocked_by #<blocker>` as a note. Otherwise use `Blocked by: #<n>, #<n>` near the top of the child description.
- **Frontier**: list the map's open children, then exclude assigned issues and issues with an open native or fallback blocker. Separate them by mapped mode label. Only the AFK frontier may be dispatched autonomously; surface the HITL frontier to the human. Preserve map order within each mode.
- **Claim**: `glab issue update <n> --assignee @me` as the session's first write.
- **Resolve**: post the answer with `glab issue note`, close the child, then append a one-line gist and link under the map's Decisions so far.
