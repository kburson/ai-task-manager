// #670/#1096 — issue-title reconciliation: pure core.
//
// Extracted from label-beta-report.yml's inline Step 2 so the
// prefix-stripping logic is unit-testable. Strips both the current emoji
// prefix (🐞/✨) and any legacy bracket-text prefix (`[BETA-DEFECT] `,
// `[BETA-FEATURE] `) — in either order — before re-prefixing with the
// wanted emoji, so a legacy-prefixed title converges to the current format
// instead of accumulating a stacked prefix.

import { ensureKindPrefix, KIND_PREFIXES, stripKnownPrefix } from '../../gh/lib/kind-prefix.mjs';

export const LADYBUG = '🐞';
export const SPARKLE = '✨';

const KIND_LABELS = new Set(Object.keys(KIND_PREFIXES));

export function reconcileIssueTitle(title, labels = []) {
  const normalized = Array.isArray(labels)
    ? labels.map((label) => String(label).toLowerCase())
    : [];
  if (!normalized.some((label) => KIND_LABELS.has(label))) return stripKnownPrefix(title);
  return ensureKindPrefix(title, normalized);
}

const LEGACY_DEFECT_RE = /^\[BETA-DEFECT\]\s*/;
const LEGACY_FEATURE_RE = /^\[BETA-FEATURE\]\s*/;

function stripEmojiPrefix(title) {
  if (title.startsWith(LADYBUG)) return title.slice(LADYBUG.length).replace(/^\s+/, '');
  if (title.startsWith(SPARKLE)) return title.slice(SPARKLE.length).replace(/^\s+/, '');
  return title;
}

function stripLegacyBracketPrefix(title) {
  if (LEGACY_DEFECT_RE.test(title)) return title.replace(LEGACY_DEFECT_RE, '');
  if (LEGACY_FEATURE_RE.test(title)) return title.replace(LEGACY_FEATURE_RE, '');
  return title;
}

// `wantEmoji` is `LADYBUG`, `SPARKLE`, or `''` (no prefix wanted), as
// computed by the caller from the issue's labels/markers.
export function reconcileBetaReportTitle(title, wantEmoji) {
  const rest = stripLegacyBracketPrefix(stripEmojiPrefix(title));
  return wantEmoji ? `${wantEmoji} ${rest}` : rest;
}
