// #488 — Plan Metadata label emphasis, single source of truth.
//
// #416 added label-bolding in `preflight-issue.mjs::normalizePlanMetadata`, but
// its regex was anchored at `^label:` and never matched the bulleted list form
// (`- label: value`) that templates and issues actually use, so the fix was a
// no-op for real metadata. This module owns the one definition of "a Plan
// Metadata label" used by creation (preflight), back-fill, and the enforcement
// lint, so the three paths can never drift.
//
// Convention (#416): the colon stays OUTSIDE the bold span — `- **label**: value`.

// A label at line start, optionally preceded by a `- ` bullet. Two alternatives
// so an already-bold label matches and passes through unchanged (idempotent).
const LABEL_RE = /^(- )?(\*\*[\w][\w-]*\*\*:|[\w][\w-]*:)/;

// Matches an unbold label line (bullet optional) but NOT an already-bold one.
const UNBOLD_LABEL_RE = /^(?:- )?[\w][\w-]*:/;
const BOLD_LABEL_RE = /^(?:- )?\*\*[\w][\w-]*\*\*:/;

const PLAN_METADATA_HEADING_RE = /^##\s+Plan Metadata\s*$/;
const ANY_HEADING_RE = /^#{1,6}\s+/;

// Bold the label on a single line, preserving any leading `- ` bullet and
// keeping the colon outside the bold span. Idempotent on already-bold labels.
export function normalizePlanMetadataLine(line) {
  return line.replace(LABEL_RE, (m, bullet, label) =>
    label.startsWith('**') ? m : `${bullet ?? ''}**${label.slice(0, -1)}**:`
  );
}

// Bold every label line in a raw Plan Metadata value (no heading scoping). This
// is the creation-time path: preflight hands in only the section body.
export function normalizePlanMetadataValue(value) {
  return String(value).split('\n').map(normalizePlanMetadataLine).join('\n');
}

// Locate the `## Plan Metadata` section in a full issue body and return
// [startIdx, endIdx) line bounds for the lines BELOW the heading, up to (but not
// including) the next heading or end of body. Returns null when absent.
function planMetadataBounds(lines) {
  const headingIdx = lines.findIndex((l) => PLAN_METADATA_HEADING_RE.test(l));
  if (headingIdx === -1) return null;
  let end = headingIdx + 1;
  while (end < lines.length && !ANY_HEADING_RE.test(lines[end])) end += 1;
  return { start: headingIdx + 1, end };
}

// Normalize ONLY the `## Plan Metadata` section of a full issue body, leaving
// every other `key: value` line in the body untouched. No-op (returns the input
// unchanged) when the section is absent or already fully bold.
export function normalizePlanMetadataSection(body) {
  const lines = String(body).split('\n');
  const bounds = planMetadataBounds(lines);
  if (!bounds) return String(body);
  let changed = false;
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const next = normalizePlanMetadataLine(lines[i]);
    if (next !== lines[i]) {
      lines[i] = next;
      changed = true;
    }
  }
  return changed ? lines.join('\n') : String(body);
}

// Lint: return the unbold Plan Metadata label lines in a full issue body. Each
// entry is { line, label } where `line` is the raw source line and `label` is
// the bare label token (no bullet, no colon). Empty array when clean or when
// the section is absent.
export function findUnboldPlanMetadataLabels(body) {
  const lines = String(body).split('\n');
  const bounds = planMetadataBounds(lines);
  if (!bounds) return [];
  const out = [];
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const line = lines[i];
    if (BOLD_LABEL_RE.test(line)) continue;
    const m = UNBOLD_LABEL_RE.exec(line);
    if (!m) continue;
    const label = m[0].replace(/^- /, '').replace(/:$/, '');
    out.push({ line, label });
  }
  return out;
}
