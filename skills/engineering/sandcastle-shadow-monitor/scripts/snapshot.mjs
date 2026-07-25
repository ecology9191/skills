#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
  lstat,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildRecurrenceCandidate,
  MAX_CONSUMED_EVIDENCE_IDS,
  MAX_PENDING_CANDIDATES,
  persistReconciliation,
  redactRecurrenceText,
  validateRecurrenceCursor,
} from "./recurrence.mjs";

const execFileAsync = promisify(execFile);
const STATE_VERSION = 2;
const DEFAULT_MAX_LOG_BYTES = 32 * 1024;
const DEFAULT_MAX_LOG_FILES = 6;
const DEFAULT_INITIAL_TAIL_BYTES = 8 * 1024;
const MAX_EVENT_CARRY_CHARACTERS = 1024;
const EVENT_PATTERN =
  /(?:=== Iteration|Claimed issue:|Branch:|Recovering preserved|No ready unblocked issues|COMPLETE|APPROVED|DENIED|merge-blocked|needs-manual-review|error|failed|timed out|quota|rate limit|reviewer-consumable receipt|credential capability|committed ADR is missing|bootstrap replay)/i;
const RECURRENCE_SIGNAL_PATTERN =
  /(?:DENIED|merge-blocked|needs-manual-review|error|failed|timed out|quota|rate limit|reviewer-consumable receipt|credential capability|committed ADR is missing|bootstrap replay)/i;

function usage() {
  return [
    "Usage: snapshot.mjs --scope <scope> [options]",
    "",
    "Options:",
    "  --repo <path>                 Repository root (default: current directory)",
    "  --issue <issue-id>            Referenced .scratch issue ID for queue-head validation",
    "  --state <path>                Cursor path (default: .scratch/<scope>/.sandcastle-shadow-state.json)",
    "  --reconcile-item <churn-id>   Existing generic churn row selected by a human",
    "  --evidence-id <evidence-id>   Pending evidence identity selected for reconciliation",
    "  --max-log-bytes <number>      Total log bytes emitted per poll (default: 32768)",
    "  --max-log-files <number>      Changed log files emitted per poll (default: 6)",
    "  --initial-tail-bytes <number> Tail bytes per recent log when attaching (default: 8192)",
    "  --help                        Show this help",
  ].join("\n");
}

function positiveInteger(raw, flag) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer, got ${raw}.`);
  }
  return value;
}

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    maxLogBytes: DEFAULT_MAX_LOG_BYTES,
    maxLogFiles: DEFAULT_MAX_LOG_FILES,
    initialTailBytes: DEFAULT_INITIAL_TAIL_BYTES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${flag} requires a value.`);
    }
    index += 1;

    if (flag === "--repo") options.repoRoot = value;
    else if (flag === "--scope") options.scope = value;
    else if (flag === "--issue") options.issue = value;
    else if (flag === "--state") options.statePath = value;
    else if (flag === "--reconcile-item") options.reconcileItem = value;
    else if (flag === "--evidence-id") options.evidenceId = value;
    else if (flag === "--max-log-bytes") {
      options.maxLogBytes = positiveInteger(value, flag);
    } else if (flag === "--max-log-files") {
      options.maxLogFiles = positiveInteger(value, flag);
    } else if (flag === "--initial-tail-bytes") {
      options.initialTailBytes = positiveInteger(value, flag);
    } else {
      throw new Error(`unknown option ${flag}.`);
    }
  }

  if (!options.help && !options.scope) {
    throw new Error("--scope is required.");
  }
  if (
    !options.help &&
    Boolean(options.reconcileItem) !== Boolean(options.evidenceId)
  ) {
    throw new Error(
      "--reconcile-item and --evidence-id must be supplied together.",
    );
  }
  return options;
}

function normalizeScope(rawScope) {
  let scope = String(rawScope)
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  scope = scope.replace(/^\.scratch\//, "").replace(/\/PRD\.md$/i, "");
  const issueMarker = scope.indexOf("/issues/");
  if (issueMarker !== -1) scope = scope.slice(0, issueMarker);
  scope = scope.replace(/^\/+|\/+$/g, "");
  if (
    !scope ||
    !/^[A-Za-z0-9._/-]+$/.test(scope) ||
    scope.includes(",") ||
    scope.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`invalid scope ${rawScope}.`);
  }
  return scope;
}

