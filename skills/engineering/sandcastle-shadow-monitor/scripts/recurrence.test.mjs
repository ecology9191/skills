import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRecurrenceCandidate,
  MAX_CONSUMED_EVIDENCE_IDS,
  MAX_LEDGER_EVIDENCE_REFS,
  MAX_PENDING_CANDIDATES,
  MAX_SYMPTOM_CHARACTERS,
  reconcileLedgerBody,
} from "./recurrence.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("same reviewer-receipt symptom keeps one fingerprint across volatile logs", () => {
  const firstLine = [
    "2026-07-20T16:37:20.800Z",
    "recovery-1784560904574-1",
    "head cf5157a9637b6e89f15a2ec2b3a305f27ae98fe0:",
    "Successful live proof has no reviewer-consumable receipt.",
  ].join(" ");
  const first = buildRecurrenceCandidate(
    {
      line: firstLine,
      path: ".sandcastle/logs/review-first.log",
      start: 1387,
      end: 1714,
      observedAt: "2026-07-20T16:37:20.800Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: "36-live-telegram-proof",
      claimId: "recovery-1784560904574-1",
    },
  );
  const later = buildRecurrenceCandidate(
    {
      line: [
        "2026-07-20T18:10:17.866Z",
        "run 550e8400-e29b-41d4-a716-446655440000",
        "commit f9274aff5d1a5ca0a0b9414ff22cf9de49bb:",
        "Successful live proof has no reviewer-consumable receipt.",
      ].join(" "),
      path: ".sandcastle/logs/review-later.log",
      start: 6607,
      end: 6808,
      observedAt: "2026-07-20T18:10:17.866Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: "36-live-telegram-proof",
      claimId: "550e8400-e29b-41d4-a716-446655440000",
    },
  );

  assert.match(first.fingerprint, /^recurrence-v1:[0-9a-f]{64}$/);
  assert.match(first.evidenceId, /^evidence-v1:[0-9a-f]{64}$/);
  assert.equal(first.fingerprint, later.fingerprint);
  assert.notEqual(first.evidenceId, later.evidenceId);
  assert.equal(
    first.symptom,
    "successful live proof has no reviewer-consumable receipt",
  );
  assert.equal(first.occurredAt, "2026-07-20T16:37:20.800Z");
  assert.equal(first.occurrenceSource, "event");
  assert.equal(
    first.fingerprint,
    `recurrence-v1:${sha256(
      JSON.stringify({
        symptom: first.symptom,
        phase: first.phase,
        ownershipBoundary: first.ownershipBoundary,
      }),
    )}`,
  );
  assert.equal(
    first.evidenceId,
    `evidence-v1:${sha256(
      JSON.stringify({
        fingerprint: first.fingerprint,
        relativePath: first.log.path,
        start: first.log.start,
        end: first.log.end,
        redactedLineDigest: sha256(first.symptom),
      }),
    )}`,
  );
  assert.deepEqual(Object.keys(first), [
    "version",
    "fingerprint",
    "evidenceId",
    "occurredAt",
    "occurrenceSource",
    "observedAt",
    "symptom",
    "phase",
    "ownershipBoundary",
    "log",
    "context",
  ]);
});

