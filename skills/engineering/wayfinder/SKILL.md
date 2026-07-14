---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of investigation issues on your issue tracker, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on the repo's issue tracker, then works its issues one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every issue. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic — engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is **planning** by default: each issue resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — carrying execution into the map itself — but absent that, produce decisions, not deliverables.

## Refer by name

The map and every child are tracker issues, so each has a **name** — its title. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish — a name wraps its link — but they ride *inside* the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker — the canonical artifact. Mark it with `wayfinder:map` where the tracker supports labels; local Markdown uses `type: wayfinder-map`. Its investigations are child issues of the map.

The map is an **index**, not a store. It lists the decisions made and points at the issues that hold their detail; a decision lives in exactly one place — its issue — so the map never restates it, only gists it and links.

**Where the map, its child issues, blocking, and frontier queries physically live is tracker-specific.** The issue tracker must have been provided to you. If it is missing, stop and ask the user to run `/setup-agent-skills`; that setup defaults to existing Beads state, then local `.scratch`, and never infers a hosted tracker from the Git remote. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them.

### The map body

The whole map at low resolution, loaded once per session. Open issues are **not** listed — they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing an issue.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index — one line per closed issue: enough to judge relevance, then zoom the link for the detail the issue holds -->

- [<closed issue title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't turn into an issue yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Issues

Each issue is a **child issue** of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this issue resolves>
```

Each issue carries one Wayfinder type — `research`, `prototype`, `grilling`, or `task` (see [Issue Types](#issue-types)). Use a `wayfinder:<type>` label where supported; local Markdown stores it in frontmatter `type`.

Each issue also persists its **mode**: AFK or HITL. On hosted trackers and Beads, apply the mapped `ready-for-agent` role to AFK issues and the mapped `ready-for-human` role to HITL issues. In local Markdown, record frontmatter `mode: AFK|HITL`. Type does not imply mode because a `task` can be either.

A session **claims** an issue with the configured tracker's Claim operation, **first**, before any work, so concurrent sessions skip it. Hosted trackers may use assignment; Beads uses `bd update --claim`; local Markdown sets `status: claimed`.

Blocking uses the tracker's native dependency relationship where available; a tracker without native blocking uses its configured body convention. An issue is **unblocked** when every blocker has the tracker's terminal resolution state. The **frontier** is the open, unblocked, unclaimed children — the edge of the known. Automated dispatch may claim only AFK frontier issues; HITL frontier issues must be surfaced to the human.

Record the answer with the configured tracker's Resolve operation (see [Work through the map](#work-through-the-map)); local Markdown appends it under `## Answer`. Assets created while resolving an issue are linked from it, not pasted into it.

## Issue Types

Every issue is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL issue only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases. Creates a markdown summary as a linked asset. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the /prototype skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation via the /grilling and /domain-modeling skills, one question at a time. The default case.
- **Task** (HITL or AFK): Manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later issues depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live issues lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving an issue clears the fog ahead of it, graduating whatever's now specifiable into fresh issues — one at a time, until the way to the destination is clear and no issues remain.

The map's **Not yet specified** section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination — everything here is in scope, just not sharp enough to become an issue. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

**Fog or issue?** The test is whether you can state the question precisely now — _not_ whether you can answer it now.

- **Issue when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Not yet specified when** you can't yet phrase it that sharply. Don't pre-slice the fog into issue-sized pieces: it's coarser than an issue, and one patch may graduate into several issues, or none, once the frontier reaches it.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live issue, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is **out of scope** — it isn't fog, and it doesn't belong in **Not yet specified**. It gets its own **Out of scope** section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates — the frontier stops at the destination — so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When an issue that already exists turns out to sit past the destination — mis-scoped in while charting, or exposed by a resolution — **close it** (a closed issue is unambiguously off the frontier) and leave one line in the **Out of scope** section: the gist plus why it's out of scope, linking the closed issue. It stays out of **Decisions so far**, which records the route actually walked — a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, **never resolve more than one issue per session.**

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Run a `/grilling` and `/domain-modeling` session to pin down what this map is finding its way to — the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the way to the destination is already clear, the whole journey small enough for one session — you don't need a map. Stop and ask the user how they'd like to proceed.
3. **Create the map** with the configured tracker's map marker (`wayfinder:map` label where supported, `type: wayfinder-map` in local Markdown): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into **Not yet specified**.
4. **Create the issues you can specify now** as child issues of the map — then wire blocking edges in a **second pass** (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog — the **Not yet specified** section.
5. Stop — charting the map is one session's work; do not also resolve issues.

### Work through the map

User invokes with a map (URL or number). An issue is **optional** — without one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every issue body.
2. Choose the issue. If the user named one, recheck that it is open, unblocked, and unclaimed; otherwise take the first frontier issue in order. Respect its mode: an AFK issue may run autonomously; a HITL issue requires the human's live participation. **Claim it** with the configured tracker operation before any work.
3. Resolve it — **zoom as needed**: fetch the full body of any related or closed issue on demand; invoke the skills the `## Notes` block names. If in doubt, use `/grilling` and `/domain-modeling`.
4. Record the resolution with the configured tracker's Resolve operation, then **append a context pointer** to the map's Decisions-so-far. Hosted trackers and Beads may use a resolution comment plus close; local Markdown writes `## Answer` and sets `status: resolved`.
5. Add newly-surfaced issues (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new issue. If the answer reveals that an issue — this one or another — sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those issues.

The user may run unblocked issues in parallel, so expect other sessions to be editing the tracker concurrently.