function normalizeIssueId(rawIssue, repoRoot) {
  if (!rawIssue) return null;
  const normalizedRepo = path.resolve(repoRoot).replaceAll("\\", "/");
  let issue = String(rawIssue)
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  if (issue.startsWith(`${normalizedRepo}/`)) {
    issue = issue.slice(normalizedRepo.length + 1);
  }
  if (!issue.startsWith(".scratch/")) {
    throw new Error(`--issue must identify a .scratch issue, got ${rawIssue}.`);
  }
  return issue;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function isWithinOrEqual(parent, child) {
  return parent === child || isWithin(parent, child);
}

async function resolveContainedStatePath(
  scopeRoot,
  resolvedScopeRoot,
  requestedStatePath,
) {
  const lexicalStatePath = path.resolve(requestedStatePath);
  if (!isWithin(scopeRoot, lexicalStatePath)) {
    throw new Error("cursor must live inside the selected scope.");
  }
  const lexicalParent = path.dirname(lexicalStatePath);
  const resolvedParent = await realpath(lexicalParent).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error("cursor parent must already exist inside the scope.");
    }
    throw error;
  });
  if (!isWithinOrEqual(resolvedScopeRoot, resolvedParent)) {
    throw new Error("cursor parent resolves outside the selected scope.");
  }
  try {
    const metadata = await lstat(lexicalStatePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("cursor must be a regular file inside the selected scope.");
    }
    const resolvedStatePath = await realpath(lexicalStatePath);
    if (!isWithin(resolvedScopeRoot, resolvedStatePath)) {
      throw new Error("cursor resolves outside the selected scope.");
    }
    return resolvedStatePath;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return path.join(resolvedParent, path.basename(lexicalStatePath));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function ensureLedger(scopeRoot, scope) {
  const ledgerPath = path.join(scopeRoot, "ledger.md");
  const body = [
    "# Sandcastle Shadow Ledger",
    "",
    `Scope: ${scope}`,
    "",
    "Local Sandcastle workflow state. Record generic churn with bounded log references; keep this file uncommitted.",
    "",
  ].join("\n");

  try {
    await writeFile(ledgerPath, body, { flag: "wx" });
    return { path: ledgerPath, created: true };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const metadata = await lstat(ledgerPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`ledger is not a regular file: ${ledgerPath}.`);
    }
    return { path: ledgerPath, created: false };
  }
}

function migrateCursorLogs(logs) {
  return Object.fromEntries(
    Object.entries(logs).map(([logPath, state]) => [
      logPath,
      {
        offset:
          Number.isSafeInteger(state?.offset) && state.offset >= 0
            ? state.offset
            : 0,
        eventCarry: Array.from(
          redactRecurrenceText(
            typeof state?.eventCarry === "string" ? state.eventCarry : "",
          ),
        )
          .slice(-MAX_EVENT_CARRY_CHARACTERS)
          .join(""),
        eventCarryStartOffset:
          Number.isSafeInteger(state?.eventCarryStartOffset) &&
          state.eventCarryStartOffset >= 0
            ? state.eventCarryStartOffset
            : null,
        inode:
          typeof state?.inode === "string" && state.inode
            ? state.inode
            : "migration-unknown",
        mtimeMs:
          Number.isFinite(state?.mtimeMs) && state.mtimeMs >= 0
            ? state.mtimeMs
            : 0,
      },
    ]),
  );
}