test("credential, product, bootstrap, and receipt causes keep separate boundaries", () => {
  const candidateFor = (line, start) =>
    buildRecurrenceCandidate(
      {
        line,
        path: ".sandcastle/logs/reviewer-verification.log",
        start,
        end: start + Buffer.byteLength(line),
        observedAt: "2026-07-20T18:10:17.866Z",
      },
      { phase: "review", issueId: null, claimId: null },
    );

  const credentials = candidateFor(
    "Required live Telegram credential capability is unavailable.",
    10,
  );
  const product = candidateFor(
    "Telegram linking phase assertion failed for the active issue.",
    100,
  );
  const adr = candidateFor("Required committed ADR is missing.", 200);
  const bootstrap = candidateFor(
    "Bootstrap replay did not promote the admin.",
    300,
  );
  const receipt = candidateFor(
    "Successful live proof has no reviewer-consumable receipt.",
    400,
  );

  assert.deepEqual(
    [credentials, product, adr, bootstrap, receipt].map(
      ({ ownershipBoundary }) => ownershipBoundary,
    ),
    [
      "host credential capability",
      "issue acceptance behavior",
      "product proof dependency",
      "product proof dependency",
      "runner-owned reviewer receipt",
    ],
  );
  assert.equal(
    new Set(
      [credentials, product, adr, bootstrap, receipt].map(
        ({ fingerprint }) => fingerprint,
      ),
    ).size,
    5,
  );
  for (const candidate of [credentials, product, adr, bootstrap, receipt]) {
    assert.equal("classification" in candidate, false);
  }
});

test("candidate JSON and identities are insensitive to secret values", () => {
  const create = (line) =>
    buildRecurrenceCandidate(
      {
        line,
        path: ".sandcastle/logs/reviewer-verification.log",
        start: 20,
        end: 96,
        observedAt: "2026-07-20T18:10:17.866Z",
      },
      {
        phase: "review",
        ownershipBoundary: "host credential capability",
        issueId: null,
        claimId: null,
      },
    );
  const secretPairs = [
    [
      "Error: credential capability FA_TELEGRAM_BOT_TOKEN=123456789:AAFirstSecretValue is unavailable",
      "Error: credential capability FA_TELEGRAM_BOT_TOKEN=987654321:AASecondSecretValue is unavailable",
    ],
    [
      "Error: credential capability FA_TELEGRAM_API_HASH=first-api-hash is unavailable",
      "Error: credential capability FA_TELEGRAM_API_HASH=second-api-hash is unavailable",
    ],
    [
      "Error: credential capability APP_ID=111111 API_ID=222222 is unavailable",
      "Error: credential capability APP_ID=333333 API_ID=444444 is unavailable",
    ],
    [
      "Error: credential capability burner phone: +15550101010 is unavailable",
      "Error: credential capability burner phone: +15550999999 is unavailable",
    ],
    [
      "Error: credential capability Telethon session string: first-session-string is unavailable",
      "Error: credential capability Telethon session string: second-session-string is unavailable",
    ],
    [
      "Error: credential capability Authorization: Bearer first-bearer-value is unavailable",
      "Error: credential capability Authorization: Bearer second-bearer-value is unavailable",
    ],
    [
      "Error: credential capability Authorization: Basic Zmlyc3Q6c2VjcmV0 is unavailable",
      "Error: credential capability Authorization: Basic c2Vjb25kOnNlY3JldA== is unavailable",
    ],
    [
      "Error: credential capability UNRECOGNIZED_UPPERCASE_VALUE=first-opaque-value is unavailable",
      "Error: credential capability UNRECOGNIZED_UPPERCASE_VALUE=second-opaque-value is unavailable",
    ],
  ];

  for (const [firstLine, secondLine] of secretPairs) {
    const first = create(firstLine);
    const second = create(secondLine);
    const serialized = JSON.stringify([first, second]);

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.evidenceId, second.evidenceId);
    for (const secret of firstLine.split(/\s+/).concat(secondLine.split(/\s+/))) {
      if (/first|second|111111|222222|333333|444444|1555|Zmly|c2Vj/i.test(secret)) {
        assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      }
    }
    assert.doesNotMatch(serialized, /"line"/);
  }
});

