---
name: sandcastle-shadow-monitor
description: Shadow a referenced scoped Sandcastle PRD or issue run from launch through completion, maintaining a local churn ledger and separating issue failures from reusable workflow churn. Use when the user asks Codex to start, run, monitor, tail, supervise, or clean up a Sandcastle run involving `.scratch` or `.sandcastle/main.mts`.
---

# Sandcastle Shadow Monitor

Treat invocation with a referenced scope, PRD, or issue as authorization to start or attach to that scoped Sandcastle run and supervise it. Keep issue-tracker transitions runner-owned.

## Resolve the Run

1. Work from the repository root. Read `AGENTS.md`, the closest applicable `CONTEXT.md`, and the referenced PRD and issue files.
2. Derive one `.scratch/<scope>` and, when supplied, the exact `.scratch/<scope>/issues/<issue>.md`. Resolve ambiguity from repository evidence; ask only when more than one scope remains plausible.
3. Run the bundled `scripts/snapshot.mjs`, resolved relative to this `SKILL.md`:

   ```bash
   node <skill-directory>/scripts/snapshot.mjs --repo "$PWD" --scope <scope> [--issue <issue-id>]
   ```

   The helper creates `.scratch/<scope>/ledger.md` when absent, keeps its version-2 restartable cursor in `.scratch/<scope>/.sandcastle-shadow-state.json`, and emits a compact process, tracker, and log snapshot. The cursor records exact log byte ranges plus bounded, redacted recurrence candidates so restarts and log replacement do not replay the same evidence. A custom `--state` parent must already exist and resolve inside the real scope root; never route cursor reads or writes through a symlink.

Complete this stage only when the repository, scope, optional target issue, active-runner state, ledger path, and queue head are explicit.

## Attach or Start

Evaluate active runners before the ready queue:

- If exactly one runner for the referenced scope is active and the scope has at most one claimed issue, warn with its detected scope and the claimed issue or `<claim pending>`. Ask: `A Sandcastle runner is already active for <scope> on <issue>. Attach and proceed? Y/N`. Attach only after an affirmative answer.
- If a live matching runner has multiple claimed issues in its scope, report ambiguous claim state and stop.
- If any active runner belongs to another scope, its scope is unknown, or concurrent runner state is ambiguous, report the conflict and stop. A confirmation never authorizes a second runner.
- Repeat a runner scan once when it reports an inaccessible candidate or scan warning. Treat a persistent warning as ambiguous active-runner state and stop.
- If no runner is active and a target issue was supplied, require null `queueError` and `targetError` values plus `targetIsReadyHead: true` from the snapshot. On failure, report the target, actual queue head, target status, and error, then stop without changing issue state.
- If no runner is active and only a scope or PRD was supplied, require a null `queueError` and a non-null ready queue head.

With the preflight satisfied, start without another confirmation from the repository root in a watchable PTY/session:

```bash
MAIL_SEARCHER_ISSUE_SCOPE=<scope> npx --yes tsx .sandcastle/main.mts
```

The invocation authorizes this launch. Immediately poll until the runner claims an issue or exits. When an exact target was supplied, require the new claim to match it: the queue-head preflight and claim are not atomic. On mismatch, interrupt only the runner session started by this invocation so its signal handler restores the claim, then report the race. Do not repair the mismatch through tracker writes.

The runner owns claim, restore, merge-blocked, needs-manual-review, and close transitions; use tracker reads to observe those transitions.

## Monitor by Delta

1. Poll the runner session and rerun `scripts/snapshot.mjs` after meaningful output or at least once per minute while waiting. Read `logs.deltas`, `logs.events`, and `logs.recurrenceCandidates`; use the reported paths and offsets for a focused raw-log read only when the delta needs investigation.
2. Track process health, claimed issue, implementation/review/rework phase, retries, queue movement, and normal or abnormal completion. Treat a stopped process as a state to classify, not proof that the scoped run is complete.
3. Report concise updates containing the current issue and phase, latest meaningful event, blocker, and new recurrence candidates. A candidate fingerprint is a stable matching aid, not a generic-churn classification.
4. Delegate only a bounded anomaly investigation that benefits from an independent view. Give it raw paths and bounded excerpts, then integrate its result into this monitor.
5. When a possible generic churn event appears or a ledger item must change, read [references/churn-policy.md](references/churn-policy.md) and apply its classification, ledger, and patch rules.

Use the snapshot cursor and open ledger items as the normal working set. Open complete logs or closed ledger history only for a focused investigation.

## Reconcile a Verified Recurrence

After applying the churn policy, reconcile evidence automatically only when a human or monitoring agent has selected both the pending candidate and the exact existing ledger item, and that item contains `Classification: generic churn`:

```bash
node <skill-directory>/scripts/snapshot.mjs \
  --repo "$PWD" \
  --scope <scope> \
  --reconcile-item <churn-id> \
  --evidence-id <evidence-v1-id>
```

The command increments the existing item once, appends the bounded evidence reference, updates `Last seen` from the event's occurrence timestamp, and reopens a closed item while retaining its prior resolution. Candidates also retain a distinct observation timestamp and use `occurrenceSource: observation-fallback` when a log event has no unambiguous timestamp with a timezone. It writes the ledger before marking evidence consumed in the cursor, so retry the same command after an interruption. Stop if the cursor reports evidence consumed but the selected ledger item contains neither its durable reconciliation identity nor legacy display evidence; do not repair a true cursor-ahead state by guessing.

Never use a candidate to create a ledger item, choose between ledger items, or change a classification automatically. Normal snapshots do not reconcile ledger rows.

The cursor retains at most 128 pending candidates and 512 consumed evidence IDs. Each ledger row retains at most 8 display evidence references and a separate `Reconciliation IDs` history of at most 512 identities. Candidate symptoms are limited to 240 Unicode code points. Candidate and partial-line cursor text redact Telegram API hashes and IDs, phone numbers, Telethon sessions, Authorization credentials, and uppercase environment assignments. Dedupe is exact only within the shared 512-identity horizon; an older observation may surface again after its identity ages out.

## Finish

Continue until the scoped runner has completed, or until a concrete blocker requires user authority or external state. Before yielding:

1. Take a final snapshot, classify every observed candidate, and explicitly reconcile each verified generic recurrence into its exact existing scope-ledger item with accurate `open` or `closed` status.
2. Report the runner state, completed or blocked issues, issue-specific failures, open generic churn, patches applied or deferred, and verification performed.
3. Leave no agent-started tail session running silently. If a runner remains live by user choice, state its PID, scope, issue, and how monitoring was handed off.

Completion requires the final report and ledger to agree with the last process, tracker, and log evidence.
