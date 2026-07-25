import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildRecurrenceCandidate } from "./recurrence.mjs";

const execFileAsync = promisify(execFile);
const tempDirectories = new Set();
const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "snapshot.mjs",
);

async function fixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "shadow-snapshot-"));
  tempDirectories.add(repoRoot);
  await mkdir(path.join(repoRoot, ".scratch", "demo", "issues"), {
    recursive: true,
  });
  await mkdir(path.join(repoRoot, ".sandcastle", "logs"), { recursive: true });
  await writeFile(
    path.join(repoRoot, ".scratch", "demo", "issues", "01-first.md"),
    "# First\n\nStatus: ready-for-agent\nLabel: ready-for-agent\n",
  );
  await writeFile(
    path.join(repoRoot, ".sandcastle", "issue-tracker.mjs"),
    [
      "const clean=process.env.MAIL_SEARCHER_ISSUE_ROOT===`${process.cwd()}/.scratch`&&!process.env.MAIL_SEARCHER_ISSUE_CLAIM;",
      'const issue=clean?{id:".scratch/demo/issues/01-first.md",title:"First",status:"ready-for-agent",claim:""}:{id:".scratch/poison/issues/99-wrong.md",title:"Wrong",status:"ready-for-agent",claim:"poison"};',
      'process.stdout.write(JSON.stringify(process.argv[2]==="view"?issue:[issue]));',
      "",
    ].join("\n"),
  );
  const fakeRunner = [
    'import { spawn } from "node:child_process";',
    'if (process.env.FAKE_NESTED_RUNNER === "1" && process.env.FAKE_RUNNER_CHILD !== "1") {',
    "  spawn(process.execPath, [process.argv[1]], {",
    "    cwd: process.cwd(),",
    '    env: { ...process.env, FAKE_RUNNER_CHILD: "1" },',
    '    stdio: "ignore",',
    "  });",
    "}",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n");
  await writeFile(path.join(repoRoot, ".sandcastle", "main.mts"), fakeRunner);
  await writeFile(path.join(repoRoot, ".sandcastle", "main.mjs"), fakeRunner);
  return repoRoot;
}