test("fingerprints normalize common volatile run, claim, ID, timestamp, and path forms", () => {
  const fingerprintFor = (line) =>
    buildRecurrenceCandidate(
      {
        line,
        path: ".sandcastle/logs/reviewer-verification.log",
        start: 20,
        end: 200,
        observedAt: "2026-07-25T19:30:00.000Z",
      },
      {
        phase: "review",
        ownershipBoundary: "runner-owned reviewer receipt",
        issueId: null,
        claimId: null,
      },
    ).fingerprint;
  const pairs = [
    [
      "Error run-111 lacks a reviewer-consumable receipt",
      "Error run id 999 lacks a reviewer-consumable receipt",
    ],
    [
      "Error claim-111 lacks a reviewer-consumable receipt",
      "Error claim id: 999 lacks a reviewer-consumable receipt",
    ],
    [
      "Error numeric id=123456 lacks a reviewer-consumable receipt",
      "Error numeric id 987654 lacks a reviewer-consumable receipt",
    ],
    [
      "2026-07-20T16:37:20.800Z Error lacks a reviewer-consumable receipt",
      "2026-07-21 18:39:22+02:00 Error lacks a reviewer-consumable receipt",
    ],
    [
      "Error at .scratch/first/issues/01.md lacks a reviewer-consumable receipt",
      "Error at .sandcastle/logs/second.log lacks a reviewer-consumable receipt",
    ],
    [
      String.raw`Error at C:\first\private\review.log lacks a reviewer-consumable receipt`,
      String.raw`Error at D:\second\other\review.log lacks a reviewer-consumable receipt`,
    ],
  ];

  for (const [first, second] of pairs) {
    assert.equal(
      fingerprintFor(first),
      fingerprintFor(second),
      `${first} <> ${second}`,
    );
  }
});

test("normalizes zone-less timestamp prefixes without treating them as event time", () => {
  const candidateFor = (line) =>
    buildRecurrenceCandidate(
      {
        line,
        path: ".sandcastle/logs/reviewer-verification.log",
        start: 20,
        end: 110,
        observedAt: "2026-07-25T19:30:00.000Z",
      },
      {
        phase: "review",
        ownershipBoundary: "runner-owned reviewer receipt",
        issueId: null,
        claimId: null,
      },
    );
  const first = candidateFor(
    "2026-07-20 18:10:17 Error: reviewer-consumable receipt missing",
  );
  const second = candidateFor(
    "2026-07-21 18:10:18 Error: reviewer-consumable receipt missing",
  );

  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.symptom, "error: reviewer-consumable receipt missing");
  assert.equal(second.symptom, first.symptom);
  assert.doesNotMatch(first.symptom, /\d{4}-\d{2}-\d{2}/);
  assert.equal(first.occurredAt, first.observedAt);
  assert.equal(second.occurredAt, second.observedAt);
  assert.equal(first.occurrenceSource, "observation-fallback");
  assert.equal(second.occurrenceSource, "observation-fallback");
});

test("persists event occurrence time separately from observation fallback", () => {
  const historical = buildRecurrenceCandidate(
    {
      line: "2026-07-20 18:10:17+00:00 Error: reviewer-consumable receipt missing",
      path: ".sandcastle/logs/reviewer-verification.log",
      start: 20,
      end: 110,
      observedAt: "2026-07-25T19:30:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: null,
      claimId: null,
    },
  );
  const fallback = buildRecurrenceCandidate(
    {
      line: "Error: reviewer-consumable receipt missing",
      path: ".sandcastle/logs/reviewer-verification.log",
      start: 120,
      end: 165,
      observedAt: "2026-07-25T19:30:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: null,
      claimId: null,
    },
  );

  assert.equal(historical.occurredAt, "2026-07-20T18:10:17.000Z");
  assert.equal(historical.observedAt, "2026-07-25T19:30:00.000Z");
  assert.equal(historical.occurrenceSource, "event");
  assert.equal(fallback.occurredAt, fallback.observedAt);
  assert.equal(fallback.occurrenceSource, "observation-fallback");
});

