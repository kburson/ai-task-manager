// Word counter — extracted from tally-chat-words.mjs for reuse.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

import { detectProvider, getProvider, listProviders } from '../providers/index.mjs';
import { resolveTranscriptPath } from '../providers/transcript-resolver.mjs';
import {
  collectTranscriptStringLeaves,
  normalizeTranscriptRecord,
} from '../providers/transcript-normalizer.mjs';
import { scanJsonlRecords } from './lib/jsonl-line-scanner.mjs';
import { resolveSessionId } from './lib/session-id.mjs';

export function projectKey() {
  const dir = projectDir();
  // Flatten path separators (POSIX `/`, Windows `\`) and the Windows drive colon.
  return dir.replace(/[\\/:]/g, '-');
}

export function projectDir() {
  return process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
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
  // The flat path (env override → local session-transcripts → Claude's homedir
  // fallback) is the historical resolution and stays authoritative when it
  // points at a real file. This preserves Claude behavior byte-for-byte.
  const flat = path.join(transcriptDir(), `${sid}.jsonl`);
  if (existsSync(flat)) return flat;
  // #477 — providers whose transcripts are not flat-addressable (Codex's
  // date-bucketed `rollout-<ts>-<sid>.jsonl`) resolve through the adapter's
  // declarative `transcriptLayout` descriptor. Dispatch lives in the resolver,
  // not here, so the recording path carries no per-provider branching.
  const adapter = getProvider(aiAppName());
  if (adapter.transcriptLayout === 'date-bucketed') {
    const resolved = resolveTranscriptPath({
      adapter,
      sid,
      homedir: homedir(),
      projectKey: projectKey(),
    });
    // Date-bucketed paths are only knowable from an on-disk file (the rollout
    // filename carries an unpredictable timestamp prefix). When none exists,
    // return '' so the caller records a sid-only session-ref rather than a
    // deterministic-but-wrong placeholder path (#477 AC5). `countWords('')`
    // short-circuits to zero, so the word-count path is unaffected.
    return resolved || '';
  }
  // Flat layouts (Claude) are deterministic without the file — return the
  // computed path even when it does not exist yet; the transcript appears here
  // later in the session. This preserves #476 behavior byte-for-byte.
  return flat;
}

export function markerPathFor(sid) {
  return path.join(markerDir(), `${sid}.json`);
}

export function ensureSessionTracking(sid) {
  const trackingPath = markerPathFor(sid);
  if (existsSync(trackingPath)) return;
  mkdirSync(path.dirname(trackingPath), { recursive: true });
  writeFileSync(
    trackingPath,
    JSON.stringify(
      {
        sessionId: sid,
        startedAt: new Date().toISOString(),
        wordCount: { line: 0, words: 0, wordsFull: 0, task: null, ts: null },
      },
      null,
      2
    ),
    'utf8'
  );
}

export function currentSessionId() {
  // #273 — delegate to the lone resolver in lib/session-id.mjs so that
  // state.mjs (writer) and this module (reader) agree on which sid represents
  // "this session". Falls back to `'default-session'` rather than null so
  // bind paths always have a stable directory to land at.
  return resolveSessionId({ env: process.env, transcriptDir });
}

export function loadMarker(markerPath) {
  if (!existsSync(markerPath)) return { line: 0, words: 0, wordsFull: 0, task: null };
  try {
    const { wordCount = {} } = JSON.parse(readFileSync(markerPath, 'utf8'));
    const merged = { line: 0, words: 0, task: null, ...wordCount };
    // Legacy markers persisted before the full-expansion tier lack `wordsFull`.
    // Default it to the loaded `words` so the cumulative full snapshot never
    // reads back as NaN/undefined and the `wordsFull >= words` invariant holds.
    if (merged.wordsFull == null) merged.wordsFull = merged.words;
    return merged;
  } catch {
    return { line: 0, words: 0, wordsFull: 0, task: null };
  }
}

export function saveMarker(markerPath, line, words, task = null, wordsFull = words) {
  mkdirSync(path.dirname(markerPath), { recursive: true });
  let existing = {};
  try {
    if (existsSync(markerPath)) existing = JSON.parse(readFileSync(markerPath, 'utf8'));
  } catch {
    /* best-effort: optional read; fall back to default on parse/IO error */
  }
  writeFileSync(
    markerPath,
    JSON.stringify(
      { ...existing, wordCount: { line, words, wordsFull, task, ts: new Date().toISOString() } },
      null,
      2
    ),
    'utf8'
  );
}

// #1142 — compaction is a transcript cursor boundary, not a word-count reset.
// Advance only the consumed line index while carrying both absolute markers.
export function advanceMarkerCursor(markerPath, line, task = undefined) {
  const marker = loadMarker(markerPath);
  saveMarker(
    markerPath,
    line,
    marker.words,
    task === undefined ? marker.task : task,
    marker.wordsFull
  );
  return loadMarker(markerPath);
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
  const totalLines = scanJsonlRecords(filePath, {
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
  return countResult({ count, totalLines, fullExpansion });
}
