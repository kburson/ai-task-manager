// Word counter — extracted from tally-chat-words.mjs for reuse.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

import { detectProvider, getProvider, listProviders } from '../providers/index.mjs';
import { resolveTranscriptPath } from '../providers/transcript-resolver.mjs';
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

// Recursively collect every string leaf of a tool-call `input` object so the
// full-expansion tier counts the words a reader sees when the tool card is
// expanded. Joining the leaves with spaces (rather than `JSON.stringify`)
// avoids gluing tokens to punctuation, which would count too few.
function collectStringLeaves(value, out) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStringLeaves(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStringLeaves(v, out);
  }
}

// Derive the one-line tool-summary chip shown above a collapsed tool card.
// Bash surfaces its `description` (fallback "Ran command"); every other tool
// surfaces its name plus the first present of the common target args.
function toolChip(block) {
  const name = block.name || '';
  const input = block.input || {};
  if (name === 'Bash') return input.description || 'Ran command';
  const arg = input.file_path ?? input.path ?? input.pattern ?? input.query ?? input.url ?? '';
  return `${name} ${arg}`.trim();
}

// Extract the human-visible text of a `tool_result` block. Results are either a
// bare string or an array of sub-blocks; only `text` sub-blocks are on-screen.
function toolResultText(block) {
  const c = block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .filter((sb) => sb?.type === 'text' && typeof sb.text === 'string')
      .map((sb) => sb.text)
      .join(' ');
  }
  return '';
}

// Three-tier word count from `fromLine`:
//   Tier 1  — monologue + user prose (`text` blocks + string content).
//   Tier 2  — stay-abreast = Tier 1 + tool-summary chips.  Returned as `count`
//             so every existing caller/column reads stay-abreast unchanged.
//   Tier 3  — full-expansion = stay-abreast + full tool_use inputs + full
//             tool_result outputs (injection filter applied to results).
//             Returned as `fullExpansion`.
export function countWords(filePath, fromLine = 0) {
  if (!existsSync(filePath)) return { count: 0, totalLines: 0, fullExpansion: 0 };
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let tier1 = 0;
  let chipWords = 0;
  let toolInputWords = 0;
  let toolResultWords = 0;
  for (let i = fromLine; i < lines.length; i++) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (obj.type !== 'user' && obj.type !== 'assistant') continue;
    // Skip meta/sidechain entries — hook injections, etc. Excluded from every tier.
    if (obj.isMeta || obj.isSidechain) continue;
    const content = obj.message?.content;
    if (!content) continue;
    if (typeof content === 'string') {
      if (isInjection(content)) continue;
      tier1 += wordCount(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') {
          if (isInjection(block.text)) continue;
          tier1 += wordCount(block.text);
        } else if (block.type === 'tool_use') {
          // Chip → stay-abreast; full input leaves → full-expansion only.
          chipWords += wordCount(toolChip(block));
          const leaves = [];
          collectStringLeaves(block.input, leaves);
          if (leaves.length) toolInputWords += wordCount(leaves.join(' '));
        } else if (block.type === 'tool_result') {
          const text = toolResultText(block);
          if (isInjection(text)) continue;
          toolResultWords += wordCount(text);
        }
      }
    }
  }
  const count = tier1 + chipWords;
  const fullExpansion = count + toolInputWords + toolResultWords;
  return { count, totalLines: lines.length, fullExpansion };
}