test("historical replay uses occurrence time for ledger Last seen", () => {
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-historical — Historical recurrence",
    "",
    "Status: open",
    "First seen: 2026-07-01T00:00:00.000Z",
    "Last seen: 2026-07-02T00:00:00.000Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "2026-07-20T18:10:17.000-04:00 Error: historical recurrence",
      path: ".sandcastle/logs/reviewer-verification.log",
      start: 20,
      end: 100,
      observedAt: "2026-07-25T19:30:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner process lifecycle",
      issueId: null,
      claimId: null,
    },
  );

  const reconciled = reconcileLedgerBody(
    ledger,
    "churn-historical",
    candidate,
  );
  assert.match(reconciled, /Last seen: 2026-07-20T22:10:17\.000Z/);
  assert.doesNotMatch(reconciled, /Last seen: 2026-07-25/);
});

test("truncates normalized symptoms without splitting astral code points", () => {
  const candidate = buildRecurrenceCandidate(
    {
      line: `Error ${"a".repeat(233)}😀 trailing`,
      path: ".sandcastle/logs/reviewer-verification.log",
      start: 20,
      end: 300,
      observedAt: "2026-07-25T19:30:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner process lifecycle",
      issueId: null,
      claimId: null,
    },
  );

  assert.equal(Array.from(candidate.symptom).length, MAX_SYMPTOM_CHARACTERS);
  assert.equal(
    Buffer.from(candidate.symptom, "utf8").toString("utf8"),
    candidate.symptom,
  );
  assert.equal(candidate.symptom.endsWith("😀"), true);
});

test("strict shared validation rejects mutated candidates and cursors", async () => {
  const { validateRecurrenceCandidate, validateRecurrenceCursor } =
    await import("./recurrence.mjs");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Error: reviewer-consumable receipt missing",
      path: ".sandcastle/logs/reviewer-verification.log",
      start: 20,
      end: 65,
      observedAt: "2026-07-25T19:30:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: "issue-36",
      claimId: "claim-2",
    },
  );
  const cursor = {
    version: 2,
    repoRoot: "/tmp/example",
    scope: "demo",
    updatedAt: "2026-07-25T19:30:00.000Z",
    logs: {},
    recurrence: {
      pendingCandidates: [candidate],
      consumedEvidenceIds: [],
    },
  };

  assert.doesNotThrow(() => validateRecurrenceCandidate(candidate));
  assert.doesNotThrow(() => validateRecurrenceCursor(cursor));
  const mutations = [
    (value) => ({ ...value, line: "raw secret" }),
    (value) => ({ ...value, fingerprint: `recurrence-v1:${"0".repeat(64)}` }),
    (value) => ({ ...value, evidenceId: `evidence-v1:${"1".repeat(64)}` }),
    (value) => ({ ...value, symptom: `${value.symptom} altered` }),
    (value) => ({ ...value, observedAt: "2026-07-25" }),
    (value) => ({ ...value, occurredAt: "not-a-time" }),
    (value) => ({ ...value, occurrenceSource: "guessed" }),
    (value) => ({ ...value, log: { ...value.log, end: value.log.end + 1 } }),
    (value) => ({ ...value, context: { ...value.context, raw: "secret" } }),
  ];
  for (const mutate of mutations) {
    const altered = mutate(structuredClone(candidate));
    assert.throws(() => validateRecurrenceCandidate(altered), /invalid/i);
    assert.throws(
      () =>
        validateRecurrenceCursor({
          ...cursor,
          recurrence: { ...cursor.recurrence, pendingCandidates: [altered] },
        }),
      /invalid/i,
    );
  }
  assert.throws(
    () => validateRecurrenceCursor({ ...cursor, raw: "extra" }),
    /invalid/i,
  );
});