after(async () => {
  await Promise.all(
    [...tempDirectories].map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function setClaim(repoRoot, claim) {
  await writeFile(
    path.join(repoRoot, ".scratch", "demo", "issues", "01-first.md"),
    `# First\n\nStatus: ready-for-agent\nLabel: ready-for-agent\nClaim: ${claim}\n`,
  );
}

async function runSnapshot(repoRoot, extraArgs = [], environment = {}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [scriptPath, "--repo", repoRoot, "--scope", "demo", ...extraArgs],
    { env: { ...process.env, ...environment }, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

test("creates the ledger, validates the queue head, and emits only later log deltas", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-1-implementer.log",
  );
  await writeFile(logPath, "historical line\n");

  const initial = await runSnapshot(repoRoot, [
    "--issue",
    ".scratch/demo/issues/01-first.md",
  ]);
  assert.equal(initial.ledger.created, true);
  assert.equal(initial.issues.targetIsReadyHead, true);
  assert.deepEqual(initial.logs.deltas, []);
  assert.match(
    await readFile(initial.ledger.path, "utf8"),
    /Sandcastle Shadow Ledger/,
  );

  await appendFile(
    logPath,
    "Claimed issue: .scratch/demo/issues/01-first.md\n",
  );
  const next = await runSnapshot(repoRoot, [
    "--issue",
    ".scratch/demo/issues/01-first.md",
  ]);
  assert.equal(next.ledger.created, false);
  assert.equal(next.logs.deltas.length, 1);
  assert.doesNotMatch(next.logs.deltas[0].text, /historical line/);
  assert.match(next.logs.deltas[0].text, /Claimed issue:/);
  assert.equal(next.logs.events.length, 1);
});

test("pins tracker reads to the selected repository and clears inherited claim state", async () => {
  const repoRoot = await fixture();
  const poisonRoot = await mkdtemp(path.join(os.tmpdir(), "shadow-poison-"));
  tempDirectories.add(poisonRoot);
  const result = await runSnapshot(
    repoRoot,
    ["--issue", ".scratch/demo/issues/01-first.md"],
    {
      MAIL_SEARCHER_ISSUE_CLAIM: "poison-claim",
      MAIL_SEARCHER_ISSUE_ROOT: poisonRoot,
    },
  );
  assert.equal(result.issues.queueError, null);
  assert.equal(result.issues.targetError, null);
  assert.equal(result.issues.targetIsReadyHead, true);
});

test("detects a matching fake runner and emits a bounded initial tail", async () => {
  const repoRoot = await fixture();
  await setClaim(repoRoot, "2");
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-2-reviewer.log",
  );
  await writeFile(logPath, "review context\nAPPROVED\n");
  const fakeRunner = spawn(process.execPath, [".sandcastle/main.mts"], {
    cwd: repoRoot,
    env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: "demo" },
    stdio: "ignore",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await runSnapshot(repoRoot);
    assert.equal(result.runners.length, 1);
    assert.equal(result.runners[0].pid, fakeRunner.pid);
    assert.deepEqual(result.runners[0].pids, [fakeRunner.pid]);
    assert.equal(result.runners[0].scope, "demo");
    assert.equal(result.logs.deltas.length, 1);
    assert.match(result.logs.deltas[0].text, /APPROVED/);
  } finally {
    fakeRunner.kill("SIGTERM");
  }
});

test("detects a runner when the repository argument is a symlink", async () => {
  const repoRoot = await fixture();
  await setClaim(repoRoot, "7");
  const linkParent = await mkdtemp(path.join(os.tmpdir(), "shadow-link-"));
  tempDirectories.add(linkParent);
  const linkedRepo = path.join(linkParent, "repo");
  await symlink(repoRoot, linkedRepo, "dir");
  const fakeRunner = spawn(process.execPath, [".sandcastle/main.mts"], {
    cwd: repoRoot,
    env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: "demo" },
    stdio: "ignore",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await runSnapshot(linkedRepo);
    assert.equal(result.repoRoot, repoRoot);
    assert.equal(result.runners.length, 1);
    assert.equal(result.runners[0].pid, fakeRunner.pid);
  } finally {
    fakeRunner.kill("SIGTERM");
  }
});

test("initial attach tails only logs matching the active claim", async () => {
  const repoRoot = await fixture();
  await setClaim(repoRoot, "200-1");
  const currentLog = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-200-1-reviewer.log",
  );
  const historicalLog = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-999-1-implementer.log",
  );
  await writeFile(currentLog, "APPROVED current review\n");
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeFile(historicalLog, "Error: newer but historical\n");
  const fakeRunner = spawn(process.execPath, [".sandcastle/main.mts"], {
    cwd: repoRoot,
    env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: "demo" },
    stdio: "ignore",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await runSnapshot(repoRoot);
    assert.equal(result.logs.deltas.length, 1);
    assert.equal(
      result.logs.deltas[0].path.endsWith("200-1-reviewer.log"),
      true,
    );
    assert.equal(result.logs.deltas[0].current, true);
    assert.equal(result.logs.deltas[0].phase, "review");
    assert.doesNotMatch(result.logs.deltas[0].text, /historical/);
    assert.equal(
      result.logs.latest[0].path.endsWith("200-1-reviewer.log"),
      true,
    );
  } finally {
    fakeRunner.kill("SIGTERM");
  }
});

test("marks multiple claimed issues ambiguous instead of inferring current logs", async () => {
  const repoRoot = await fixture();
  await setClaim(repoRoot, "300-1");
  await writeFile(
    path.join(repoRoot, ".scratch", "demo", "issues", "02-stale.md"),
    "# Stale\n\nStatus: ready-for-agent\nLabel: ready-for-agent\nClaim: 299-1\n",
  );
  await writeFile(
    path.join(
      repoRoot,
      ".sandcastle",
      "logs",
      "sandcastle-sequential-reviewer-300-1-reviewer.log",
    ),
    "APPROVED active-looking log\n",
  );
  await writeFile(
    path.join(
      repoRoot,
      ".sandcastle",
      "logs",
      "sandcastle-sequential-reviewer-299-1-implementer.log",
    ),
    "COMPLETE stale-looking log\n",
  );
  const fakeRunner = spawn(process.execPath, [".sandcastle/main.mts"], {
    cwd: repoRoot,
    env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: "demo" },
    stdio: "ignore",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await runSnapshot(repoRoot);
    assert.equal(result.issues.claimed.length, 2);
    assert.equal(result.logs.claimAmbiguous, true);
    assert.deepEqual(result.logs.currentClaimTokens, []);
    assert.deepEqual(result.logs.latest, []);
    assert.deepEqual(result.logs.deltas, []);
  } finally {
    fakeRunner.kill("SIGTERM");
  }
});

