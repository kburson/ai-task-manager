// @story #498
// Single source of the `aitm-defect-hint:` trailer grammar.
//
// When one of the skill's own scripts blocks or throws, it can emit a
// machine-readable hint that the AI lifts verbatim into a pre-filled
// `/task report --kind defect --from-hint "<verb> <reason>"`. The grammar
// mirrors exactly what `parseHint` (lib/upstream-report.mjs) consumes — first
// whitespace splits `<verb>` from `<reason>` — so a hint round-trips cleanly.

const DEFAULT_MAX_LEN = 240;

// Collapse any whitespace run (newlines, tabs, repeated spaces) to a single
// space and trim, so the reason is guaranteed single-line. Length-cap with an
// ellipsis so an overlong message can't blow up the trailer.
function sanitizeReason(reason, maxLen) {
  const one = String(reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1).trimEnd()}…`;
}

// Format a single-line `aitm-defect-hint: <verb> <reason>` trailer. Returns
// `''` when `verb` is empty/blank so callers can no-op safely. A blank reason
// yields just `aitm-defect-hint: <verb>`.
export function formatDefectHint(verb, reason, { maxLen = DEFAULT_MAX_LEN } = {}) {
  const v = String(verb ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!v) return '';
  const r = sanitizeReason(reason, maxLen);
  return r ? `aitm-defect-hint: ${v} ${r}` : `aitm-defect-hint: ${v}`;
}

// Append the trailer to `text` on its own final line. No-op (returns `text`
// unchanged) when the trailer would be empty. Used by string-returning sites
// such as the gh-edit-guard refusal reason.
export function appendDefectHint(text, verb, reason, opts) {
  const base = String(text ?? '');
  const hint = formatDefectHint(verb, reason, opts);
  if (!hint) return base;
  return base.length ? `${base}\n${hint}` : hint;
}