test("persistence rejects adversarial cursor mutations before ledger or cursor writes", async (t) => {
  const { persistReconciliation } = await import("./recurrence.mjs");
  const directory = await mkdtemp(path.join(os.tmpdir(), "recurrence-mutate-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const ledgerPath = path.join(directory, "ledger.md");
  const statePath = path.join(directory, "state.json");
  const itemId = "churn-mutation";
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    `## ${itemId} — Mutation guard`,
    "",
    "Status: open",
    "First seen: 2026-07-20T16:33:44.543Z",
    "Last seen: 2026-07-20T16:37:20.800Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Error: mutation probe recurrence",
      path: ".sandcastle/logs/review.log",
      start: 100,
      end: 132,
      observedAt: "2026-07-20T18:10:17.866Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner process lifecycle",
      issueId: "issue-36",
      claimId: "claim-2",
    },
  );
  const cursor = {
    version: 2,
    repoRoot: "/fixture",
    scope: "demo",
    updatedAt: "2026-07-20T18:10:17.866Z",
    logs: {},
    recurrence: {
      pendingCandidates: [candidate],
      consumedEvidenceIds: [],
    },
  };
  const mutations = [
    (value) => ({
      ...value,
      context: { ...value.context, issueId: "issue-\ud800" },
    }),
    (value) => ({ ...value, log: { ...value.log, end: value.log.end + 1 } }),
    (value) => ({ ...value, fingerprint: `recurrence-v1:${"0".repeat(64)}` }),
    (value) => ({ ...value, observedAt: "2026-07-20" }),
    (value) => ({ ...value, rawLine: "FA_TELEGRAM_API_HASH=secret" }),
  ];

  for (const mutate of mutations) {
    const alteredCursor = {
      ...cursor,
      recurrence: {
        ...cursor.recurrence,
        pendingCandidates: [mutate(structuredClone(candidate))],
      },
    };
    const cursorBody = `${JSON.stringify(alteredCursor, null, 2)}\n`;
    await writeFile(ledgerPath, ledger);
    await writeFile(statePath, cursorBody);
    let failure = null;
    try {
      await persistReconciliation({
        ledgerPath,
        statePath,
        itemId,
        evidenceId: candidate.evidenceId,
      });
    } catch (error) {
      failure = error;
    }
    assert.match(failure?.message || "", /invalid/i);
    assert.equal(await readFile(ledgerPath, "utf8"), ledger);
    assert.equal(await readFile(statePath, "utf8"), cursorBody);
  }
});

test("reconciles one existing generic churn row exactly once", async () => {
  const { reconcileLedgerBody } = await import("./recurrence.mjs");
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-reviewer-live-telegram-env-boundary — Missing reviewer receipt",
    "",
    "Status: open",
    "First seen: 2026-07-20T16:33:44.543Z",
    "Last seen: 2026-07-20T16:37:20.800Z",
    "Count: 1",
    "Issue/run: issue-36",
    "Evidence: .sandcastle/logs/original.log bytes 10-20 [evidence-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa]",
    "Impact: review cannot proceed",
    "Classification: generic churn",
    "Action: provide a runner-owned receipt",
    "Resolution: Pending",
    "",
    "## churn-unrelated — Leave this alone",
    "",
    "Status: open",
    "Last seen: 2026-07-01T00:00:00.000Z",
    "Count: 7",
    "Evidence: unrelated",
    "Classification: generic churn",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Successful live proof has no reviewer-consumable receipt.",
      path: ".sandcastle/logs/review-later.log",
      start: 6607,
      end: 6808,
      observedAt: "2026-07-20T18:10:17.866Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: "issue-36",
      claimId: "claim-2",
    },
  );

  const reconciled = reconcileLedgerBody(
    ledger,
    "churn-reviewer-live-telegram-env-boundary",
    candidate,
  );

  assert.match(reconciled, /\nCount: 2\n/);
  assert.match(reconciled, /\nLast seen: 2026-07-20T18:10:17\.866Z\n/);
  assert.match(
    reconciled,
    new RegExp(
      `\\.sandcastle/logs/review-later\\.log bytes 6607-6808 \\[${candidate.evidenceId}\\]`,
    ),
  );
  assert.match(reconciled, /\n## churn-unrelated[\s\S]*\nCount: 7\n/);
  assert.equal(
    reconcileLedgerBody(
      reconciled,
      "churn-reviewer-live-telegram-env-boundary",
      candidate,
    ),
    reconciled,
  );
});