test("detects truncation and reports the replacement content", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-3-implementer.log",
  );
  await writeFile(logPath, "long historical content\n");
  await runSnapshot(repoRoot);
  await writeFile(logPath, "Error: rotated\n");

  const result = await runSnapshot(repoRoot);
  assert.equal(result.logs.deltas.length, 1);
  assert.equal(result.logs.deltas[0].reset, true);
  assert.match(result.logs.deltas[0].text, /rotated/);
});

test("preserves deferred replacement state until a max-log-files poll reads byte zero", async () => {
  const repoRoot = await fixture();
  const firstPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-17-reviewer.log",
  );
  const secondPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-18-reviewer.log",
  );
  await writeFile(firstPath, "first baseline is deliberately long\n");
  await writeFile(secondPath, "second baseline is deliberately long\n");
  await runSnapshot(repoRoot);

  await rm(firstPath);
  await writeFile(
    firstPath,
    "Error: deferred replacement begins here and remains longer than baseline\n",
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  await rm(secondPath);
  await writeFile(
    secondPath,
    "Error: selected replacement begins here and remains longer than baseline\n",
  );

  const firstPoll = await runSnapshot(repoRoot, ["--max-log-files", "1"]);
  assert.equal(firstPoll.logs.deltas.length, 1);
  assert.equal(firstPoll.logs.deltas[0].path.endsWith("18-reviewer.log"), true);
  assert.equal(firstPoll.logs.deltas[0].reset, true);

  const secondPoll = await runSnapshot(repoRoot, ["--max-log-files", "1"]);
  assert.equal(secondPoll.logs.deltas.length, 1);
  assert.equal(secondPoll.logs.deltas[0].path.endsWith("17-reviewer.log"), true);
  assert.equal(secondPoll.logs.deltas[0].reset, true);
  assert.equal(secondPoll.logs.deltas[0].fromOffset, 0);
  assert.match(secondPoll.logs.deltas[0].text, /^Error: deferred replacement/);
});

test("rejects a cursor outside the selected scope", async () => {
  const repoRoot = await fixture();
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--repo",
      repoRoot,
      "--scope",
      "demo",
      "--state",
      path.join(repoRoot, "state.json"),
    ]),
    /cursor must live inside the selected scope/,
  );
});

test("accepts default and nested custom cursor paths inside the real scope", async () => {
  const repoRoot = await fixture();
  const scopeRoot = path.join(repoRoot, ".scratch", "demo");
  const defaultPath = path.join(scopeRoot, ".sandcastle-shadow-state.json");
  const nestedParent = path.join(scopeRoot, "monitor-state");
  const customPath = path.join(nestedParent, "cursor.json");

  const defaultResult = await runSnapshot(repoRoot);
  await mkdir(nestedParent);
  const customResult = await runSnapshot(repoRoot, ["--state", customPath]);

  assert.equal(defaultResult.cursor.path, defaultPath);
  assert.equal(customResult.cursor.path, customPath);
  assert.equal(JSON.parse(await readFile(customPath, "utf8")).scope, "demo");
});

test("rejects an intermediate cursor-parent symlink escape without an outside write", async () => {
  const repoRoot = await fixture();
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "shadow-outside-"));
  tempDirectories.add(outsideRoot);
  const linkedParent = path.join(
    repoRoot,
    ".scratch",
    "demo",
    "state-link",
  );
  const statePath = path.join(linkedParent, "cursor.json");
  const outsideStatePath = path.join(outsideRoot, "cursor.json");
  await symlink(outsideRoot, linkedParent, "dir");

  let failure = null;
  try {
    await runSnapshot(repoRoot, ["--state", statePath]);
  } catch (error) {
    failure = error;
  }
  const outsideBody = await readFile(outsideStatePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });

  assert.match(failure?.message || "", /cursor parent resolves outside/i);
  assert.equal(outsideBody, null);
});

