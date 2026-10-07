import { assertRevisionStageHostEffect } from './lib/criteria-revision/transport-quarantine.mjs';
// Word counter — extracted from tally-chat-words.mjs for reuse.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { resolveRuntimeRoot } from './lib/runtime-storage.mjs';
import { homedir } from 'node:os';

import { detectProvider, getProvider, listProviders } from '../providers/index.mjs';
import { resolveTranscriptPath } from '../providers/transcript-resolver.mjs';
import {
  collectTranscriptStringLeaves,
  normalizeTranscriptRecord,
} from '../providers/transcript-normalizer.mjs';
import { scanJsonlRecordsWithSource } from './lib/jsonl-line-scanner.mjs';
import { resolveSessionId } from './lib/session-id.mjs';
import { timingActorKey } from './lib/timing-actor.mjs';
import { withLock } from './fleet-registry.mjs';

export function projectKey(dir = projectDir()) {
  // Flatten path separators (POSIX `/`, Windows `\`) and the Windows drive colon.
  return dir.replace(/[\\/:]/g, '-');
}

export function projectDir() {
  return resolveRuntimeRoot().projectRoot;
}

export function aiAppName() {
  // Explicit override wins; otherwise delegate to the provider registry.
  const explicit = process.env.AI_TASK_MANAGER_APP_NAME?.trim().toLowerCase();
  if (explicit && listProviders().includes(explicit)) return explicit;
  return detectProvider({ env: process.env }).name;
}

export function appStateDir() {
  // Provider-specific AITM state dir (registry-driven).
  return path.join(projectDir(), getProvider(aiAppName()).stateDir);
}

export function transcriptDir() {
  if (process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR) return process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR;
  const local = path.join(appStateDir(), 'session-transcripts');
  if (existsSync(local)) return local;
  // Fall back to the provider's native per-project transcript directory when
  // the local session-transcripts directory hasn't been created (e.g.
  // pre-existing install). Only providers that declare a `transcriptLocator`
  // expose a homedir-rooted fallback.
  const locator = getProvider(aiAppName()).transcriptLocator;
  if (locator) {
    const nativeDir = path.join(homedir(), locator, projectKey());
    if (existsSync(nativeDir)) return nativeDir;
  }
  return local;
}

export function markerDir() {
  return path.join(appStateDir(), 'session-tracking');
}

export function jsonlPath(sid) {
  const adapter = getProvider(aiAppName());
  const flat = path.join(transcriptDir(), `${sid}.jsonl`);
  if (adapter.sessionIdFallback === 'legacy' && existsSync(flat)) return flat;
  if (adapter.transcriptLayout !== 'flat') {
    const resolved = resolveTranscriptPath({
      adapter,
      sid,
      homedir: homedir(),
      projectKey: projectKey(),
      cwd: projectDir(),
      env: process.env,
    });
    return resolved || '';
  }
  // The flat path (env override → local session-transcripts → Claude's homedir
  // fallback) is the historical resolution and stays authoritative when it
  // points at a real file. This preserves Claude behavior byte-for-byte.
  if (existsSync(flat)) return flat;
  // #477 — providers whose transcripts are not flat-addressable (Codex's
  // date-bucketed `rollout-<ts>-<sid>.jsonl`) resolve through the adapter's
  // declarative `transcriptLayout` descriptor. Dispatch lives in the resolver,
  // not here, so the recording path carries no per-provider branching.
  // Flat layouts (Claude) are deterministic without the file — return the
  // computed path even when it does not exist yet; the transcript appears here
  // later in the session. This preserves #476 behavior byte-for-byte.
  return flat;
}

export function markerPathFor(sid, owningRoot = projectDir()) {
  return markerPathForActor({ provider: aiAppName(), sid }, owningRoot);
}
// Native path DATA shared with original-record validation; no file is accessed.
export function markerPathForActor(identity, owningRoot) {
  return path.join(owningRoot, getProvider(identity.provider).stateDir, 'session-tracking', `${identity.sid}.json`);
}

