// Review Notes — drivers source for the Review delta comment.
//
// Reviewer (human) or auto-derivation (full-auto) posts a comment whose body
// starts with `### 📝 Review Notes` followed by bullet lines. Each bullet is a
// driver. The most recent such comment that is newer than the most recent
// `### 📊 Review delta` comment wins; earlier ones are stale.
//
// The comment carries a hidden footer `<!-- aitm-review-notes-source: X -->`
// where X is `human` or `auto` — used for audit only.

const HEADER_RE = /^###\s+📝\s+Review Notes\b/m;
const DELTA_HEADER_RE = /^###\s+📊\s+Review delta\b/m;
const BULLET_RE = /^[\s>]*[-*]\s+(.+?)\s*$/;

/**
 * Locate the most-recent `### 📝 Review Notes` comment that is newer than the
 * most-recent `### 📊 Review delta` comment (so a stale notes comment from a
 * prior cycle is ignored).
 *
 * @param {Array<{body:string,createdAt:string}>} comments
 * @param {{ deltaCommentTs?: string | null }} [opts]
 * @returns {{ body:string, createdAt:string } | null}
 */
export function findReviewNotesComment(comments, { deltaCommentTs = null } = {}) {
  if (!Array.isArray(comments) || comments.length === 0) return null;

  // Find latest delta-comment timestamp if not provided.
  let cutoff = deltaCommentTs;
  if (cutoff === null || cutoff === undefined) {
    let latest = null;
    for (const c of comments) {
      if (!c || typeof c.body !== 'string') continue;
      if (DELTA_HEADER_RE.test(c.body)) {
        if (!latest || c.createdAt > latest) latest = c.createdAt;
      }
    }
    cutoff = latest;
  }

  let winner = null;
  for (const c of comments) {
    if (!c || typeof c.body !== 'string') continue;
    if (!HEADER_RE.test(c.body)) continue;
    if (cutoff && c.createdAt && c.createdAt < cutoff) continue;
    if (!winner || (c.createdAt || '') > (winner.createdAt || '')) {
      winner = c;
    }
  }
  return winner;
}

/**
 * Parse bullet drivers out of a `### 📝 Review Notes` comment body. Bullet
 * lines (`-` or `*`) yield driver strings; non-bullet text is ignored.
 *
 * @param {string} commentBody
 * @returns {string[]}
 */
export function parseDrivers(commentBody) {
  if (typeof commentBody !== 'string') return [];
  const out = [];
  const lines = commentBody.split('\n');
  let started = false;
  for (const raw of lines) {
    if (!started) {
      if (HEADER_RE.test(raw)) started = true;
      continue;
    }
    // Stop at the next section heading.
    if (/^#{2,4}\s+\S/.test(raw)) break;
    const m = raw.match(BULLET_RE);
    if (m) {
      const text = m[1].trim();
      if (text) out.push(text);
    }
  }
  return out;
}

/**
 * Render the canonical Review Notes comment body.
 *
 * @param {string[]} drivers
 * @param {{ source: 'human' | 'auto' }} opts
 * @returns {string}
 */
export function buildReviewNotesComment(drivers, { source } = {}) {
  if (source !== 'human' && source !== 'auto') {
    throw new Error(`buildReviewNotesComment: source must be 'human' or 'auto', got ${source}`);
  }
  const list = Array.isArray(drivers)
    ? drivers.filter((d) => typeof d === 'string' && d.trim())
    : [];
  const lines = ['### 📝 Review Notes', ''];
  if (list.length === 0) {
    lines.push('_No drivers recorded._');
  } else {
    for (const d of list) lines.push(`- ${d.trim()}`);
  }
  lines.push('');
  lines.push(`<!-- aitm-review-notes-source: ${source} -->`);
  return lines.join('\n');
}