test("rejects reconciliation through a cursor-parent symlink before any write", async () => {
  const repoRoot = await fixture();
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "shadow-reconcile-outside-"),
  );
  tempDirectories.add(outsideRoot);
  const scopeRoot = path.join(repoRoot, ".scratch", "demo");
  const defaultStatePath = path.join(
    scopeRoot,
    ".sandcastle-shadow-state.json",
  );
  const linkedParent = path.join(scopeRoot, "state-link");
  const escapedStatePath = path.join(linkedParent, "cursor.json");
  const outsideStatePath = path.join(outsideRoot, "cursor.json");
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-19-reviewer.log",
  );
  const ledgerPath = path.join(scopeRoot, "ledger.md");
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(
    logPath,
    "Error: successful live proof has no reviewer-consumable receipt\n",
  );
  const discovered = await runSnapshot(repoRoot);
  const [candidate] = discovered.logs.recurrenceCandidates;
  await writeFile(
    ledgerPath,
    [
      "# Sandcastle Shadow Ledger",
      "",
      "## churn-symlink — Symlink escape",
      "",
      "Status: open",
      "First seen: 2026-07-20T16:33:44.543Z",
      "Last seen: 2026-07-20T16:37:20.800Z",
      "Count: 1",
      "Evidence: original evidence",
      "Classification: generic churn",
      "Resolution: Pending",
      "",
    ].join("\n"),
  );
  await writeFile(outsideStatePath, await readFile(defaultStatePath, "utf8"));
  await symlink(outsideRoot, linkedParent, "dir");
  const ledgerBefore = await readFile(ledgerPath, "utf8");
  const cursorBefore = await readFile(outsideStatePath, "utf8");

  let failure = null;
  try {
    await execFileAsync(process.execPath, [
      scriptPath,
      "--repo",
      repoRoot,
      "--scope",
      "demo",
      "--state",
      escapedStatePath,
      "--reconcile-item",
      "churn-symlink",
      "--evidence-id",
      candidate.evidenceId,
    ]);
  } catch (error) {
    failure = error;
  }

  assert.match(failure?.message || "", /cursor parent resolves outside/i);
  assert.equal(await readFile(ledgerPath, "utf8"), ledgerBefore);
  assert.equal(await readFile(outsideStatePath, "utf8"), cursorBefore);
});

test("reports a referenced issue outside the selected scope as a target error", async () => {
  const repoRoot = await fixture();
  const result = await runSnapshot(repoRoot, [
    "--issue",
    ".scratch/another-scope/issues/01-first.md",
  ]);
  assert.match(result.issues.targetError, /outside the selected scope/);
  assert.equal(result.issues.targetIsReadyHead, false);
});

test("retains an incomplete UTF-8 suffix for the next poll", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-4-implementer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, Buffer.from([0xe2, 0x82]));

  const partial = await runSnapshot(repoRoot);
  assert.equal(partial.logs.deltas[0].trailingBytes, 2);
  assert.equal(partial.logs.deltas[0].text, "");

  await appendFile(logPath, Buffer.from([0xac, 0x0a]));
  const completed = await runSnapshot(repoRoot);
  assert.equal(completed.logs.deltas[0].text, "€\n");
});

test("detects a meaningful event whose line is split across polls", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-8-reviewer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, "APP");

  const partial = await runSnapshot(repoRoot);
  assert.deepEqual(partial.logs.events, []);
  const partialCursor = JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        ".scratch",
        "demo",
        ".sandcastle-shadow-state.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    partialCursor.logs[
      ".sandcastle/logs/sandcastle-sequential-reviewer-8-reviewer.log"
    ].eventCarryStartOffset,
    9,
  );

  await appendFile(logPath, "ROVED €\n");
  const complete = await runSnapshot(repoRoot);
  assert.equal(complete.logs.events.length, 1);
  assert.deepEqual(complete.logs.events[0], {
    path: ".sandcastle/logs/sandcastle-sequential-reviewer-8-reviewer.log",
    start: 9,
    end: 21,
    line: "APPROVED €",
  });
});