export function ensureSessionTracking(sid) {
  const trackingPath = markerPathFor(sid);
  const identity = cursorIdentity();
  if (sid !== identity.sid) invalidCursor();
  return withLock(trackingPath, () => {
    const existing = readCursor(trackingPath, identity);
    if (existing) return existing;
    const record = {
      schema: 'aitm.word-cursor/v1',
      actor: timingActorKey(identity),
      ...identity,
      sessionId: sid,
      startedAt: new Date().toISOString(),
      wordCount: { line: 0, words: 0, wordsFull: 0, task: null, ts: null },
    };
    validateWordCursor(record, identity);
    mkdirSync(path.dirname(trackingPath), { recursive: true });
    const temporary = trackingPath + '.tmp.' + process.pid;
    writeFileSync(temporary, JSON.stringify(record, null, 2) + String.fromCharCode(10), 'utf8');
    renameSync(temporary, trackingPath);
    return record;
  });
}

export function currentSessionId() {
  // #273 — delegate to the lone resolver in lib/session-id.mjs so that
  // state.mjs (writer) and this module (reader) agree on which sid represents
  // "this session". Falls back to `'default-session'` rather than null so
  // bind paths always have a stable directory to land at.
  return resolveSessionId({ env: process.env, transcriptDir });
}

function cursorIdentity() {
  return { provider: aiAppName(), sid: currentSessionId() };
}
function invalidCursor() {
  const error = new Error('Word cursor is malformed, unsupported, or belongs to another actor');
  error.code = 'WORD_CURSOR_INVALID';
  throw error;
}
export function validateWordCursor(record, identity) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) invalidCursor();
  if (record.schema !== undefined) {
    if (
      record.schema !== 'aitm.word-cursor/v1' ||
      record.provider !== identity.provider ||
      record.sid !== identity.sid ||
      record.actor !== timingActorKey(identity)
    )
      invalidCursor();
  }
  if (record.sessionId !== undefined && record.sessionId !== identity.sid) invalidCursor();
  if (!record.wordCount || typeof record.wordCount !== 'object' || Array.isArray(record.wordCount))
    invalidCursor();
  const merged = { line: 0, words: 0, task: null, ...record.wordCount };
  if (merged.wordsFull == null) merged.wordsFull = merged.words;
  for (const key of ['line', 'words', 'wordsFull']) {
    if (!Number.isSafeInteger(merged[key]) || merged[key] < 0) invalidCursor();
  }
  if (merged.wordsFull < merged.words) invalidCursor();
  if (merged.task !== null && typeof merged.task !== 'string' && !Number.isSafeInteger(merged.task))
    invalidCursor();
  if (
    merged.ts != null &&
    (typeof merged.ts !== 'string' || !Number.isFinite(Date.parse(merged.ts)))
  )
    invalidCursor();
  return merged;
}
function readCursor(markerPath, identity) {
  if (!existsSync(markerPath)) return null;
  let record;
  try {
    record = JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    invalidCursor();
  }
  validateWordCursor(record, identity);
  return record;
}
export function loadMarker(markerPath, { identity = cursorIdentity() } = {}) {
  if (!existsSync(markerPath)) return { line: 0, words: 0, wordsFull: 0, task: null };
  try {
    const { wordCount } = readCursor(markerPath, identity);
    const merged = { line: 0, words: 0, task: null, ...wordCount };
    // Legacy markers persisted before the full-expansion tier lack `wordsFull`.
    // Default it to the loaded `words` so the cumulative full snapshot never
    // reads back as NaN/undefined and the `wordsFull >= words` invariant holds.
    if (merged.wordsFull == null) merged.wordsFull = merged.words;
    return merged;
  } catch {
    invalidCursor();
  }
}