test("rejects a non-timestamp Last seen field before changing a ledger", async () => {
  const { reconcileLedgerBody } = await import("./recurrence.mjs");
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-malformed — Malformed date",
    "",
    "Status: open",
    "First seen: 2026-07-20T16:33:44.543Z",
    "Last seen: 2026-07-20",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Error: repeatable runner failure.",
      path: ".sandcastle/logs/review.log",
      start: 10,
      end: 42,
      observedAt: "2026-07-20T18:10:17.866Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner process lifecycle",
      issueId: null,
      claimId: null,
    },
  );

  assert.throws(
    () => reconcileLedgerBody(ledger, "churn-malformed", candidate),
    /Last seen must be an ISO timestamp/,
  );
});

test("repairs the cursor after a crash between ledger and cursor renames", async (t) => {
  const { persistReconciliation } = await import("./recurrence.mjs");
  const directory = await mkdtemp(path.join(os.tmpdir(), "recurrence-crash-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const ledgerPath = path.join(directory, "ledger.md");
  const statePath = path.join(directory, "state.json");
  const itemId = "churn-reviewer-receipt";
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    `## ${itemId} — Missing reviewer receipt`,
    "",
    "Status: open",
    "First seen: 2026-07-20T16:33:44.543Z",
    "Last seen: 2026-07-20T16:37:20.800Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Successful live proof has no reviewer-consumable receipt.",
      path: ".sandcastle/logs/review-later.log",
      start: 6607,
      end: 6808,
      observedAt: "2026-07-20T18:10:17.866Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: "issue-36",
      claimId: "claim-2",
    },
  );
  const cursor = {
    version: 2,
    repoRoot: "/fixture",
    scope: "demo",
    updatedAt: "2026-07-20T18:10:17.866Z",
    logs: {},
    recurrence: {
      pendingCandidates: [candidate],
      consumedEvidenceIds: [],
    },
  };
  await writeFile(ledgerPath, ledger);
  await writeFile(statePath, `${JSON.stringify(cursor, null, 2)}\n`);

  await assert.rejects(
    persistReconciliation({
      ledgerPath,
      statePath,
      itemId,
      evidenceId: candidate.evidenceId,
      afterLedgerRename() {
        throw new Error("injected crash after ledger rename");
      },
    }),
    /injected crash after ledger rename/,
  );
  assert.match(await readFile(ledgerPath, "utf8"), /\nCount: 2\n/);
  let persistedCursor = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(persistedCursor.recurrence.pendingCandidates.length, 1);
  assert.deepEqual(persistedCursor.recurrence.consumedEvidenceIds, []);

  const repaired = await persistReconciliation({
    ledgerPath,
    statePath,
    itemId,
    evidenceId: candidate.evidenceId,
  });
  assert.equal(repaired.status, "already-reconciled");
  assert.match(await readFile(ledgerPath, "utf8"), /\nCount: 2\n/);
  persistedCursor = JSON.parse(await readFile(statePath, "utf8"));
  assert.deepEqual(persistedCursor.recurrence.pendingCandidates, []);
  assert.deepEqual(persistedCursor.recurrence.consumedEvidenceIds, [
    candidate.evidenceId,
  ]);
});