async function readCursor(statePath, repoRoot, scope, warnings) {
  try {
    const metadata = await lstat(statePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      warnings.push("Cursor is not a regular file; initialized a new cursor.");
      return null;
    }
    const parsed = JSON.parse(await readFile(statePath, "utf8"));
    const metadataMatches =
      parsed.repoRoot === repoRoot &&
      parsed.scope === scope &&
      typeof parsed.logs === "object" &&
      parsed.logs !== null;
    if (parsed.version === 1 && metadataMatches) {
      warnings.push(
        "Cursor version 1 was migrated to recurrence-aware cursor version 2.",
      );
      return {
        ...parsed,
        version: STATE_VERSION,
        logs: migrateCursorLogs(parsed.logs),
        recurrence: { pendingCandidates: [], consumedEvidenceIds: [] },
      };
    }
    if (parsed.version !== STATE_VERSION || !metadataMatches) {
      warnings.push(
        "Cursor metadata did not match this repository and scope; initialized a new cursor.",
      );
      return null;
    }
    try {
      validateRecurrenceCursor(parsed);
    } catch (error) {
      const subject = /candidate/i.test(error.message) ? "candidate" : "state";
      warnings.push(
        `Cursor recurrence ${subject} was invalid and cursor was reinitialized: ${error.message}`,
      );
      return null;
    }
    return {
      ...parsed,
      recurrence: {
        pendingCandidates: parsed.recurrence.pendingCandidates.slice(
          -MAX_PENDING_CANDIDATES,
        ),
        consumedEvidenceIds: parsed.recurrence.consumedEvidenceIds.slice(
          -MAX_CONSUMED_EVIDENCE_IDS,
        ),
      },
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    warnings.push(
      `Cursor could not be read and was reinitialized: ${error.message}`,
    );
    return null;
  }
}

async function writeCursor(statePath, state) {
  const temporaryPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporaryPath, statePath);
}

function parseEnvironment(buffer) {
  const environment = {};
  for (const entry of buffer.toString("utf8").split("\0")) {
    const separator = entry.indexOf("=");
    if (separator > 0)
      environment[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return environment;
}

function isRunnerProcess({ command }) {
  const entrypointPattern =
    /(?:^|\s)["']?(?:[^\s"']*\/)?\.sandcastle\/main\.(?:mts|mjs)["']?(?=\s|$)/;
  if (!entrypointPattern.test(command)) return false;

  const executableToken = command
    .trim()
    .match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const executable = path.basename(
    executableToken?.[1] || executableToken?.[2] || executableToken?.[3] || "",
  );
  if (["node", "nodejs"].includes(executable)) {
    return !/(?:^|\s)--check(?:\s|$)/.test(command);
  }
  if (["npm", "npx"].includes(executable)) {
    return /(?:^|\s)tsx(?:\s|$)/.test(command);
  }
  return executable === "tsx";
}

async function processDetails(processInfo, repoRoot, warnings) {
  try {
    const cwd = path.resolve(await readlink(`/proc/${processInfo.pid}/cwd`));
    if (cwd !== repoRoot) return null;
    const environment = parseEnvironment(
      await readFile(`/proc/${processInfo.pid}/environ`),
    );
    return {
      pid: processInfo.pid,
      ppid: processInfo.ppid,
      cwd,
      scope: environment.MAIL_SEARCHER_ISSUE_SCOPE || null,
      command: processInfo.command.slice(0, 400),
    };
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM"].includes(error?.code)) {
      warnings.push(
        `Runner candidate PID ${processInfo.pid} could not be inspected: ${error.code}.`,
      );
      return null;
    }
    throw error;
  }
}

async function collectRunners(repoRoot, warnings) {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,args="], {
      maxBuffer: 4 * 1024 * 1024,
    });
    const processes = stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((match) => ({
        pid: Number.parseInt(match[1], 10),
        ppid: Number.parseInt(match[2], 10),
        command: match[3],
      }));
    const candidates = processes.filter(isRunnerProcess);

    const processByPid = new Map(
      processes.map((processInfo) => [processInfo.pid, processInfo]),
    );
    const candidatePids = new Set(candidates.map(({ pid }) => pid));
    const rootCandidate = (candidate) => {
      let rootPid = candidate.pid;
      let parent = processByPid.get(candidate.ppid);
      const visited = new Set([candidate.pid]);
      while (parent && !visited.has(parent.pid)) {
        visited.add(parent.pid);
        if (candidatePids.has(parent.pid)) rootPid = parent.pid;
        parent = processByPid.get(parent.ppid);
      }
      return rootPid;
    };

    const details = (
      await Promise.all(
        candidates.map(async (candidate) => ({
          rootPid: rootCandidate(candidate),
          details: await processDetails(candidate, repoRoot, warnings),
        })),
      )
    ).filter(({ details: candidateDetails }) => candidateDetails);
    const groups = new Map();
    for (const entry of details) {
      const group = groups.get(entry.rootPid) || [];
      group.push(entry.details);
      groups.set(entry.rootPid, group);
    }

    return [...groups.entries()]
      .map(([rootPid, group]) => {
        const scopes = [
          ...new Set(
            group.map(({ scope: runnerScope }) => runnerScope).filter(Boolean),
          ),
        ];
        const representative =
          group.find(({ pid }) => pid === rootPid) || group[0];
        return {
          pid: representative.pid,
          pids: group.map(({ pid }) => pid).sort((left, right) => left - right),
          cwd: representative.cwd,
          scope: scopes.length === 1 ? scopes[0] : null,
          scopeAmbiguous: scopes.length > 1,
          command: representative.command,
        };
      })
      .sort((left, right) => left.pid - right.pid);
  } catch (error) {
    warnings.push(`Runner process scan failed: ${error.message}`);
    return [];
  }
}

