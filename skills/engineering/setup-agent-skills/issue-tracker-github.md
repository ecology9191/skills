# Issue tracker: GitHub

Issues and specs (formerly called PRDs) for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant issue"

Run `gh issue view <number> --comments`.

## `/to-qa` support

This template does not define a default completed-child query for `/to-qa`. If this repo uses GitHub Issues with `/to-qa`, extend `docs/agents/issue-tracker.md` with:

- how parent issues link to child issues,
- how completed child work is identified,
- which issue states/labels count as completed,
- which command fetches the full child set.

Do not mutate GitHub issues during `/to-qa`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue and each investigation is a child issue.

- **Map**: create an issue labelled `wayfinder:map`. Its body contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child issue**: link an issue to the map as a GitHub sub-issue using `gh api` on the sub-issues endpoint. If sub-issues are unavailable, add it to a task list in the map and put `Part of #<map>` at the top of its body. Apply one `wayfinder:<type>` label plus the mapped mode label: `ready-for-agent` role for AFK or `ready-for-human` role for HITL.
- **Blocking**: use native issue dependencies when available. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where the database id comes from `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. Otherwise use `Blocked by: #<n>, #<n>` near the top of the child body.
- **Frontier**: list the map's open children, then exclude assigned issues and issues with an open blocker. Separate them by mapped mode label. Only the AFK frontier may be dispatched autonomously; surface the HITL frontier to the human. Preserve map order within each mode.
- **Claim**: `gh issue edit <n> --add-assignee @me` as the session's first write.
- **Resolve**: post the answer as a comment, close the child, then append a one-line gist and link under the map's Decisions so far.
