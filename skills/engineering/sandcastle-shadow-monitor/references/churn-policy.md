# Churn Policy

Read this reference when a snapshot exposes a possible generic workflow failure or when updating the scope ledger.

## Classification

Classify a failure as **issue-specific** when it depends on the active issue's acceptance criteria, domain behavior, implementation choice, or focused tests. Hand it back to the implementer/reviewer path and keep it out of the generic churn ledger.

Classify a failure as **generic churn** only when evidence shows it can recur across unrelated issues, such as:

- runner command, cwd, path, or ownership assumptions
- issue-tracker lifecycle failures independent of one issue's requirements
- log discovery, rotation, cursor, or parsing failures
- missing local tools, dependency bootstrap, or environment assumptions
- prompt, dispatch, retry, sandbox, or process-lifecycle failures independent of the issue
- generated/runtime artifacts distorting workflow decisions

Keep uncertain failures issue-specific until cross-issue or workflow evidence proves them generic.

## Ledger Contract

Use `.scratch/<scope>/ledger.md` as uncommitted workflow state. Cite bounded log paths and byte offsets instead of copying large evidence. Create one item per distinct generic symptom and merge recurrences into that item.

Use this compact schema:

```markdown
## churn-<stable-slug> — <symptom>

Status: open|closed
First seen: <timestamp>
Last seen: <timestamp>
Count: <positive integer>
Issue/run: <issue ID and run ID, when known>
Evidence: <log path and offsets or focused command>
Reconciliation IDs: <ordered evidence-v1 identities; maintained by the helper>
Impact: <what cannot proceed>
Classification: generic churn
Action: <workaround, proposed fix, or owner>
Resolution: <evidence when closed; otherwise Pending>
```

Use `Status: open` for unresolved, deferred, or unverified churn. Set `Status: closed` only when the same item contains conclusive resolution evidence. Reopen a closed item when the symptom recurs after its recorded resolution, increment `Count`, and retain both the old resolution and new evidence. Keep the stable ID when merging duplicates.

Recording or closing ledger items is authorized under this skill invocation. Recording does not authorize a workflow patch.

## Recurrence Reconciliation

`logs.recurrenceCandidates` contains redacted evidence identities and semantic fingerprints. Treat a fingerprint only as a matching aid: it does not establish generic churn, choose a ledger row, or authorize reclassification.

After classifying the observation and selecting an existing ledger row that contains the exact `Classification: generic churn` field, reconcile one pending candidate explicitly:

```bash
node <skill-directory>/scripts/snapshot.mjs \
  --repo "$PWD" \
  --scope <scope> \
  --reconcile-item <churn-id> \
  --evidence-id <evidence-v1-id>
```

The command is idempotent for that evidence identity. It increments `Count` once, uses the candidate's canonical occurrence timestamp for `Last seen`, appends a bounded path-and-byte-range display reference, records the identity in `Reconciliation IDs`, and reopens a closed row without discarding its recorded resolution. The candidate keeps observation time separately and uses `occurrenceSource: observation-fallback` when no unambiguous event timestamp with a timezone is present. The command refuses missing candidates, non-generic rows, altered identities or coordinates, and true cursor-ahead state.

Persistence is ledger-first and atomic per file. If execution stops after the ledger rename but before the cursor rename, rerun the same command to repair the cursor without double-counting. Legacy identities found only in the display `Evidence` field are migrated into `Reconciliation IDs` before cursor advancement. Never advance the cursor when the ledger lacks both forms of the selected evidence.

Pending candidates are capped at 128, consumed evidence IDs and per-row `Reconciliation IDs` at 512, display evidence references per row at 8, and redacted symptoms at 240 Unicode code points. Exact dedupe lasts only while the evidence identity remains in that shared 512-entry horizon.

## Patch Boundary

Observe and record throughout unfinished scoped work. Apply a workflow/tooling patch during the run only when every condition holds:

- evidence classifies the failure as generic churn
- recurrence critically prevents start, resume, or advancement after reasonable retries
- the ledger records those attempts and recurrence
- no lower-impact operational retry or workaround can continue the run
- the proposed patch is the smallest change that restores progress

Defer other patches until the scoped run finishes or the user requests a separate churn-cleanup pass. Before patching, reproduce the generic failure with logs or a focused command where practical. After patching, run the repository-required checks, including nested-context checks for nested files and the dependency/security audit only when that work warrants it.

Keep durable scripts, tests, and documentation in their owning source area. Keep the ledger, cursor, and bounded evidence references local and uncommitted under `.scratch/<scope>`.