// ONE native merge/validation core. Its historical caller only compares
// existing record bytes; it cannot return a backdated record or grant a write.
function markerRecord(existing, identity, line, words, task, wordsFull, ts) {
  const record = {
    ...existing,
    schema: 'aitm.word-cursor/v1',
    actor: timingActorKey(identity),
    ...identity,
    wordCount: { ...existing.wordCount, line, words, wordsFull, task, ts },
  };
  validateWordCursor(record, identity);
  return record;
}
export function assertRecordedStageActorCursor(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Object.keys(input).sort().join(',') !== 'afterBytes,beforeBytes,identity,line,task,ts,words,wordsFull') invalidCursor();
  const { beforeBytes, afterBytes, identity, line, words, task, wordsFull, ts } = input;
  if (!identity || Object.keys(identity).sort().join(',') !== 'provider,sid' ||
      typeof beforeBytes !== 'string' && beforeBytes !== null || typeof afterBytes !== 'string' ||
      typeof ts !== 'string' || !Number.isFinite(Date.parse(ts))) invalidCursor();
  const existing = beforeBytes === null ? {} : JSON.parse(beforeBytes);
  if (beforeBytes !== null) validateWordCursor(existing, identity);
  const record = markerRecord(existing, identity, line, words, task, wordsFull, ts);
  if (JSON.stringify(record, null, 2) + '\n' !== afterBytes) invalidCursor();
}

const nativeStageCursorWrites = new WeakMap();
export function assertNativeStageCursorWrite(invocation, intent) {
  const original = nativeStageCursorWrites.get(invocation);
  if (!original || JSON.stringify(original) !== JSON.stringify(intent)) invalidCursor();
}
// Only the original runtime commit's opaque invocation can select the fixed
// memory path. Native host saveMarker below remains synchronous and unchanged.
export async function saveNativeStageActorMarker(invocation) {
  const native = await import('./lib/move-state/move-state-core.mjs');
  const source = await native.beginNativeStageActorCursor(invocation);
  try {
    const existing = source.beforeBytes === null ? {} : JSON.parse(source.beforeBytes);
    if (source.beforeBytes !== null) validateWordCursor(existing, source.identity);
    const ts = new Date().toISOString();
    const record = markerRecord(existing, source.identity, source.line, source.words, source.task, source.wordsFull, ts);
    const intent = { file: source.file, line: source.line, words: source.words, wordsFull: source.wordsFull,
      task: source.task, ts, bytes: JSON.stringify(record, null, 2) + '\n' };
    nativeStageCursorWrites.set(invocation, intent);
    await native.persistNativeStageActorCursor(invocation, intent);
    await native.writeNativeStageActorCursor(invocation);
    await native.completeNativeStageActorCursor(invocation);
  } finally {
    nativeStageCursorWrites.delete(invocation);
    native.endNativeStageActorCursor(invocation);
  }
}

export function saveMarker(
  markerPath,
  line,
  words,
  task = null,
  wordsFull = words,
  { identity = cursorIdentity() } = {}
) {
  assertRevisionStageHostEffect();
  return withLock(markerPath, () => {
    const existing = readCursor(markerPath, identity) ?? {};
    const record = markerRecord(existing, identity, line, words, task, wordsFull, new Date().toISOString());
    mkdirSync(path.dirname(markerPath), { recursive: true });
    const temporary = markerPath + '.tmp.' + process.pid;
    writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', 'utf8');
    renameSync(temporary, markerPath);
  });
}

// #1142 — compaction is a transcript cursor boundary, not a word-count reset.
// Advance only the consumed line index while carrying both absolute markers.
export function advanceMarkerCursor(markerPath, line, task = undefined, options = {}) {
  const marker = loadMarker(markerPath, options);
  saveMarker(
    markerPath,
    line,
    marker.words,
    task === undefined ? marker.task : task,
    marker.wordsFull,
    options
  );
  return loadMarker(markerPath, options);
}

// Prefixes/markers that indicate injected (non-reader-visible) text.
// These arrive as user-typed content in the JSONL but are never rendered in
// the chat window — they're system-reminders, slash-command scaffolding,
// skill bodies, local command stdout, etc. Counting them inflates the
// "reader effort" measurement.
const INJECTION_PREFIXES = [
  '<system-reminder>',
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  '<user-memory>',
  '<bash-input>',
  '<bash-stdout>',
  '<bash-stderr>',
  'Caveat: The messages below were generated by the user while running local commands',
  'Base directory for this skill:',
  'This session is being continued from a previous conversation',
  '<recommended_plugins>',
  '# AGENTS.md instructions',
  '<environment_context>',
];

