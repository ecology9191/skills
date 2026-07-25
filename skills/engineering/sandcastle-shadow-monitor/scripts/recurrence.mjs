import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

export const MAX_SYMPTOM_CHARACTERS = 240;
export const MAX_PENDING_CANDIDATES = 128;
export const MAX_CONSUMED_EVIDENCE_IDS = 512;
export const MAX_LEDGER_EVIDENCE_REFS = 8;

const PHASES = new Set([
  "implementation",
  "review",
  "rework",
  "recovery",
  "unknown",
]);
const LOG_PATH_PATTERN = /^\.sandcastle\/logs\/[^/\0]+$/;
const CANDIDATE_KEYS = [
  "context",
  "evidenceId",
  "fingerprint",
  "log",
  "occurredAt",
  "occurrenceSource",
  "observedAt",
  "ownershipBoundary",
  "phase",
  "symptom",
  "version",
];
const CURSOR_KEYS = [
  "logs",
  "recurrence",
  "repoRoot",
  "scope",
  "updatedAt",
  "version",
];
const LOG_CURSOR_KEYS = [
  "eventCarry",
  "eventCarryStartOffset",
  "inode",
  "mtimeMs",
  "offset",
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hasExactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  );
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function truncateCodePoints(value, maximum) {
  return Array.from(value).slice(0, maximum).join("");
}

export function redactRecurrenceText(value) {
  return String(value)
    .replace(
      /\b(authorization\s*:\s*)(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi,
      "$1<redacted>",
    )
    .replace(
      /\b((?:telethon\s+)?session(?:\s+string)?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      "$1<redacted>",
    )
    .replace(
      /\b((?:burner\s+)?phone(?:\s+number)?\s*[:=]\s*)\+?[\d(). -]{7,}\d/gi,
      "$1<redacted>",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]{1,})\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/g,
      "$1=<redacted>",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|DSN|API_KEY|API_HASH|SESSION|CHAT_ID))\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=<redacted>",
    )
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "<redacted-token>")
    .replace(
      /\b((?:chat|user|telegram)[-_ ]?id\s*[:=]\s*)-?\d+\b/gi,
      "$1<redacted>",
    );
}