test("reports exact UTF-8 byte coordinates for each event in one delta", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-9-reviewer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, "APPROVED α\nDENIED β\n");

  const result = await runSnapshot(repoRoot);

  assert.deepEqual(result.logs.events, [
    {
      path: ".sandcastle/logs/sandcastle-sequential-reviewer-9-reviewer.log",
      start: 9,
      end: 20,
      line: "APPROVED α",
    },
    {
      path: ".sandcastle/logs/sandcastle-sequential-reviewer-9-reviewer.log",
      start: 21,
      end: 30,
      line: "DENIED β",
    },
  ]);
});

test("keeps the full UTF-8 event range while truncating display at code-point boundaries", async () => {
  const repoRoot = await fixture();
  const relativeLog =
    ".sandcastle/logs/sandcastle-sequential-reviewer-16-reviewer.log";
  const logPath = path.join(repoRoot, relativeLog);
  const line = `Error ${"a".repeat(493)}😀 trailing`;
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, `${line}\n`);

  const result = await runSnapshot(repoRoot);
  const [event] = result.logs.events;

  assert.equal(event.start, 9);
  assert.equal(event.end, 9 + Buffer.byteLength(line));
  assert.equal(Array.from(event.line).length, 500);
  assert.equal(Buffer.from(event.line, "utf8").toString("utf8"), event.line);
  assert.equal(event.line.endsWith("😀"), true);
});

test("persists one pending recurrence and suppresses it on cursor restart", async () => {
  const repoRoot = await fixture();
  const relativeLog =
    ".sandcastle/logs/sandcastle-sequential-reviewer-10-reviewer.log";
  const logPath = path.join(repoRoot, relativeLog);
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(
    logPath,
    "Error: successful live proof has no reviewer-consumable receipt\n",
  );

  const discovered = await runSnapshot(repoRoot);
  assert.equal(discovered.version, 2);
  assert.equal(discovered.logs.recurrenceCandidates.length, 1);
  assert.equal(
    discovered.logs.recurrenceCandidates[0].ownershipBoundary,
    "runner-owned reviewer receipt",
  );

  const restarted = await runSnapshot(repoRoot);
  assert.deepEqual(restarted.logs.recurrenceCandidates, []);
  const cursor = JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        ".scratch",
        "demo",
        ".sandcastle-shadow-state.json",
      ),
      "utf8",
    ),
  );
  assert.equal(cursor.version, 2);
  assert.equal(cursor.recurrence.pendingCandidates.length, 1);
  assert.deepEqual(cursor.recurrence.consumedEvidenceIds, []);
  assert.equal(
    cursor.recurrence.pendingCandidates[0].evidenceId,
    discovered.logs.recurrenceCandidates[0].evidenceId,
  );

  const replacementBody = await readFile(logPath);
  await rm(logPath);
  await writeFile(logPath, replacementBody);
  const replaced = await runSnapshot(repoRoot);
  assert.deepEqual(replaced.logs.recurrenceCandidates, []);

  await appendFile(
    logPath,
    "Error: successful live proof has no reviewer-consumable receipt\n",
  );
  const laterOccurrence = await runSnapshot(repoRoot);
  assert.equal(laterOccurrence.logs.recurrenceCandidates.length, 1);
  assert.notEqual(
    laterOccurrence.logs.recurrenceCandidates[0].evidenceId,
    discovered.logs.recurrenceCandidates[0].evidenceId,
  );
  const laterCursor = JSON.parse(
    await readFile(
      path.join(
        repoRoot,
        ".scratch",
        "demo",
        ".sandcastle-shadow-state.json",
      ),
      "utf8",
    ),
  );
  assert.equal(laterCursor.recurrence.pendingCandidates.length, 2);
});

test("discovers a receipt-boundary recurrence without a severity keyword", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-12-reviewer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(
    logPath,
    "Successful live proof has no reviewer-consumable receipt.\n",
  );

  const result = await runSnapshot(repoRoot);

  assert.equal(result.logs.recurrenceCandidates.length, 1);
  assert.equal(
    result.logs.recurrenceCandidates[0].ownershipBoundary,
    "runner-owned reviewer receipt",
  );
});