test("retains durable reconciliation identities beyond the display-evidence cap", async (t) => {
  const { persistReconciliation } = await import("./recurrence.mjs");
  const directory = await mkdtemp(path.join(os.tmpdir(), "recurrence-horizon-"));
  t.after(() => rm(directory, { force: true, recursive: true }));
  const ledgerPath = path.join(directory, "ledger.md");
  const statePath = path.join(directory, "state.json");
  const itemId = "churn-durable-horizon";
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    `## ${itemId} — Durable recurrence identity`,
    "",
    "Status: open",
    "First seen: 2026-07-20T16:33:44.543Z",
    "Last seen: 2026-07-20T16:37:20.800Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const candidates = Array.from({ length: 10 }, (_, index) =>
    buildRecurrenceCandidate(
      {
        line: "Error: repeatable runner lifecycle failure",
        path: ".sandcastle/logs/review.log",
        start: index * 100,
        end: index * 100 + 42,
        observedAt: `2026-07-20T18:10:${String(index).padStart(2, "0")}.000Z`,
      },
      {
        phase: "review",
        ownershipBoundary: "runner process lifecycle",
        issueId: null,
        claimId: null,
      },
    ),
  );
  const cursor = {
    version: 2,
    repoRoot: "/fixture",
    scope: "demo",
    updatedAt: "2026-07-20T18:10:00.000Z",
    logs: {},
    recurrence: {
      pendingCandidates: candidates,
      consumedEvidenceIds: [],
    },
  };
  await writeFile(ledgerPath, ledger);
  await writeFile(statePath, `${JSON.stringify(cursor, null, 2)}\n`);

  for (const candidate of candidates) {
    const result = await persistReconciliation({
      ledgerPath,
      statePath,
      itemId,
      evidenceId: candidate.evidenceId,
    });
    assert.equal(result.status, "reconciled");
  }

  const ledgerAfterTen = await readFile(ledgerPath, "utf8");
  const cursorBodyAfterTen = await readFile(statePath, "utf8");
  const cursorAfterTen = JSON.parse(cursorBodyAfterTen);
  const evidenceField = ledgerAfterTen.match(/^Evidence: (.*)$/m)?.[1] || "";
  const reconciliationField =
    ledgerAfterTen.match(/^Reconciliation IDs: (.*)$/m)?.[1] || "";
  assert.match(ledgerAfterTen, /\nCount: 11\n/);
  assert.equal(
    (evidenceField.match(/evidence-v1:/g) || []).length,
    MAX_LEDGER_EVIDENCE_REFS,
  );
  assert.doesNotMatch(evidenceField, new RegExp(candidates[0].evidenceId));
  assert.equal(
    (reconciliationField.match(/evidence-v1:/g) || []).length,
    candidates.length,
  );
  assert.match(reconciliationField, new RegExp(candidates[0].evidenceId));
  assert.equal(cursorAfterTen.recurrence.consumedEvidenceIds.length, 10);

  const replay = await persistReconciliation({
    ledgerPath,
    statePath,
    itemId,
    evidenceId: candidates[0].evidenceId,
  });
  assert.equal(replay.status, "already-reconciled");
  assert.equal(await readFile(ledgerPath, "utf8"), ledgerAfterTen);
  assert.equal(await readFile(statePath, "utf8"), cursorBodyAfterTen);
  assert.match(await readFile(ledgerPath, "utf8"), /\nCount: 11\n/);
});

test("reopens a closed recurrence and bounds retained evidence references", async () => {
  const { reconcileLedgerBody } = await import("./recurrence.mjs");
  const oldReferences = Array.from(
    { length: MAX_LEDGER_EVIDENCE_REFS },
    (_, index) =>
      `.sandcastle/logs/old-${index}.log bytes ${index}-${index + 1} [evidence-v1:${String(index).padStart(64, "0")}]`,
  );
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-reopened — Recurred after resolution",
    "",
    "Status: closed",
    "First seen: 2026-07-01T00:00:00.000Z",
    "Last seen: 2026-07-02T00:00:00.000Z",
    "Count: 1",
    `Evidence: ${oldReferences.join("; ")}`,
    "Classification: generic churn",
    "Resolution: Fixed in the prior run and verified there.",
    "",
  ].join("\n");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Error: the same runner lifecycle failure recurred.",
      path: ".sandcastle/logs/later.log",
      start: 40,
      end: 92,
      observedAt: "2026-07-03T00:00:00.000Z",
    },
    {
      phase: "recovery",
      ownershipBoundary: "runner process lifecycle",
      issueId: null,
      claimId: null,
    },
  );

  const reconciled = reconcileLedgerBody(
    ledger,
    "churn-reopened",
    candidate,
  );

  assert.match(reconciled, /\nStatus: open\n/);
  assert.match(
    reconciled,
    /\nResolution: Fixed in the prior run and verified there\.\n/,
  );
  assert.doesNotMatch(reconciled, /old-0\.log/);
  assert.match(reconciled, new RegExp(candidate.evidenceId));
  assert.equal(
    (reconciled.match(/\[evidence-v1:[0-9a-f]{64}\]/g) || []).length,
    MAX_LEDGER_EVIDENCE_REFS,
  );
});