async function collectMarkdownFiles(directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function extractField(body, name) {
  return body.match(new RegExp(`^${name}:\\s*(.+)$`, "im"))?.[1]?.trim() || "";
}

function trackerEnvironment(repoRoot, scope) {
  const environment = {
    ...process.env,
    MAIL_SEARCHER_ISSUE_ROOT: path.join(repoRoot, ".scratch"),
    MAIL_SEARCHER_ISSUE_SCOPE: scope,
  };
  delete environment.MAIL_SEARCHER_ISSUE_CLAIM;
  return environment;
}

async function collectIssueSummary(repoRoot, scopeRoot, scope, targetIssue) {
  const issueFiles = await collectMarkdownFiles(path.join(scopeRoot, "issues"));
  const issues = await Promise.all(
    issueFiles.map(async (filePath) => {
      const body = await readFile(filePath, "utf8");
      return {
        id: `.scratch/${path.relative(path.join(repoRoot, ".scratch"), filePath).split(path.sep).join("/")}`,
        title:
          body.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(filePath),
        status: extractField(body, "Status"),
        claim: extractField(body, "Claim") || null,
      };
    }),
  );
  const statusCounts = {};
  for (const issue of issues) {
    const status = issue.status || "missing";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  let ready = [];
  let queueError = null;
  let target = null;
  let targetError = null;
  const trackerPath = path.join(repoRoot, ".sandcastle", "issue-tracker.mjs");
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [trackerPath, "list"],
      {
        cwd: repoRoot,
        env: trackerEnvironment(repoRoot, scope),
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(stdout || "[]");
    if (!Array.isArray(parsed))
      throw new Error("tracker list did not return an array");
    ready = parsed.map(({ id, title, status }) => ({ id, title, status }));
  } catch (error) {
    queueError = error.stderr?.trim() || error.message;
  }

  if (targetIssue) {
    const scopeIssuePrefix = `.scratch/${scope}/issues/`;
    if (!targetIssue.startsWith(scopeIssuePrefix)) {
      targetError = `target issue is outside the selected scope: ${targetIssue}`;
    } else {
      try {
        const { stdout } = await execFileAsync(
          process.execPath,
          [trackerPath, "view", targetIssue],
          {
            cwd: repoRoot,
            env: trackerEnvironment(repoRoot, scope),
            maxBuffer: 10 * 1024 * 1024,
          },
        );
        target = JSON.parse(stdout || "null");
        if (!target || target.id !== targetIssue) {
          throw new Error(
            `tracker resolved an unexpected issue: ${target?.id || "none"}`,
          );
        }
      } catch (error) {
        targetError = error.stderr?.trim() || error.message;
      }
    }
  }

  return {
    claimed: issues.filter(({ claim }) => claim),
    statusCounts,
    readyCount: ready.length,
    readyHead: ready[0] || null,
    targetIssue,
    targetStatus: target?.status || null,
    targetClaim: target?.claim || null,
    targetIsReadyHead: targetIssue
      ? !targetError && ready[0]?.id === targetIssue
      : null,
    targetError,
    queueError,
  };
}

function inferPhase(fileName) {
  if (fileName.includes("implementer-rework")) return "rework";
  if (fileName.includes("reviewer")) return "review";
  if (fileName.includes("implementer")) return "implementation";
  return "unknown";
}

async function collectLogFiles(repoRoot) {
  const logRoot = path.join(repoRoot, ".sandcastle", "logs");
  if (!(await pathExists(logRoot))) return [];
  const entries = await readdir(logRoot, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map(async (entry) => {
        const filePath = path.join(logRoot, entry.name);
        const metadata = await stat(filePath);
        return {
          path: filePath,
          relativePath: path
            .relative(repoRoot, filePath)
            .split(path.sep)
            .join("/"),
          name: entry.name,
          size: metadata.size,
          mtimeMs: metadata.mtimeMs,
          inode: String(metadata.ino),
          phase: inferPhase(entry.name),
        };
      }),
  );
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function completeUtf8End(buffer) {
  if (buffer.length === 0) return 0;
  let leadIndex = buffer.length - 1;
  while (leadIndex >= 0 && (buffer[leadIndex] & 0xc0) === 0x80) leadIndex -= 1;
  if (leadIndex < 0) return 0;
  const lead = buffer[leadIndex];
  const expectedLength =
    (lead & 0x80) === 0
      ? 1
      : (lead & 0xe0) === 0xc0
        ? 2
        : (lead & 0xf0) === 0xe0
          ? 3
          : 4;
  return buffer.length - leadIndex < expectedLength ? leadIndex : buffer.length;
}

async function readUtf8Bytes(filePath, start, length) {
  if (length <= 0)
    return { text: "", fromOffset: start, toOffset: start, trailingBytes: 0 };
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    const bytes = buffer.subarray(0, bytesRead);
    let leadingContinuationBytes = 0;
    while (
      leadingContinuationBytes < bytes.length &&
      (bytes[leadingContinuationBytes] & 0xc0) === 0x80
    ) {
      leadingContinuationBytes += 1;
    }
    const completeEnd = completeUtf8End(bytes);
    const safeEnd = Math.max(leadingContinuationBytes, completeEnd);
    return {
      text: bytes.subarray(leadingContinuationBytes, safeEnd).toString("utf8"),
      fromOffset: start + leadingContinuationBytes,
      toOffset: start + safeEnd,
      trailingBytes: bytes.length - safeEnd,
    };
  } finally {
    await handle.close();
  }
}

function eventDelta(delta, previousCarry, previousCarryStartOffset) {
  const reuseCarry = !delta.reset && delta.skippedBytes === 0;
  const prefix = reuseCarry ? previousCarry : "";
  const combined = `${prefix}${delta.text}`;
  const events = [];
  let consumedCharacters = 0;
  for (const match of combined.matchAll(/([^\r\n]*)(?:\r\n|\n)/g)) {
    const rawLine = match[1];
    const line = rawLine.trim();
    if (line && EVENT_PATTERN.test(line)) {
      const beginsInCarry = match.index < prefix.length;
      const lineStart =
        beginsInCarry && Number.isSafeInteger(previousCarryStartOffset)
          ? previousCarryStartOffset
          : delta.fromOffset +
            Buffer.byteLength(
              delta.text.slice(0, Math.max(0, match.index - prefix.length)),
            );
      const lineEnd = beginsInCarry
        ? delta.fromOffset +
          Buffer.byteLength(
            delta.text.slice(
              0,
              Math.max(0, match.index + rawLine.length - prefix.length),
            ),
          )
        : lineStart + Buffer.byteLength(rawLine);
      const emittedLine = Array.from(line).slice(0, 500).join("");
      events.push({
        path: delta.path,
        start: lineStart,
        end: lineEnd,
        line: emittedLine,
      });
    }
    consumedCharacters = match.index + match[0].length;
  }
  const unboundedCarry = combined.slice(consumedCharacters);
  const sanitizedCarry = redactRecurrenceText(unboundedCarry);
  const carryCharacters = Array.from(sanitizedCarry);
  const carry = carryCharacters
    .slice(-MAX_EVENT_CARRY_CHARACTERS)
    .join("");
  const unboundedCarryStart =
    prefix && consumedCharacters < prefix.length
      ? previousCarryStartOffset
      : delta.fromOffset +
        Buffer.byteLength(
          delta.text.slice(
            0,
            Math.max(0, consumedCharacters - prefix.length),
          ),
        );
  return {
    carry,
    carryStartOffset: carry
      ? unboundedCarryStart
      : null,
    events,
  };
}

function matchesClaim(fileName, claimTokens) {
  return claimTokens.some((claim) => fileName.includes(`-${claim}-`));
}

async function collectLogSnapshot(
  repoRoot,
  cursor,
  runners,
  scope,
  issues,
  options,
) {
  const files = await collectLogFiles(repoRoot);
  const firstSnapshot = cursor === null;
  const claimAmbiguous = issues.claimed.length > 1;
  const claimTokens = claimAmbiguous
    ? []
    : issues.claimed.map(({ claim }) => claim).filter(Boolean);
  const currentFiles = files.filter(({ name }) =>
    matchesClaim(name, claimTokens),
  );
  const currentPaths = new Set(
    currentFiles.map(({ relativePath }) => relativePath),
  );
  const attachTail =
    firstSnapshot && runners.some((runner) => runner.scope === scope);
  const initialTailPaths = new Set(
    attachTail
      ? currentFiles
          .slice(0, options.maxLogFiles)
          .map(({ relativePath }) => relativePath)
      : [],
  );
  const candidates = [];

  for (const file of files) {
    const previous = cursor?.logs?.[file.relativePath];
    if (firstSnapshot) {
      if (initialTailPaths.has(file.relativePath) && file.size > 0) {
        candidates.push({
          file,
          desiredStart: Math.max(0, file.size - options.initialTailBytes),
          reset: false,
        });
      }
      continue;
    }

    if (!previous) {
      if (file.size > 0)
        candidates.push({ file, desiredStart: 0, reset: false });
    } else if (previous.inode !== file.inode || file.size < previous.offset) {
      candidates.push({ file, desiredStart: 0, reset: true });
    } else if (file.size > previous.offset) {
      candidates.push({ file, desiredStart: previous.offset, reset: false });
    }
  }

  const selected = candidates.slice(0, options.maxLogFiles);
  const selectedPaths = new Set(selected.map(({ file }) => file.relativePath));
  const candidateByPath = new Map(
    candidates.map((candidate) => [candidate.file.relativePath, candidate]),
  );
  let remainingBytes = options.maxLogBytes;
  const deltas = [];
  const emittedOffsets = new Map();
  const emittedCarries = new Map();
  const emittedCarryStarts = new Map();
  const events = [];

  for (const candidate of selected) {
    if (remainingBytes <= 0) break;
    const available = candidate.file.size - candidate.desiredStart;
    const perFileLimit = Math.min(options.initialTailBytes, remainingBytes);
    const bytesToRead = Math.min(available, perFileLimit);
    const fromOffset = candidate.file.size - bytesToRead;
    const decoded = await readUtf8Bytes(
      candidate.file.path,
      fromOffset,
      bytesToRead,
    );
    const delta = {
      path: candidate.file.relativePath,
      current: currentPaths.has(candidate.file.relativePath),
      phase: currentPaths.has(candidate.file.relativePath)
        ? candidate.file.phase
        : "unknown",
      previousOffset: candidate.desiredStart,
      fromOffset: decoded.fromOffset,
      toOffset: decoded.toOffset,
      availableToOffset: candidate.file.size,
      skippedBytes: Math.max(0, decoded.fromOffset - candidate.desiredStart),
      trailingBytes: decoded.trailingBytes,
      reset: candidate.reset,
      text: decoded.text,
    };
    deltas.push(delta);
    const previousCarry =
      cursor?.logs?.[candidate.file.relativePath]?.eventCarry || "";
    const previousCarryStartOffset =
      cursor?.logs?.[candidate.file.relativePath]?.eventCarryStartOffset;
    const parsedEvents = eventDelta(
      delta,
      previousCarry,
      previousCarryStartOffset,
    );
    emittedCarries.set(candidate.file.relativePath, parsedEvents.carry);
    emittedCarryStarts.set(
      candidate.file.relativePath,
      parsedEvents.carryStartOffset,
    );
    events.push(...parsedEvents.events);
    emittedOffsets.set(candidate.file.relativePath, decoded.toOffset);
    remainingBytes -= bytesToRead;
  }

  const emittedPaths = new Set(deltas.map(({ path: logPath }) => logPath));
  const nextLogs = {};
  for (const file of files) {
    const previous = cursor?.logs?.[file.relativePath];
    const candidate = candidateByPath.get(file.relativePath);
    let offset = file.size;
    let eventCarry = previous?.eventCarry || "";
    let eventCarryStartOffset = previous?.eventCarryStartOffset ?? null;
    let inode = file.inode;
    let mtimeMs = file.mtimeMs;
    if (emittedOffsets.has(file.relativePath)) {
      offset = emittedOffsets.get(file.relativePath);
      eventCarry = emittedCarries.get(file.relativePath) || "";
      eventCarryStartOffset =
        emittedCarryStarts.get(file.relativePath) ?? null;
    } else if (firstSnapshot && selectedPaths.has(file.relativePath)) {
      offset = selected.find(
        ({ file: selectedFile }) =>
          selectedFile.relativePath === file.relativePath,
      )?.desiredStart;
      eventCarry = "";
      eventCarryStartOffset = null;
    } else if (!firstSnapshot && candidate && !emittedPaths.has(file.relativePath)) {
      offset = previous?.offset || 0;
      if (candidate?.reset) {
        eventCarry = "";
        eventCarryStartOffset = null;
      }
      if (previous) {
        inode = previous.inode;
        mtimeMs = previous.mtimeMs;
      }
    } else if (firstSnapshot) {
      eventCarry = "";
      eventCarryStartOffset = null;
    }
    nextLogs[file.relativePath] = {
      offset,
      eventCarry,
      eventCarryStartOffset,
      inode,
      mtimeMs,
    };
  }

  return {
    initialized: firstSnapshot,
    claimAmbiguous,
    currentClaimTokens: claimTokens,
    latest: currentFiles.slice(0, 3).map((file) => ({
      path: file.relativePath,
      phase: file.phase,
      size: file.size,
      mtime: new Date(file.mtimeMs).toISOString(),
    })),
    deltas,
    events: events.slice(-40),
    pendingChangedFiles: Math.max(0, candidates.length - emittedPaths.size),
    nextLogs,
  };
}

export async function snapshot(rawOptions) {
  const options = {
    maxLogBytes: DEFAULT_MAX_LOG_BYTES,
    maxLogFiles: DEFAULT_MAX_LOG_FILES,
    initialTailBytes: DEFAULT_INITIAL_TAIL_BYTES,
    ...rawOptions,
  };
  const repoRoot = await realpath(
    path.resolve(options.repoRoot || process.cwd()),
  );
  const scope = normalizeScope(options.scope);
  const targetIssue = normalizeIssueId(options.issue, repoRoot);
  const scratchRoot = path.join(repoRoot, ".scratch");
  const resolvedScratchRoot = await realpath(scratchRoot).catch((error) => {
    if (error?.code === "ENOENT")
      throw new Error(`repository has no .scratch directory: ${repoRoot}.`);
    throw error;
  });
  const requestedScopeRoot = path.resolve(scratchRoot, scope);
  if (!isWithin(scratchRoot, requestedScopeRoot))
    throw new Error(`scope resolves outside .scratch: ${scope}.`);
  const resolvedScopeRoot = await realpath(requestedScopeRoot).catch(
    (error) => {
      if (error?.code === "ENOENT")
        throw new Error(`scope does not exist: .scratch/${scope}.`);
      throw error;
    },
  );
  if (!isWithin(resolvedScratchRoot, resolvedScopeRoot))
    throw new Error(`scope resolves outside .scratch: ${scope}.`);
  const scopeRoot = requestedScopeRoot;
  const scopeMetadata = await stat(scopeRoot);
  if (!scopeMetadata.isDirectory())
    throw new Error(`scope is not a directory: .scratch/${scope}.`);

  const requestedStatePath = options.statePath
    ? path.resolve(options.statePath)
    : path.join(scopeRoot, ".sandcastle-shadow-state.json");
  const statePath = await resolveContainedStatePath(
    scopeRoot,
    resolvedScopeRoot,
    requestedStatePath,
  );

  const warnings = [];
  const ledger = await ensureLedger(scopeRoot, scope);
  const cursor = await readCursor(statePath, repoRoot, scope, warnings);
  const runners = await collectRunners(repoRoot, warnings);
  const issues = await collectIssueSummary(
    repoRoot,
    scopeRoot,
    scope,
    targetIssue,
  );
  const logs = await collectLogSnapshot(
    repoRoot,
    cursor,
    runners,
    scope,
    issues,
    options,
  );
  const observedAt = new Date().toISOString();
  const priorRecurrence = cursor?.recurrence || {
    pendingCandidates: [],
    consumedEvidenceIds: [],
  };
  const pendingByEvidenceId = new Map(
    priorRecurrence.pendingCandidates.map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
  const consumedEvidenceIds = new Set(
    priorRecurrence.consumedEvidenceIds.slice(-MAX_CONSUMED_EVIDENCE_IDS),
  );
  const activeClaim = issues.claimed.length === 1 ? issues.claimed[0] : null;
  const deltaByPath = new Map(
    logs.deltas.map((delta) => [delta.path, delta]),
  );
  const recurrenceCandidates = [];
  for (const event of logs.events) {
    if (!RECURRENCE_SIGNAL_PATTERN.test(event.line)) {
      continue;
    }
    const delta = deltaByPath.get(event.path);
    const candidate = buildRecurrenceCandidate(
      {
        line: event.line,
        path: event.path,
        start: event.start,
        end: event.end,
        observedAt,
      },
      {
        phase: delta?.phase || "unknown",
        issueId: activeClaim?.id || issues.targetIssue,
        claimId: activeClaim?.claim || issues.targetClaim,
      },
    );
    if (
      consumedEvidenceIds.has(candidate.evidenceId) ||
      pendingByEvidenceId.has(candidate.evidenceId)
    ) {
      continue;
    }
    recurrenceCandidates.push(candidate);
    pendingByEvidenceId.set(candidate.evidenceId, candidate);
  }
  const pendingCandidates = [...pendingByEvidenceId.values()].slice(
    -MAX_PENDING_CANDIDATES,
  );
  logs.recurrenceCandidates = recurrenceCandidates;

  const safeWriteStatePath = await resolveContainedStatePath(
    scopeRoot,
    resolvedScopeRoot,
    requestedStatePath,
  );
  await writeCursor(safeWriteStatePath, {
    version: STATE_VERSION,
    repoRoot,
    scope,
    updatedAt: observedAt,
    logs: logs.nextLogs,
    recurrence: {
      pendingCandidates,
      consumedEvidenceIds: [...consumedEvidenceIds],
    },
  });
  delete logs.nextLogs;

  return {
    version: STATE_VERSION,
    observedAt,
    repoRoot,
    scope,
    ledger,
    cursor: { path: safeWriteStatePath, initialized: logs.initialized },
    runners,
    issues,
    logs,
    warnings,
  };
}

async function reconciliationPaths(options) {
  const repoRoot = await realpath(
    path.resolve(options.repoRoot || process.cwd()),
  );
  const scope = normalizeScope(options.scope);
  const scratchRoot = path.join(repoRoot, ".scratch");
  const resolvedScratchRoot = await realpath(scratchRoot).catch((error) => {
    if (error?.code === "ENOENT")
      throw new Error(`repository has no .scratch directory: ${repoRoot}.`);
    throw error;
  });
  const scopeRoot = path.resolve(scratchRoot, scope);
  if (!isWithin(scratchRoot, scopeRoot)) {
    throw new Error(`scope resolves outside .scratch: ${scope}.`);
  }
  const resolvedScopeRoot = await realpath(scopeRoot).catch((error) => {
    if (error?.code === "ENOENT")
      throw new Error(`scope does not exist: .scratch/${scope}.`);
    throw error;
  });
  if (!isWithin(resolvedScratchRoot, resolvedScopeRoot)) {
    throw new Error(`scope resolves outside .scratch: ${scope}.`);
  }
  const scopeMetadata = await stat(scopeRoot);
  if (!scopeMetadata.isDirectory()) {
    throw new Error(`scope is not a directory: .scratch/${scope}.`);
  }
  const requestedStatePath = options.statePath
    ? path.resolve(options.statePath)
    : path.join(scopeRoot, ".sandcastle-shadow-state.json");
  const statePath = await resolveContainedStatePath(
    scopeRoot,
    resolvedScopeRoot,
    requestedStatePath,
  );
  return {
    ledgerPath: path.join(scopeRoot, "ledger.md"),
    statePath,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (options.reconcileItem) {
      const paths = await reconciliationPaths(options);
      process.stdout.write(
        `${JSON.stringify(
          await persistReconciliation({
            ...paths,
            itemId: options.reconcileItem,
            evidenceId: options.evidenceId,
          }),
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(
      `${JSON.stringify(await snapshot(options), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`snapshot: ${error.message}\n`);
    process.exitCode = 1;
  }
}

async function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const [modulePath, invokedPath] = await Promise.all([
      realpath(fileURLToPath(import.meta.url)),
      realpath(path.resolve(process.argv[1])),
    ]);
    return modulePath === invokedPath;
  } catch {
    return false;
  }
}

if (await isMainModule()) await main();