test("keeps benign lifecycle events out of recurrence candidates", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-14-reviewer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, "APPROVED\n");

  const result = await runSnapshot(repoRoot);

  assert.deepEqual(result.logs.events, [
    {
      path: ".sandcastle/logs/sandcastle-sequential-reviewer-14-reviewer.log",
      start: 9,
      end: 17,
      line: "APPROVED",
    },
  ]);
  assert.deepEqual(result.logs.recurrenceCandidates, []);
});

test("redacts credential values from emitted candidates and the persisted cursor", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-15-reviewer.log",
  );
  const cursorPath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  const secretLines = [
    "Error: credential capability FA_TELEGRAM_API_HASH=first-api-hash is unavailable",
    "Error: credential capability APP_ID=111111 API_ID=222222 is unavailable",
    "Error: credential capability burner phone: +15550101010 is unavailable",
    "Error: credential capability Telethon session string: first-session-string is unavailable",
    "Error: credential capability Authorization: Bearer first-bearer-value is unavailable",
    "Error: credential capability Authorization: Basic Zmlyc3Q6c2VjcmV0 is unavailable",
    "Error: credential capability UNRECOGNIZED_UPPERCASE_VALUE=first-opaque-value is unavailable",
  ];
  await appendFile(logPath, `${secretLines.join("\n")}\n`);
  await appendFile(
    logPath,
    "Error: credential capability TELETHON_SESSION=cursor-session-secret",
  );

  const result = await runSnapshot(repoRoot);
  const candidates = JSON.stringify(result.logs.recurrenceCandidates);
  const cursor = await readFile(cursorPath, "utf8");
  const persisted = `${candidates}\n${cursor}`;

  assert.equal(result.logs.recurrenceCandidates.length, secretLines.length);
  assert.doesNotMatch(
    persisted,
    /first-api-hash|111111|222222|15550101010|first-session-string|first-bearer-value|Zmlyc3Q6c2VjcmV0|first-opaque-value|cursor-session-secret/i,
  );
  assert.doesNotMatch(persisted, /"line"/);
});

test("reconciles only an explicitly selected pending candidate", async () => {
  const repoRoot = await fixture();
  const issuePath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    "issues",
    "01-first.md",
  );
  const issueBefore = await readFile(issuePath, "utf8");
  const ledgerPath = path.join(repoRoot, ".scratch", "demo", "ledger.md");
  const statePath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-11-reviewer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await writeFile(
    ledgerPath,
    [
      "# Sandcastle Shadow Ledger",
      "",
      "## churn-reviewer-receipt — Missing reviewer receipt",
      "",
      "Status: open",
      "First seen: 2026-07-20T16:33:44.543Z",
      "Last seen: 2026-07-20T16:37:20.800Z",
      "Count: 1",
      "Evidence: original evidence",
      "Classification: generic churn",
      "Resolution: Pending",
      "",
    ].join("\n"),
  );
  await appendFile(
    logPath,
    "Error: successful live proof has no reviewer-consumable receipt\n",
  );
  const discovered = await runSnapshot(repoRoot);
  const [candidate] = discovered.logs.recurrenceCandidates;
  const ledgerBeforeReconciliation = await readFile(ledgerPath, "utf8");
  assert.match(ledgerBeforeReconciliation, /\nCount: 1\n/);
  assert.equal(await readFile(issuePath, "utf8"), issueBefore);

  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    "--repo",
    repoRoot,
    "--scope",
    "demo",
    "--reconcile-item",
    "churn-reviewer-receipt",
    "--evidence-id",
    candidate.evidenceId,
  ]);
  const result = JSON.parse(stdout);

  assert.equal(result.status, "reconciled");
  assert.match(await readFile(ledgerPath, "utf8"), /\nCount: 2\n/);
  const cursor = JSON.parse(await readFile(statePath, "utf8"));
  assert.deepEqual(cursor.recurrence.pendingCandidates, []);
  assert.deepEqual(cursor.recurrence.consumedEvidenceIds, [
    candidate.evidenceId,
  ]);
  assert.equal(await readFile(issuePath, "utf8"), issueBefore);
});