test("fails closed when cursor-consumed evidence is absent from the ledger", async (t) => {
  const { persistReconciliation } = await import("./recurrence.mjs");
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "recurrence-invariant-"),
  );
  t.after(() => rm(directory, { force: true, recursive: true }));
  const ledgerPath = path.join(directory, "ledger.md");
  const statePath = path.join(directory, "state.json");
  const evidenceId = `evidence-v1:${"a".repeat(64)}`;
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-invariant — Cursor must not lead",
    "",
    "Status: open",
    "First seen: 2026-07-01T00:00:00.000Z",
    "Last seen: 2026-07-02T00:00:00.000Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    "Resolution: Pending",
    "",
  ].join("\n");
  const cursor = {
    version: 2,
    repoRoot: "/fixture",
    scope: "demo",
    updatedAt: "2026-07-02T00:00:00.000Z",
    logs: {},
    recurrence: {
      pendingCandidates: [],
      consumedEvidenceIds: [evidenceId],
    },
  };
  await writeFile(ledgerPath, ledger);
  await writeFile(statePath, `${JSON.stringify(cursor, null, 2)}\n`);

  await assert.rejects(
    persistReconciliation({
      ledgerPath,
      statePath,
      itemId: "churn-invariant",
      evidenceId,
    }),
    /cursor consumed evidence is absent from ledger/,
  );
  assert.equal(await readFile(ledgerPath, "utf8"), ledger);
  assert.deepEqual(
    JSON.parse(await readFile(statePath, "utf8")),
    cursor,
  );
});

test("exports the exact recurrence storage and redaction bounds", () => {
  assert.equal(MAX_PENDING_CANDIDATES, 128);
  assert.equal(MAX_CONSUMED_EVIDENCE_IDS, 512);
  assert.equal(MAX_LEDGER_EVIDENCE_REFS, 8);
  assert.equal(MAX_SYMPTOM_CHARACTERS, 240);
});

test("does not treat an evidence ID outside the Evidence field as consumed", async () => {
  const { reconcileLedgerBody } = await import("./recurrence.mjs");
  const candidate = buildRecurrenceCandidate(
    {
      line: "Error: runner receipt boundary recurred.",
      path: ".sandcastle/logs/review.log",
      start: 10,
      end: 52,
      observedAt: "2026-07-03T00:00:00.000Z",
    },
    {
      phase: "review",
      ownershipBoundary: "runner-owned reviewer receipt",
      issueId: null,
      claimId: null,
    },
  );
  const ledger = [
    "# Sandcastle Shadow Ledger",
    "",
    "## churn-evidence-field — Evidence scope",
    "",
    "Status: open",
    "First seen: 2026-07-01T00:00:00.000Z",
    "Last seen: 2026-07-02T00:00:00.000Z",
    "Count: 1",
    "Evidence: original evidence",
    "Classification: generic churn",
    `Resolution: Prior notes mention [${candidate.evidenceId}] but did not consume it.`,
    "",
  ].join("\n");

  const reconciled = reconcileLedgerBody(
    ledger,
    "churn-evidence-field",
    candidate,
  );

  assert.match(reconciled, /\nCount: 2\n/);
  assert.match(
    reconciled,
    new RegExp(`^Evidence: .*\\[${candidate.evidenceId}\\]$`, "m"),
  );
});
