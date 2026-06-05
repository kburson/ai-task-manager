// #294 — `stampDeepDive` closes the last gap left after #297 + #300:
// nothing in the codebase writes the `aitm-deep-dive-posted` marker that
// `planDeepDiveGate` (lib/deep-dive-gate.mjs) reads. Agents have been
// hand-authoring both the marker and the appendix into issue bodies, which
// races with concurrent state-machine writes and frequently mis-anchors the
// marker.
//
// This helper performs ONE transactional body write via `mutateIssueBody`:
//
//   1. Injects `<!-- aitm-deep-dive-posted: <iso-ts> -->` immediately above
//      the appendix.
//   2. Appends `## Deep-Dive Analysis (<yyyy-mm-dd>)` plus the caller's
//      `appendix` prose.
//   3. Places the block AFTER the `## Pickup Directive` heading + its
//      trailing `---` separator (per the `feedback_deep_dive_placement.md`
//      memory). Falls back to before the `aitm-fields` JSON trailer when
//      the directive heading is absent.
//
// Idempotent: if the body already carries the posted marker, returns
// `{ status: 'no-op' }` (via the underlying `versionedWriteBody`
// short-circuit on `base === next`). Re-invocation with the same `ts` and
// same appendix is byte-identical.
//
// The completion marker (`aitm-deep-dive-complete`) is still owned by
// `/task check "Deep dive complete"` — this helper only writes the posted
// marker and the section.

import { mutateIssueBody } from './issue-body-mutate.mjs';

const POSTED_RE = /<!--\s*aitm-deep-dive-posted:\s*[^>]*?-->/i;
const PICKUP_HEADING_RE = /^##\s+Pickup Directive\b.*$/im;
const FIELDS_TRAILER_RE = /<!--\s*aitm-fields:/i;

export function buildDeepDiveBlock({ ts, appendix, date } = {}) {
  if (!ts) throw new Error('buildDeepDiveBlock: ts is required');
  if (!appendix || typeof appendix !== 'string') {
    throw new TypeError('buildDeepDiveBlock: appendix must be a non-empty string');
  }
  const isoDate = date || String(ts).slice(0, 10);
  const marker = `<!-- aitm-deep-dive-posted: ${ts} -->`;
  const heading = `## Deep-Dive Analysis (${isoDate})`;
  const trimmed = appendix.replace(/^\s+|\s+$/g, '');
  return `\n\n${marker}\n\n${heading}\n\n${trimmed}\n`;
}

// Locate insertion point. Prefer the line AFTER the `---` separator that
// follows the Pickup Directive heading. Fallback to before the
// `aitm-fields` JSON trailer. Last resort: end of body.
export function findInsertOffset(body) {
  const src = String(body || '');
  const pickup = PICKUP_HEADING_RE.exec(src);
  if (pickup) {
    // Find the first `---` line after the heading.
    const after = src.indexOf('\n', pickup.index + pickup[0].length);
    if (after !== -1) {
      const sepRe = /^---\s*$/m;
      sepRe.lastIndex = 0;
      const rest = src.slice(after);
      const sep = sepRe.exec(rest);
      if (sep) {
        return after + sep.index + sep[0].length;
      }
    }
    // No separator → insert at end of pickup line.
    return pickup.index + pickup[0].length;
  }
  const fields = FIELDS_TRAILER_RE.exec(src);
  if (fields) {
    // Walk back to the start of the line containing the fields marker.
    const lineStart = src.lastIndexOf('\n', fields.index) + 1;
    return lineStart;
  }
  return src.length;
}

export function insertDeepDiveBlock(body, block) {
  const src = String(body || '');
  const offset = findInsertOffset(src);
  return `${src.slice(0, offset)}${block}${src.slice(offset)}`;
}

export async function stampDeepDive({ issueNumber, repo, appendix, ts, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('stampDeepDive: issueNumber is required');
  if (!repo) throw new Error('stampDeepDive: repo is required');
  if (!appendix || typeof appendix !== 'string') {
    throw new TypeError('stampDeepDive: appendix must be a non-empty string');
  }
  const stamp = ts || new Date().toISOString();
  const block = buildDeepDiveBlock({ ts: stamp, appendix });
  const mutateIssueBodyFn = deps.mutateIssueBody || mutateIssueBody;
  return mutateIssueBodyFn({
    issueNumber,
    repo,
    deps,
    mutate: (base) => {
      if (POSTED_RE.test(base)) return base;
      return insertDeepDiveBlock(base, block);
    },
  });
}
