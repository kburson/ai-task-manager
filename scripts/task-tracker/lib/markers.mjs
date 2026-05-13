// Hidden-marker helpers — centralizes all `<!-- aitm-* -->` markers used to
// record verb completion in issue bodies.
//
// Markers are HTML comments so they do not render in the issue view. Each
// helper is pure and idempotent. Insertion preserves the canonical field-DB
// encoding via parseIssueFieldDb/formatIssueFieldDb, ensuring legacy fenced
// blocks are normalized as a side-effect of any marker write.

import { parseIssueFieldDb, stripIssueFieldDb, formatIssueFieldDb } from '../issue-field-db.mjs';

// ---------------------------------------------------------------------------
// plan-approved (analyze → development human gate)
// ---------------------------------------------------------------------------

export const PLAN_APPROVED_RE = /<!--\s*aitm-plan-approved:\s*([^>]*?)\s*-->/i;

export function buildPlanApprovedMarker(ts) {
  return `<!-- aitm-plan-approved: ${ts} -->`;
}

export function hasPlanApprovedMarker(body) {
  return PLAN_APPROVED_RE.test(String(body || ''));
}

// ---------------------------------------------------------------------------
// review-approved (review → done human gate)
// ---------------------------------------------------------------------------

export const REVIEW_APPROVED_RE = /<!--\s*aitm-review-approved:\s*([^>]*?)\s*-->/i;

export function buildReviewApprovedMarker(ts) {
  return `<!-- aitm-review-approved: ${ts} -->`;
}

export function hasReviewApprovedMarker(body) {
  return REVIEW_APPROVED_RE.test(String(body || ''));
}

export function insertReviewApprovedMarker(body, ts) {
  return insertMarkerBeforeFieldDb(body, REVIEW_APPROVED_RE, buildReviewApprovedMarker(ts));
}

// ---------------------------------------------------------------------------
// deep-dive-complete (structural prerequisite for analyze → development)
// ---------------------------------------------------------------------------

export const DEEP_DIVE_COMPLETE_RE = /<!--\s*aitm-deep-dive-complete:\s*([^>]*?)\s*-->/i;

export function buildDeepDiveCompleteMarker(ts) {
  return `<!-- aitm-deep-dive-complete: ${ts} -->`;
}

export function hasDeepDiveCompleteMarker(body) {
  return DEEP_DIVE_COMPLETE_RE.test(String(body || ''));
}

export function insertDeepDiveCompleteMarker(body, ts) {
  return insertMarkerBeforeFieldDb(body, DEEP_DIVE_COMPLETE_RE, buildDeepDiveCompleteMarker(ts));
}

// Heading-fallback for legacy issues authored before the marker existed. A
// `## Deep-Dive Analysis` heading in the body is treated as equivalent
// evidence that the deep-dive was performed, so pickup logic and the
// analyze→development gate do not re-author the section.
export const DEEP_DIVE_HEADING_RE = /^##\s+Deep-Dive Analysis\b/im;

export function hasDeepDiveHeading(body) {
  return DEEP_DIVE_HEADING_RE.test(String(body || ''));
}

export function hasDeepDiveEvidence(body) {
  return hasDeepDiveCompleteMarker(body) || hasDeepDiveHeading(body);
}

// Backfill the marker on a legacy issue: if the heading is present and the
// marker is absent, insert the marker at `ts`. Returns the (possibly
// unchanged) body. Idempotent.
export function backfillDeepDiveCompleteMarker(body, ts) {
  const src = String(body || '');
  if (hasDeepDiveCompleteMarker(src)) return src;
  if (!hasDeepDiveHeading(src)) return src;
  return insertDeepDiveCompleteMarker(src, ts);
}

// Stamp the deep-dive-complete marker on a live issue body via `gh`.
// Idempotent: returns `{ changed: false }` if the marker is already present.
// Tests inject `deps.fetchBody` / `deps.writeBody` to avoid GitHub I/O.
export async function markDeepDiveComplete({ issueNumber, cfg, now, deps = {} } = {}) {
  if (!issueNumber) throw new Error('markDeepDiveComplete: issueNumber is required');
  if (!cfg?.repo) throw new Error('markDeepDiveComplete: cfg.repo is required');

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const pathMod = await import('node:path');
  const pexec = promisify(execFile);

  const fetchBody =
    deps.fetchBody ||
    (async () => {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', String(issueNumber), '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
        { timeout: 10000 }
      );
      return stdout;
    });
  const writeBody =
    deps.writeBody ||
    (async (body) => {
      const { writeFileSync, unlinkSync } = await import('node:fs');
      const os = await import('node:os');
      const tmp = pathMod.join(os.tmpdir(), `tt-deep-dive-${Date.now()}.md`);
      try {
        writeFileSync(tmp, body, 'utf8');
        await pexec(
          'gh',
          ['issue', 'edit', String(issueNumber), '-R', cfg.repo, '--body-file', tmp],
          { timeout: 10000 }
        );
      } finally {
        try {
          unlinkSync(tmp);
        } catch {}
      }
    });

  const body = await fetchBody();
  if (hasDeepDiveCompleteMarker(body)) {
    return { changed: false, ts: null };
  }
  const ts = (typeof now === 'function' ? now() : new Date().toISOString()).replace(/\.\d+Z$/, 'Z');
  const updated = insertDeepDiveCompleteMarker(body, ts);
  await writeBody(updated);
  return { changed: true, ts };
}

// ---------------------------------------------------------------------------
// Shared insertion logic.
//
// Places `marker` on its own line immediately before the field-DB block (in
// canonical encoding), or at the end of the body if no field-DB is present.
// Legacy fenced field-DB blocks are normalized as a side-effect.
//
// Idempotent: if the marker is already present, returns the body unchanged.
// ---------------------------------------------------------------------------

function insertMarkerBeforeFieldDb(body, markerRe, marker) {
  const src = String(body || '');
  if (markerRe.test(src)) return src;
  const parsed = parseIssueFieldDb(src);
  if (parsed.ok) {
    const stripped = stripIssueFieldDb(src);
    return `${stripped}\n\n${marker}\n\n${formatIssueFieldDb(parsed.values)}\n`;
  }
  return `${src.replace(/\s+$/, '')}\n\n${marker}\n`;
}