test("keeps an un-emitted initial attach tail pending for the next poll", async () => {
  const repoRoot = await fixture();
  await setClaim(repoRoot, "5");
  await writeFile(
    path.join(
      repoRoot,
      ".sandcastle",
      "logs",
      "sandcastle-sequential-reviewer-5-implementer.log",
    ),
    "first tail\n",
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  await writeFile(
    path.join(
      repoRoot,
      ".sandcastle",
      "logs",
      "sandcastle-sequential-reviewer-5-reviewer.log",
    ),
    "second tail\n",
  );
  const fakeRunner = spawn(process.execPath, [".sandcastle/main.mts"], {
    cwd: repoRoot,
    env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: "demo" },
    stdio: "ignore",
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const initial = await runSnapshot(repoRoot, [
      "--max-log-bytes",
      "12",
      "--max-log-files",
      "2",
      "--initial-tail-bytes",
      "12",
    ]);
    assert.equal(initial.logs.deltas.length, 1);
    assert.equal(initial.logs.pendingChangedFiles, 1);

    const next = await runSnapshot(repoRoot, [
      "--max-log-bytes",
      "12",
      "--max-log-files",
      "2",
      "--initial-tail-bytes",
      "12",
    ]);
    assert.equal(next.logs.deltas.length, 1);
    assert.match(next.logs.deltas[0].text, /first tail/);
  } finally {
    fakeRunner.kill("SIGTERM");
  }
});

test("bounds a large appended line and reports skipped bytes", async () => {
  const repoRoot = await fixture();
  const logPath = path.join(
    repoRoot,
    ".sandcastle",
    "logs",
    "sandcastle-sequential-reviewer-6-implementer.log",
  );
  await writeFile(logPath, "baseline\n");
  await runSnapshot(repoRoot);
  await appendFile(logPath, "x".repeat(100));

  const result = await runSnapshot(repoRoot, [
    "--max-log-bytes",
    "16",
    "--initial-tail-bytes",
    "16",
  ]);
  assert.equal(Buffer.byteLength(result.logs.deltas[0].text), 16);
  assert.equal(result.logs.deltas[0].skippedBytes, 84);
});

test("collapses nested runner descendants into one process tree", async () => {
  const repoRoot = await fixture();
  const fakeRunner = spawn(
    "/bin/bash",
    ["-c", `"${process.execPath}" .sandcastle/main.mts; true`],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        FAKE_NESTED_RUNNER: "1",
        MAIL_SEARCHER_ISSUE_SCOPE: "demo",
      },
      stdio: "ignore",
    },
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await runSnapshot(repoRoot);
    assert.equal(result.runners.length, 1);
    assert.equal(result.runners[0].pids.length, 2);
    assert.equal(result.runners[0].scope, "demo");
  } finally {
    try {
      process.kill(-fakeRunner.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
});

test("reports multiple runner roots and their distinct scopes", async () => {
  const repoRoot = await fixture();
  const runners = ["demo", "other"].map((scope) =>
    spawn(process.execPath, [".sandcastle/main.mjs"], {
      cwd: repoRoot,
      env: { ...process.env, MAIL_SEARCHER_ISSUE_SCOPE: scope },
      stdio: "ignore",
    }),
  );

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await runSnapshot(repoRoot);
    assert.equal(result.runners.length, 2);
    assert.deepEqual(result.runners.map(({ scope }) => scope).sort(), [
      "demo",
      "other",
    ]);
  } finally {
    for (const runner of runners) runner.kill("SIGTERM");
  }
});

test("reinitializes a corrupt cursor with an explicit warning", async () => {
  const repoRoot = await fixture();
  const cursorPath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  await writeFile(cursorPath, "not json\n");

  const result = await runSnapshot(repoRoot);
  assert.equal(result.cursor.initialized, true);
  assert.match(result.warnings[0], /reinitialized/);
  assert.equal(JSON.parse(await readFile(cursorPath, "utf8")).version, 2);
});

test("rejects recurrence cursor candidates that contain raw log lines", async () => {
  const repoRoot = await fixture();
  const cursorPath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  await runSnapshot(repoRoot);
  const cursor = JSON.parse(await readFile(cursorPath, "utf8"));
  cursor.recurrence.pendingCandidates.push({
    version: 1,
    fingerprint: `recurrence-v1:${"a".repeat(64)}`,
    evidenceId: `evidence-v1:${"b".repeat(64)}`,
    observedAt: "2026-07-20T18:10:17.866Z",
    symptom: "redacted symptom",
    phase: "review",
    ownershipBoundary: "runner-owned reviewer receipt",
    log: { path: ".sandcastle/logs/review.log", start: 1, end: 2 },
    context: { issueId: null, claimId: null },
    line: "FA_TELEGRAM_BOT_TOKEN=do-not-persist",
  });
  await writeFile(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`);

  const result = await runSnapshot(repoRoot);
  const repaired = await readFile(cursorPath, "utf8");

  assert.equal(result.cursor.initialized, true);
  assert.match(result.warnings[0], /recurrence candidate.*reinitialized/i);
  assert.doesNotMatch(repaired, /do-not-persist|"line"/);
});

test("migrates a version-1 cursor without replaying historical log bytes", async () => {
  const repoRoot = await fixture();
  const relativeLog =
    ".sandcastle/logs/sandcastle-sequential-reviewer-13-reviewer.log";
  const logPath = path.join(repoRoot, relativeLog);
  const dormantRelativeLog =
    ".sandcastle/logs/sandcastle-sequential-reviewer-13-implementer.log";
  const dormantLogPath = path.join(repoRoot, dormantRelativeLog);
  const cursorPath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  await writeFile(logPath, "historical\n");
  await writeFile(dormantLogPath, "dormant\n");
  await runSnapshot(repoRoot);
  const oldCursor = JSON.parse(await readFile(cursorPath, "utf8"));
  oldCursor.version = 1;
  delete oldCursor.recurrence;
  oldCursor.logs[dormantRelativeLog].eventCarry =
    "Error: credential capability FA_TELEGRAM_API_HASH=migration-secret";
  oldCursor.logs[dormantRelativeLog].eventCarryStartOffset = 0;
  await writeFile(cursorPath, `${JSON.stringify(oldCursor, null, 2)}\n`);
  await appendFile(
    logPath,
    "Successful live proof has no reviewer-consumable receipt.\n",
  );

  const migrated = await runSnapshot(repoRoot);

  assert.equal(migrated.version, 2);
  assert.match(migrated.warnings[0], /version 1 was migrated/);
  assert.doesNotMatch(migrated.logs.deltas[0].text, /historical/);
  assert.equal(migrated.logs.recurrenceCandidates.length, 1);
  assert.doesNotMatch(await readFile(cursorPath, "utf8"), /migration-secret/);
});

test("bounds pending candidates and consumed evidence in the persisted cursor", async () => {
  const repoRoot = await fixture();
  const cursorPath = path.join(
    repoRoot,
    ".scratch",
    "demo",
    ".sandcastle-shadow-state.json",
  );
  await runSnapshot(repoRoot);
  const cursor = JSON.parse(await readFile(cursorPath, "utf8"));
  const pendingCandidates = Array.from({ length: 130 }, (_, index) =>
    buildRecurrenceCandidate(
      {
        line: `Error: bounded candidate ${index}.`,
        path: `.sandcastle/logs/bounded-${index}.log`,
        start: index * 10,
        end: index * 10 + 5,
        observedAt: "2026-07-20T18:10:17.866Z",
      },
      {
        phase: "unknown",
        ownershipBoundary: "runner process lifecycle",
        issueId: null,
        claimId: null,
      },
    ),
  );
  const consumedEvidenceIds = Array.from(
    { length: 514 },
    (_, index) =>
      `evidence-v1:${(index + 1000).toString(16).padStart(64, "0")}`,
  );
  cursor.recurrence = { pendingCandidates, consumedEvidenceIds };
  await writeFile(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`);

  await runSnapshot(repoRoot);
  const bounded = JSON.parse(await readFile(cursorPath, "utf8"));

  assert.equal(bounded.recurrence.pendingCandidates.length, 128);
  assert.equal(
    bounded.recurrence.pendingCandidates[0].evidenceId,
    pendingCandidates[2].evidenceId,
  );
  assert.equal(bounded.recurrence.consumedEvidenceIds.length, 512);
  assert.equal(
    bounded.recurrence.consumedEvidenceIds[0],
    consumedEvidenceIds[2],
  );
});