function normalizeGenericSymptom(value) {
  const normalized = redactRecurrenceText(value)
    .toLowerCase()
    .replace(
      /^\s*\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?=\s)/,
      " ",
    )
    .replace(
      /\b\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:?\d{2})\b/g,
      " ",
    )
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\brecovery-\d+-\d+\b/g, " ")
    .replace(
      /\b(?:run|claim)(?:[-_ ]+id)?\s*(?:[:=#-]\s*)?(?:recovery-\d+-\d+|\d+|[0-9a-f]{7,64}|[a-z0-9._-]*\d[a-z0-9._-]*)\b/gi,
      " ",
    )
    .replace(/\b(?:run|claim)\s+id\b/g, " ")
    .replace(/\bid\s*(?:[:=#-]\s*|\s+)\d+\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ")
    .replace(/\b[0-9a-f]{7,64}\b/gi, " ")
    .replace(/(?:^|\s)\.(?:scratch|sandcastle)[\\/][^\s,;]+/g, " ")
    .replace(/(?:^|\s)[a-z]:\\(?:[^\s\\]+\\)*[^\s,;]+/gi, " ")
    .replace(/(?:^|\s)\/(?:[^\s:]+\/)*[^\s:]+/g, " ")
    .replace(/\b(?:head|commit)\b\s*:*/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—.]+$/g, "")
    .replace(/\s+/g, " ");
  return truncateCodePoints(normalized, MAX_SYMPTOM_CHARACTERS);
}

function normalizeSymptom(value) {
  const normalized = normalizeGenericSymptom(value);
  if (
    /successful live proof/.test(normalized) &&
    /no reviewer-consumable receipt/.test(normalized)
  ) {
    return "successful live proof has no reviewer-consumable receipt";
  }
  return normalized;
}

function normalizeSemanticLabel(value, fallback) {
  const normalized = normalizeGenericSymptom(value || fallback);
  if (!normalized) throw new Error("recurrence semantic label is empty");
  return normalized;
}

function inferOwnershipBoundary(line, explicitBoundary) {
  if (explicitBoundary) {
    return normalizeSemanticLabel(explicitBoundary);
  }
  const normalized = normalizeGenericSymptom(line);
  if (
    /reviewer-consumable receipt|runner-owned receipt|execution receipt/.test(
      normalized,
    )
  ) {
    return "runner-owned reviewer receipt";
  }
  if (
    /credential capability|missing burner|token is (?:absent|missing|required|unavailable)|credentials? (?:are |is )?(?:absent|missing|unavailable)/.test(
      normalized,
    )
  ) {
    return "host credential capability";
  }
  if (
    /committed adr|missing adr|bootstrap replay|bootstrap.*promote/.test(
      normalized,
    )
  ) {
    return "product proof dependency";
  }
  if (
    /linking phase assertion|forbidden.operation assertion|active issue/.test(
      normalized,
    )
  ) {
    return "issue acceptance behavior";
  }
  return "unknown ownership boundary";
}

function normalizeContextId(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = redactRecurrenceText(value).trim().slice(0, 160);
  if (!normalized || normalized.includes("<redacted>")) {
    throw new Error("recurrence context identifier is invalid");
  }
  return normalized;
}

function requireOffset(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function occurrenceFromLine(line, observedAt) {
  const match = String(line).match(
    /\b\d{4}-\d{2}-\d{2}[t ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:z|[+-]\d{2}:?\d{2})\b/i,
  );
  if (!match) {
    return {
      occurredAt: observedAt,
      occurrenceSource: "observation-fallback",
    };
  }
  const normalized = match[0]
    .replace(" ", "T")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    return {
      occurredAt: observedAt,
      occurrenceSource: "observation-fallback",
    };
  }
  return { occurredAt: timestamp.toISOString(), occurrenceSource: "event" };
}

function recurrenceFingerprint({ symptom, phase, ownershipBoundary }) {
  return `recurrence-v1:${digest(
    JSON.stringify({ symptom, phase, ownershipBoundary }),
  )}`;
}

function recurrenceEvidenceId({ fingerprint, symptom, log }) {
  return `evidence-v1:${digest(
    JSON.stringify({
      fingerprint,
      relativePath: log.path,
      start: log.start,
      end: log.end,
      redactedLineDigest: digest(symptom),
    }),
  )}`;
}

export function buildRecurrenceCandidate(event, context = {}) {
  if (!event || typeof event.line !== "string") {
    throw new Error("recurrence event line is required");
  }
  if (!LOG_PATH_PATTERN.test(event.path || "")) {
    throw new Error("recurrence log path must be log-relative");
  }
  const start = requireOffset(event.start, "recurrence event start");
  const end = requireOffset(event.end, "recurrence event end");
  if (end <= start) throw new Error("recurrence event byte range is empty");
  const observedAt = new Date(event.observedAt);
  if (
    Number.isNaN(observedAt.getTime()) ||
    observedAt.toISOString() !== event.observedAt
  ) {
    throw new Error("recurrence observedAt must be an ISO timestamp");
  }

  const symptom = normalizeSymptom(event.line);
  if (!symptom) throw new Error("recurrence symptom is empty");
  const phase = PHASES.has(context.phase) ? context.phase : "unknown";
  const ownershipBoundary = inferOwnershipBoundary(
    event.line,
    context.ownershipBoundary,
  );
  const fingerprint = recurrenceFingerprint({
    symptom,
    phase,
    ownershipBoundary,
  });
  const log = { path: event.path, start, end };
  const evidenceId = recurrenceEvidenceId({ fingerprint, symptom, log });
  const occurrence = occurrenceFromLine(event.line, event.observedAt);

  const candidate = {
    version: 1,
    fingerprint,
    evidenceId,
    ...occurrence,
    observedAt: event.observedAt,
    symptom,
    phase,
    ownershipBoundary,
    log,
    context: {
      issueId: normalizeContextId(context.issueId),
      claimId: normalizeContextId(context.claimId),
    },
  };
  validateRecurrenceCandidate(candidate);
  return candidate;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireSingleField(block, field) {
  const matches = [
    ...block.matchAll(new RegExp(`^${escapeRegularExpression(field)}: (.*)$`, "gm")),
  ];
  if (matches.length !== 1) {
    throw new Error(`ledger item must contain exactly one ${field} field`);
  }
  return matches[0];
}

function replaceField(block, match, field, value) {
  return `${block.slice(0, match.index)}${field}: ${value}${block.slice(
    match.index + match[0].length,
  )}`;
}

function evidenceFieldContains(block, evidenceId) {
  return requireSingleField(block, "Evidence")[1].includes(`[${evidenceId}]`);
}

function reconciliationIdentityField(block) {
  const matches = [...block.matchAll(/^Reconciliation IDs: (.*)$/gm)];
  if (matches.length > 1) {
    throw new Error(
      "ledger item must contain at most one Reconciliation IDs field",
    );
  }
  return matches[0] || null;
}

function reconciliationIdentities(block) {
  const field = reconciliationIdentityField(block);
  if (!field || !field[1]) return [];
  const identities = field[1].split(", ").filter(Boolean);
  if (
    !identities.every((id) => /^evidence-v1:[0-9a-f]{64}$/.test(id)) ||
    new Set(identities).size !== identities.length
  ) {
    throw new Error("ledger Reconciliation IDs field is invalid");
  }
  return identities;
}

function reconciliationIdentityContains(block, evidenceId) {
  return reconciliationIdentities(block).includes(evidenceId);
}

function retainReconciliationIdentity(block, evidenceId) {
  const identities = reconciliationIdentities(block)
    .filter((id) => id !== evidenceId)
    .concat(evidenceId)
    .slice(-MAX_CONSUMED_EVIDENCE_IDS);
  const field = reconciliationIdentityField(block);
  if (field) {
    return replaceField(
      block,
      field,
      "Reconciliation IDs",
      identities.join(", "),
    );
  }
  const evidence = requireSingleField(block, "Evidence");
  const insertion = evidence.index + evidence[0].length;
  return `${block.slice(0, insertion)}\nReconciliation IDs: ${identities.join(
    ", ",
  )}${block.slice(insertion)}`;
}

export function validateRecurrenceCandidate(candidate) {
  const contextValues = hasExactKeys(candidate?.context, [
    "claimId",
    "issueId",
  ])
    ? [candidate.context.issueId, candidate.context.claimId]
    : [];
  const validContext =
    contextValues.length === 2 &&
    contextValues.every(
      (value) =>
        value === null ||
        (typeof value === "string" &&
          value.length > 0 &&
          value.length <= 160 &&
          !/[\r\n\0]/.test(value) &&
          !hasUnpairedSurrogate(value) &&
          redactRecurrenceText(value) === value),
    );
  const validText =
    typeof candidate?.symptom === "string" &&
    Array.from(candidate.symptom).length > 0 &&
    Array.from(candidate.symptom).length <= MAX_SYMPTOM_CHARACTERS &&
    !hasUnpairedSurrogate(candidate.symptom) &&
    redactRecurrenceText(candidate.symptom) === candidate.symptom &&
    typeof candidate?.ownershipBoundary === "string" &&
    candidate.ownershipBoundary.length > 0 &&
    candidate.ownershipBoundary.length <= MAX_SYMPTOM_CHARACTERS &&
    !hasUnpairedSurrogate(candidate.ownershipBoundary) &&
    redactRecurrenceText(candidate.ownershipBoundary) ===
      candidate.ownershipBoundary;
  const validLog =
    hasExactKeys(candidate?.log, ["end", "path", "start"]) &&
    LOG_PATH_PATTERN.test(candidate.log.path) &&
    Number.isSafeInteger(candidate.log.start) &&
    Number.isSafeInteger(candidate.log.end) &&
    candidate.log.start >= 0 &&
    candidate.log.end > candidate.log.start;
  if (
    !hasExactKeys(candidate, CANDIDATE_KEYS) ||
    candidate.version !== 1 ||
    !validText ||
    !PHASES.has(candidate.phase) ||
    !validLog ||
    !validContext ||
    !isCanonicalIsoTimestamp(candidate.observedAt) ||
    !isCanonicalIsoTimestamp(candidate.occurredAt) ||
    !["event", "observation-fallback"].includes(candidate.occurrenceSource) ||
    (candidate.occurrenceSource === "observation-fallback" &&
      candidate.occurredAt !== candidate.observedAt)
  ) {
    throw new Error("recurrence candidate is invalid");
  }
  const fingerprint = recurrenceFingerprint(candidate);
  const evidenceId = recurrenceEvidenceId({
    fingerprint,
    symptom: candidate.symptom,
    log: candidate.log,
  });
  if (
    candidate.fingerprint !== fingerprint ||
    candidate.evidenceId !== evidenceId
  ) {
    throw new Error("recurrence candidate identity is invalid");
  }
  return candidate;
}

export function reconcileLedgerBody(ledgerText, itemId, candidate) {
  if (typeof ledgerText !== "string") {
    throw new Error("ledger body must be text");
  }
  if (!/^churn-[a-z0-9][a-z0-9-]*$/.test(itemId || "")) {
    throw new Error("reconciliation requires an exact churn item ID");
  }
  validateRecurrenceCandidate(candidate);

  const headingPattern = new RegExp(
    `^## ${escapeRegularExpression(itemId)}(?:\\s+—[^\\n]*)?$`,
    "gm",
  );
  const headings = [...ledgerText.matchAll(headingPattern)];
  if (headings.length !== 1) {
    throw new Error(`ledger must contain exactly one ${itemId} item`);
  }
  const blockStart = headings[0].index;
  const nextHeading = ledgerText.indexOf("\n## ", blockStart + 1);
  const blockEnd = nextHeading === -1 ? ledgerText.length : nextHeading;
  let block = ledgerText.slice(blockStart, blockEnd);

  const classification = requireSingleField(block, "Classification");
  if (classification[1] !== "generic churn") {
    throw new Error("ledger reconciliation requires generic churn classification");
  }
  const alreadyReconciled =
    reconciliationIdentityContains(block, candidate.evidenceId) ||
    evidenceFieldContains(block, candidate.evidenceId);
  block = retainReconciliationIdentity(block, candidate.evidenceId);
  if (alreadyReconciled) {
    return `${ledgerText.slice(0, blockStart)}${block}${ledgerText.slice(
      blockEnd,
    )}`;
  }

  const count = requireSingleField(block, "Count");
  if (!/^[1-9]\d*$/.test(count[1])) {
    throw new Error("ledger Count must be a positive integer");
  }
  const lastSeen = requireSingleField(block, "Last seen");
  const lastSeenDate = new Date(lastSeen[1]);
  const candidateDate = new Date(candidate.occurredAt);
  if (
    Number.isNaN(lastSeenDate.getTime()) ||
    lastSeenDate.toISOString() !== lastSeen[1] ||
    Number.isNaN(candidateDate.getTime()) ||
    candidateDate.toISOString() !== candidate.occurredAt
  ) {
    throw new Error("ledger Last seen must be an ISO timestamp");
  }
  const lastSeenTime = lastSeenDate.getTime();
  const candidateTime = candidateDate.getTime();
  const evidence = requireSingleField(block, "Evidence");
  const evidenceReference = `${candidate.log.path} bytes ${candidate.log.start}-${candidate.log.end} [${candidate.evidenceId}]`;
  const evidenceReferences = evidence[1]
    .split("; ")
    .filter(Boolean)
    .concat(evidenceReference)
    .slice(-MAX_LEDGER_EVIDENCE_REFS);

  block = replaceField(
    block,
    count,
    "Count",
    String(Number.parseInt(count[1], 10) + 1),
  );
  const refreshedLastSeen = requireSingleField(block, "Last seen");
  block = replaceField(
    block,
    refreshedLastSeen,
    "Last seen",
    new Date(Math.max(lastSeenTime, candidateTime)).toISOString(),
  );
  const refreshedEvidence = requireSingleField(block, "Evidence");
  block = replaceField(
    block,
    refreshedEvidence,
    "Evidence",
    evidenceReferences.join("; "),
  );
  const status = requireSingleField(block, "Status");
  if (status[1] === "closed") {
    block = replaceField(block, status, "Status", "open");
  } else if (status[1] !== "open") {
    throw new Error("ledger Status must be open or closed");
  }

  return `${ledgerText.slice(0, blockStart)}${block}${ledgerText.slice(
    blockEnd,
  )}`;
}

let atomicWriteSequence = 0;

async function atomicReplace(filePath, body) {
  atomicWriteSequence += 1;
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${atomicWriteSequence}`;
  await writeFile(temporaryPath, body, { flag: "wx" });
  await rename(temporaryPath, filePath);
}

function selectedGenericLedgerBlock(ledgerText, itemId) {
  if (!/^churn-[a-z0-9][a-z0-9-]*$/.test(itemId || "")) {
    throw new Error("reconciliation requires an exact churn item ID");
  }
  const headingPattern = new RegExp(
    `^## ${escapeRegularExpression(itemId)}(?:\\s+—[^\\n]*)?$`,
    "gm",
  );
  const headings = [...ledgerText.matchAll(headingPattern)];
  if (headings.length !== 1) {
    throw new Error(`ledger must contain exactly one ${itemId} item`);
  }
  const start = headings[0].index;
  const nextHeading = ledgerText.indexOf("\n## ", start + 1);
  const end = nextHeading === -1 ? ledgerText.length : nextHeading;
  const block = ledgerText.slice(start, end);
  const classification = requireSingleField(block, "Classification");
  if (classification[1] !== "generic churn") {
    throw new Error("ledger reconciliation requires generic churn classification");
  }
  reconciliationIdentities(block);
  return block;
}

function retainLedgerIdentity(ledgerText, itemId, evidenceId) {
  const headingPattern = new RegExp(
    `^## ${escapeRegularExpression(itemId)}(?:\\s+—[^\\n]*)?$`,
    "gm",
  );
  const headings = [...ledgerText.matchAll(headingPattern)];
  if (headings.length !== 1) {
    throw new Error(`ledger must contain exactly one ${itemId} item`);
  }
  const start = headings[0].index;
  const nextHeading = ledgerText.indexOf("\n## ", start + 1);
  const end = nextHeading === -1 ? ledgerText.length : nextHeading;
  const block = retainReconciliationIdentity(
    ledgerText.slice(start, end),
    evidenceId,
  );
  return `${ledgerText.slice(0, start)}${block}${ledgerText.slice(end)}`;
}

export function validateRecurrenceCursor(cursor) {
  const validLogs =
    cursor?.logs !== null &&
    typeof cursor?.logs === "object" &&
    !Array.isArray(cursor.logs) &&
    Object.entries(cursor.logs).every(([logPath, state]) => {
      const validCarry =
        typeof state?.eventCarry === "string" &&
        Array.from(state.eventCarry).length <= 1024 &&
        !hasUnpairedSurrogate(state.eventCarry) &&
        redactRecurrenceText(state.eventCarry) === state.eventCarry;
      return (
        LOG_PATH_PATTERN.test(logPath) &&
        hasExactKeys(state, LOG_CURSOR_KEYS) &&
        Number.isSafeInteger(state.offset) &&
        state.offset >= 0 &&
        validCarry &&
        (state.eventCarryStartOffset === null ||
          (Number.isSafeInteger(state.eventCarryStartOffset) &&
            state.eventCarryStartOffset >= 0)) &&
        typeof state.inode === "string" &&
        state.inode.length > 0 &&
        state.inode.length <= 80 &&
        Number.isFinite(state.mtimeMs) &&
        state.mtimeMs >= 0
      );
    });
  const recurrence = cursor?.recurrence;
  const validRecurrence =
    hasExactKeys(recurrence, ["consumedEvidenceIds", "pendingCandidates"]) &&
    Array.isArray(recurrence.pendingCandidates) &&
    Array.isArray(recurrence.consumedEvidenceIds);
  if (
    !hasExactKeys(cursor, CURSOR_KEYS) ||
    cursor.version !== 2 ||
    typeof cursor.repoRoot !== "string" ||
    !cursor.repoRoot.startsWith("/") ||
    typeof cursor.scope !== "string" ||
    !cursor.scope ||
    cursor.scope.split("/").some((part) => !part || part === "." || part === "..") ||
    !isCanonicalIsoTimestamp(cursor.updatedAt) ||
    !validLogs ||
    !validRecurrence
  ) {
    throw new Error("recurrence cursor is invalid");
  }
  try {
    for (const candidate of recurrence.pendingCandidates) {
      validateRecurrenceCandidate(candidate);
    }
  } catch {
    throw new Error("recurrence cursor candidate is invalid");
  }
  const pendingIds = recurrence.pendingCandidates.map(
    (candidate) => candidate.evidenceId,
  );
  const consumedIds = recurrence.consumedEvidenceIds;
  if (
    new Set(pendingIds).size !== pendingIds.length ||
    !consumedIds.every((id) => /^evidence-v1:[0-9a-f]{64}$/.test(id)) ||
    new Set(consumedIds).size !== consumedIds.length ||
    pendingIds.some((id) => consumedIds.includes(id))
  ) {
    throw new Error("recurrence cursor evidence history is invalid");
  }
  return cursor;
}

export async function persistReconciliation(options) {
  const {
    ledgerPath,
    statePath,
    itemId,
    evidenceId,
    afterLedgerRename,
  } = options || {};
  if (
    typeof ledgerPath !== "string" ||
    typeof statePath !== "string" ||
    !/^evidence-v1:[0-9a-f]{64}$/.test(evidenceId || "")
  ) {
    throw new Error("reconciliation persistence options are invalid");
  }

  const [ledgerText, cursorText] = await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(statePath, "utf8"),
  ]);
  const cursor = JSON.parse(cursorText);
  validateRecurrenceCursor(cursor);
  const selectedBlock = selectedGenericLedgerBlock(ledgerText, itemId);
  const pending = cursor.recurrence.pendingCandidates.filter(
    (candidate) => candidate.evidenceId === evidenceId,
  );
  if (pending.length > 1) {
    throw new Error("recurrence cursor contains duplicate pending evidence");
  }
  const candidate = pending[0] || null;
  if (candidate) validateRecurrenceCandidate(candidate);
  const ledgerHasDurableIdentity = reconciliationIdentityContains(
    selectedBlock,
    evidenceId,
  );
  const ledgerHasDisplayEvidence = evidenceFieldContains(
    selectedBlock,
    evidenceId,
  );
  const ledgerHasEvidence =
    ledgerHasDurableIdentity || ledgerHasDisplayEvidence;
  const cursorHasConsumed =
    cursor.recurrence.consumedEvidenceIds.includes(evidenceId);

  if (cursorHasConsumed && !ledgerHasEvidence) {
    throw new Error(
      "recurrence invariant failed: cursor consumed evidence is absent from ledger",
    );
  }
  if (!ledgerHasEvidence && !candidate) {
    throw new Error("requested evidence is not pending in the recurrence cursor");
  }

  let status = "already-reconciled";
  if (!ledgerHasEvidence) {
    const reconciledLedger = reconcileLedgerBody(ledgerText, itemId, candidate);
    await atomicReplace(ledgerPath, reconciledLedger);
    if (afterLedgerRename) await afterLedgerRename();
    status = "reconciled";
  } else if (!ledgerHasDurableIdentity) {
    const migratedLedger = retainLedgerIdentity(
      ledgerText,
      itemId,
      evidenceId,
    );
    await atomicReplace(ledgerPath, migratedLedger);
    if (afterLedgerRename) await afterLedgerRename();
  }

  const consumedEvidenceIds = cursor.recurrence.consumedEvidenceIds.includes(
    evidenceId,
  )
    ? cursor.recurrence.consumedEvidenceIds
    : cursor.recurrence.consumedEvidenceIds
        .concat(evidenceId)
        .slice(-MAX_CONSUMED_EVIDENCE_IDS);
  const nextCursor = {
    ...cursor,
    updatedAt: candidate?.observedAt || cursor.updatedAt,
    recurrence: {
      pendingCandidates: cursor.recurrence.pendingCandidates
        .filter((storedCandidate) => storedCandidate.evidenceId !== evidenceId)
        .slice(-MAX_PENDING_CANDIDATES),
      consumedEvidenceIds,
    },
  };
  await atomicReplace(statePath, `${JSON.stringify(nextCursor, null, 2)}\n`);
  return { status, evidenceId, itemId };
}