export function isInjection(text) {
  if (typeof text !== 'string') return false;
  const t = text.trimStart();
  if (!t) return true; // empty strings don't count as reader effort
  for (const p of INJECTION_PREFIXES) {
    if (t.startsWith(p)) return true;
  }
  return false;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const emittedDiagnostics = new Set();

function emitDiagnosticOnce({ code, sid, filePath, onDiagnostic }) {
  const key = `${code}:${sid || ''}:${filePath || ''}`;
  if (emittedDiagnostics.has(key)) return;
  emittedDiagnostics.add(key);
  const sink = onDiagnostic || ((line) => console.error(line));
  sink(`⚠ [aitm:word-measurement] ${code} sid=${sid || ''}`);
}

function countResult({ count = 0, totalLines = 0, fullExpansion = 0, code = null } = {}) {
  return {
    count,
    totalLines,
    fullExpansion,
    status: code ? 'unavailable' : 'ok',
    diagnosticCode: code,
  };
}

function unavailableCodexResult(code, { sid, filePath, onDiagnostic }) {
  emitDiagnosticOnce({ code, sid, filePath, onDiagnostic });
  return countResult({ code });
}

const wordCountSources = new WeakMap();

// Passive original-result data only. A matching copy is not a native read.
export function readWordCountSourceData(result) {
  return wordCountSources.get(result) ?? null;
}

// Three-tier word count from `fromLine`:
//   Tier 1  — monologue + user prose (`text` blocks + string content).
//   Tier 2  — stay-abreast = Tier 1 + tool-summary chips.  Returned as `count`
//             so every existing caller/column reads stay-abreast unchanged.
//   Tier 3  — full-expansion = stay-abreast + full tool_use inputs + full
//             tool_result outputs (injection filter applied to results).
//             Returned as `fullExpansion`.
export function countWords(filePath, fromLine = 0, options = {}) {
  const { provider = null, sid = null, onDiagnostic } = options;
  if (provider === 'codex' && (!sid || sid === 'default-session')) {
    return unavailableCodexResult('codex-session-unresolved', {
      sid,
      filePath,
      onDiagnostic,
    });
  }
  if (!filePath || !existsSync(filePath)) {
    if (provider === 'codex') {
      return unavailableCodexResult('codex-transcript-unresolved', {
        sid,
        filePath,
        onDiagnostic,
      });
    }
    return countResult();
  }
  let tier1 = 0;
  let chipWords = 0;
  let toolInputWords = 0;
  let toolResultWords = 0;
  let codexSchemaRecognized = false;
  const source = scanJsonlRecordsWithSource(filePath, {
    onRecord(obj, i) {
      const normalized = normalizeTranscriptRecord(obj);
      if (normalized.schema === 'codex-rollout-v1' && normalized.recognized) {
        codexSchemaRecognized = true;
      }
      if (i < fromLine) return;
      const { events } = normalized;
      for (const event of events) {
        if (event.kind === 'text') {
          if (isInjection(event.text)) continue;
          tier1 += wordCount(event.text);
        } else if (event.kind === 'tool-call') {
          chipWords += wordCount(event.chip);
          const leaves = collectTranscriptStringLeaves(event.input);
          if (leaves.length) toolInputWords += wordCount(leaves.join(' '));
        } else if (event.kind === 'tool-result') {
          if (isInjection(event.text)) continue;
          toolResultWords += wordCount(event.text);
        }
      }
    },
  });
  const count = tier1 + chipWords;
  const fullExpansion = count + toolInputWords + toolResultWords;
  if (provider === 'codex' && !codexSchemaRecognized) {
    return unavailableCodexResult('codex-schema-unrecognized', {
      sid,
      filePath,
      onDiagnostic,
    });
  }
  const result = countResult({ count, totalLines: source.totalLines, fullExpansion });
  // Preserve ordinary permissive counting inputs. Only closed scalar source
  // facts are eligible for passive capture; unavailable/throwing reads above
  // never acquire a record, and this record grants no execution authority.
  if (typeof filePath === 'string' && Number.isSafeInteger(fromLine) && fromLine >= 0 &&
      (provider === null || typeof provider === 'string') && (sid === null || typeof sid === 'string')) {
    wordCountSources.set(result, Object.freeze({ path: filePath, provider, sid, fromLine,
      byteLength: source.byteLength, sha256: source.sha256, totalLines: source.totalLines,
      status: result.status, count, fullExpansion }));
  }
  return result;
}
