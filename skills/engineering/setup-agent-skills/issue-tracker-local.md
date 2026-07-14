# Issue tracker: Local Markdown

Issues and specs (formerly called PRDs) for this repo live as structured Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The coordination parent/spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Every Markdown file anywhere under `.scratch/` starts with YAML-style frontmatter containing at least `id`, `title`, and `status`
- Child issues also set `parent` to the parent's exact frontmatter `id`
- `id` is a stable unique string. `/to-issues` uses the repo-relative file path, while integrations such as QA failure capture may use an opaque id and a separate file path
- `status` records lifecycle: `open`, `claimed`, `resolved` for Wayfinder decisions, or `closed|completed|done` for completed implementation
- `labels` is a comma-separated list of routing labels. Queued work carries exactly one mapped triage-state label; triaged incoming work also carries exactly one category label, `bug` or `enhancement`
- Read a legacy singular `label` field when necessary, but always write `labels`
- `mode` and `type` carry routing metadata without changing the required fields
- Blocking edges live under an exact `## Blocked by` heading and reference issue paths
- Comments and conversation history append under `## Comments`

Do not put freeform Markdown files under `.scratch/`. QA generation scans recursively and rejects files without the required frontmatter instead of guessing their meaning.

<parent-spec-frontmatter>

```markdown
---
id: .scratch/<feature-slug>/spec.md
title: "<Spec title>"
status: open
type: spec
---
```

</parent-spec-frontmatter>

<child-issue-frontmatter>

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
```

</child-issue-frontmatter>

## When a skill says "publish to the issue tracker"

Create or update a structured file under `.scratch/<feature-slug>/`. A spec or conversation that will be split into issues must have a structured parent at `spec.md`; every implementation child references its frontmatter `id` through `parent`.

## When a skill says "fetch the relevant issue"

If the reference is an existing repo-relative path, read that file. Otherwise recursively scan structured `.scratch` files for an exact frontmatter `id` match. `/to-issues` normally uses the path as the id; integrations may use an opaque id.

## When `/triage` asks for incoming work

Recursively scan structured issue files under `.scratch/` whose lifecycle `status` is `open`. Exclude specs, Wayfinder maps, children of Wayfinder maps, and implementation children already carrying `ready-for-agent` or `ready-for-human`; `/triage` handles incoming requests, not work already produced by `/to-issues`.

Build the attention buckets from the mapped state labels in `labels` (or legacy `label` when reading). Treat canonical role labels emitted by local tools, such as `needs-triage`, as aliases when the repo maps that role to a different string; normalize them to the mapped label on the first triage write.

- **Unlabeled**: no mapped triage-state label
- **Needs triage**: the mapped `needs-triage` label
- **Needs info**: the mapped `needs-info` label, with reporter activity after the latest triage note under `## Comments`

Process oldest first using a frontmatter `created` timestamp when present, then the issue path as a stable fallback. A generated QA failure already follows this contract with `status: open`, `type: bug`, and `labels: needs-triage, bug`.

For every triage transition, keep lifecycle `status: open`, replace the previous mapped or canonical-alias state label with exactly one mapped state label, and preserve exactly one category label (`bug` or `enhancement`). Do not accumulate conflicting state or category labels. For `wontfix`, use the mapped `wontfix` label and set `status: closed`. Append AI-generated briefs or notes under `## Comments`, beginning with the disclaimer required by `/triage`; preserve the file path so existing parent and blocker references remain stable.

## When `/implement` claims or completes child work

Claim an open implementation child by setting `status: claimed` before editing. After successful verification, review, and commit, append the commit and verification evidence under `## Comments`, then set `status: closed` in a final tracked commit. Keep its routing labels for provenance. Never claim or close the coordination parent/spec.

## When `/to-qa` needs completed child work

Recursively read structured Markdown under `.scratch/`. Find the parent whose `id` matches the requested source, then select children whose `parent` equals that id.

Include only children whose `status` is `closed`, `completed`, or `done`. Treat every other status as incomplete and report it as a warning. QA checks come from bullets under the first `## Acceptance notes` or `## Acceptance criteria` heading.

Use the child `id` and file path as source evidence. Do not create, rename, edit, close, or delete `.scratch` files during `/to-qa`.

## Wayfinding operations

Used by `/wayfinder`. The **map** and every child are structured issue files.

- **Map**: `.scratch/<effort>/map.md` with frontmatter `id` equal to that path, a title, `status: open`, `type: wayfinder-map`, and the body sections Destination, Notes, Decisions so far, Not yet specified, and Out of scope.
- **Child issue**: `.scratch/<effort>/issues/<NN>-<slug>.md` with required `id` and `title`; `status: open`; `parent` equal to the map id; `type: research|prototype|grilling|task`; `mode: AFK|HITL`; and the question in its body.
- **Blocking**: use an exact `## Blocked by` section containing issue paths. A Wayfinder issue is unblocked when every referenced file has `status: resolved`, `closed`, `completed`, or `done`.
- **Frontier**: scan child files in numeric order and select those that are open, unblocked, and unclaimed. Only `mode: AFK` issues may be dispatched autonomously; surface `mode: HITL` issues to the human.
- **Claim**: set `status: claimed` and save before doing any work.
- **Resolve**: append the answer under `## Answer`, set `status: resolved`, then append a one-line gist and relative link under the map's Decisions so far. Wayfinding issues are planning evidence, not completed implementation work for `/to-qa`.
