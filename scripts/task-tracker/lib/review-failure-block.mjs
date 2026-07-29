// Dependency-light lexical boundary helper for the prose-bearing
// `aitm-review-failed` marker block. Review policy stays in review-gate.mjs;
// this leaf only recognizes standalone delimiters and locates line spans.

export const REVIEW_FAILED_START = '<!-- aitm-review-failed:start -->';
export const REVIEW_FAILED_END = '<!-- aitm-review-failed:end -->';

const REVIEW_FAILED_START_LINE_RE = /^\s*<!--\s*aitm-review-failed:start\s*-->\s*$/i;
const REVIEW_FAILED_END_LINE_RE = /^\s*<!--\s*aitm-review-failed:end\s*-->\s*$/i;

export function isReviewFailureBlockStart(line) {
  return REVIEW_FAILED_START_LINE_RE.test(String(line ?? ''));
}

export function isReviewFailureBlockEnd(line) {
  return REVIEW_FAILED_END_LINE_RE.test(String(line ?? ''));
}

// Locate an inclusive review-failure block span in `lines`.
//
// The default complete-span mode matches review-gate semantics: an unmatched
// start is not clearable. `includeUnterminated` matches V6 normalization
// semantics: preserve an unmatched start through EOF as an opaque span.
// `requireStartAt` lets a caller test its current scan position without
// re-owning delimiter grammar.
export function findReviewFailureBlockSpan(
  lines,
  { fromIndex = 0, requireStartAt = false, includeUnterminated = false } = {}
) {
  const list = Array.isArray(lines) ? lines : [];
  const first = Number.isInteger(fromIndex) && fromIndex > 0 ? fromIndex : 0;
  let start = -1;

  if (requireStartAt) {
    if (!isReviewFailureBlockStart(list[first])) return null;
    start = first;
  } else {
    for (let i = first; i < list.length; i += 1) {
      if (!isReviewFailureBlockStart(list[i])) continue;
      start = i;
      break;
    }
  }

  if (start < 0) return null;
  for (let end = start + 1; end < list.length; end += 1) {
    if (isReviewFailureBlockEnd(list[end])) {
      return { start, end, complete: true };
    }
  }

  if (!includeUnterminated) return null;
  return { start, end: list.length - 1, complete: false };
}
