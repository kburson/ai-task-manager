// Append-only session-reference marker subsystem (#476).
//
// Each story records which Claude Code session(s) worked it and where each
// session's JSONL transcript lives, as an append-only chain of hidden markers:
//
//   <!-- aitm-session-ref sid="<id>" jsonl="<abs path>" ts="<iso>" -->
//
// History — not a single mutable value. We do not expect sid/jsonl to change
// during one story, so on every verb/event the comparison is normally a cheap
// no-op sanity check. When either DOES change (a new session, or a switch to a
// different transcript file), a NEW timestamped entry is appended; prior entries
// are never modified or removed. The last entry is the currently-active
// reference; the `ts` of each entry is when that reference became active, so the
// gap between two adjacent entries' timestamps brackets a session changeover.
//
// Pure module: no I/O, no issue-body fetch. The verb event path
// (`runtime.mjs → flushActiveToGH`) supplies the live { sid, jsonlPath, ts }
// and routes the result through `mutateIssueBody`.

import { serializeMarker, parseMarker } from './marker-grammar.mjs';

// Presence/parse pattern for a session-ref marker line. Mirrored in
// `body-invariants.mjs` and `gh-edit-guard.mjs` so the family is protected.
export const SESSION_REF_RE = /<!--\s*aitm-session-ref\s+sid="/i;

// Serialize one entry. The transcript path is stored under the `jsonl`
// attribute; attribute order is sid, jsonl, ts.
export function serializeSessionRefMarker({ sid, jsonlPath, ts, operationId } = {}) {
  if (!sid) throw new Error('serializeSessionRefMarker: sid is required');
  if (!ts) throw new Error('serializeSessionRefMarker: ts is required');
  return serializeMarker('session-ref', {
    sid,
    jsonl: jsonlPath || '',
    ts,
    ...(operationId ? { op: operationId } : {}),
  });
}

// Parse all session-ref entries in document order. Returns
// [{ sid, jsonlPath, ts }]. Non-session-ref / malformed lines are ignored.
export function parseSessionRefs(body) {
  const src = String(body || '');
  const out = [];
  for (const line of src.split('\n')) {
    if (!SESSION_REF_RE.test(line)) continue;
    const parsed = parseMarker(line.trim());
    if (!parsed || parsed.name !== 'session-ref') continue;
    out.push({
      sid: parsed.props.sid || '',
      jsonlPath: parsed.props.jsonl || '',
      ts: parsed.props.ts || '',
      ...(parsed.props.op ? { operationId: parsed.props.op } : {}),
    });
  }
  return out;
}

// The currently-active reference: the LAST recorded entry, or null when none.
export function mostRecentSessionRef(body) {
  const all = parseSessionRefs(body);
  return all.length ? all[all.length - 1] : null;
}

// A governed operation is an immutable receipt, not the currently-active
// session owner. Search the complete append-only history so a retry remains a
// no-op even when another session reference was appended in the meantime.
export function sessionRefForOperation(body, operationId) {
  if (!operationId) return null;
  const matches = parseSessionRefs(body).filter((entry) => entry.operationId === operationId);
  if (matches.length > 1) {
    throw new Error('session reference operation receipt is duplicated');
  }
  return matches[0] ?? null;
}

// Insert a new entry's marker line. Append-only: places the marker immediately
// before the `<!-- aitm-fields:` trailer (the other progress markers'
// neighborhood), falling back to end-of-body when no trailer exists. Pure.
export function appendSessionRef(body, { sid, jsonlPath, ts, operationId } = {}) {
  const src = String(body || '');
  const marker = serializeSessionRefMarker({ sid, jsonlPath, ts, operationId });
  const fieldsRe = /^[^\n]*<!--\s*aitm-fields:/m;
  const m = fieldsRe.exec(src);
  if (m) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    return `${src.slice(0, lineStart)}${marker}\n\n${src.slice(lineStart)}`;
  }
  const sep = src.endsWith('\n') ? '' : '\n';
  return `${src}${sep}${marker}\n`;
}

// Compare the live { sid, jsonlPath } against the most-recent recorded entry
// and append a new timestamped entry only on change. Returns { body, appended }.
//
//   - Falsy sid (remote/iOS): clean skip — body unchanged, no placeholder (AC5).
//   - No prior entry: append the initial entry (AC1).
//   - sid AND jsonlPath both match most-recent: no-op (AC2).
//   - sid OR jsonlPath differs: append a new entry; prior entries preserved (AC3).
export function recordSessionRefOnChange(body, { sid, jsonlPath, ts, operationId } = {}) {
  const src = String(body || '');
  if (!sid) return { body: src, appended: false };
  if (operationId) {
    const receipt = sessionRefForOperation(src, operationId);
    if (receipt) {
      if (receipt.sid !== sid || receipt.jsonlPath !== (jsonlPath || '') || receipt.ts !== ts) {
        throw new Error('session reference operation receipt does not match');
      }
      return { body: src, appended: false };
    }
    return {
      body: appendSessionRef(src, { sid, jsonlPath, ts, operationId }),
      appended: true,
    };
  }
  const recent = mostRecentSessionRef(src);
  if (recent && recent.sid === sid && recent.jsonlPath === (jsonlPath || '')) {
    return { body: src, appended: false };
  }
  return {
    body: appendSessionRef(src, { sid, jsonlPath, ts, operationId }),
    appended: true,
  };
}
