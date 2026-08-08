// Verification-Commands parser (#137). Extracts the `- [ ] \`cmd\`` checkbox
// list from the `## Verification Commands` section of an issue body.
//
// Returns `[{ label, command, checked, lineIndex }, ...]` in body order.
// Used by the sandboxed `/task test` runner and (read-only) by the slimmed
// `/task review` AC-ticker.

const VC_HEADING_RE = /^#{1,6}\s+Verification Commands\s*$/i;
const ANY_HEADING_RE = /^#{1,6}\s+/;
const CHECKBOX_RE = /^- \[([ x])\] (.+)$/;
// #368 — tolerate trailing HTML comment(s) after the backtick command so an
// auto-ticked VC line (which carries an inline `aitm-verified` proof marker)
// still parses to its command instead of dropping to zero entries.
// #719 — exported as the single source of truth for a VC command-line's shape.
// `autoTickVerified` (auto-tick-verified.mjs) imports this instead of keeping a
// stricter local copy, so the "what to run" parser and the "what to tick"
// matcher can never disagree about which lines are VC command lines.
export const BACKTICK_CMD_RE = /^`([^`]+)`(?:\s*<!--[\s\S]*?-->)*\s*$/;
// #772 — stable, hidden per-entry id marker. Assigned once at emit time,
// monotonic, never reused (see `lib/vc-emit.mjs` for the tombstone-aware
// allocator). A pre-#772 line carries none; the parser reports `id: null`
// for it and the by-id resolver falls back to ordinal for such legacy bodies.
export const VC_ID_MARKER_RE = /<!--\s*id=(\d+)\s*-->/i;

export function parseVerificationCommands(body) {
  const src = String(body || '');
  const lines = src.split('\n');
  const items = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (VC_HEADING_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && ANY_HEADING_RE.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const cb = line.match(CHECKBOX_RE);
    if (!cb) continue;
    const checked = cb[1] === 'x';
    const label = cb[2].trim();
    const cmdMatch = label.match(BACKTICK_CMD_RE);
    if (!cmdMatch) continue;
    const idMatch = label.match(VC_ID_MARKER_RE);
    items.push({
      lineIndex: i,
      checked,
      label,
      command: cmdMatch[1],
      id: idMatch ? Number(idMatch[1]) : null,
    });
  }
  return items;
}

const STANDARD_CLASSIFICATIONS = new Map([
  ['npm run lint', 'lint-full'],
  ['npm run format:check', 'format-full'],
  ['npm run test:unit', 'test-unit'],
  ['npm run test:integration', 'test-integration'],
  ['npm run test:slow', 'test-slow'],
  ['npm test', 'test-fast-legacy'],
  ['node scripts/run-tests.mjs', 'test-fast-legacy'],
  ['npm run test:all', 'test-all-legacy'],
]);

export const COMPLETE_TEST_LANES = Object.freeze([
  Object.freeze({ classification: 'test-unit', command: 'npm run test:unit' }),
  Object.freeze({ classification: 'test-integration', command: 'npm run test:integration' }),
  Object.freeze({ classification: 'test-slow', command: 'npm run test:slow' }),
]);

export function classifyVerificationCommand(command) {
  return STANDARD_CLASSIFICATIONS.get(String(command || '').trim()) || 'targeted';
}

/**
 * Split a parsed VC list into the four buckets the Test sandbox runs.
 *
 * #1158 — `includeCompleteLanes` (default `true`) is the ONLY switch that can
 * empty `completeLanes`. Defaulting it to `true` keeps every pre-#1158 caller
 * byte-identical: the complete-lane floor is returned unconditionally unless a
 * caller has affirmatively proven it may be dropped. This function stays pure —
 * it holds no kind logic and reads no git state; the caller decides (see
 * `verbs/test.mjs`, which derives the flag through `docsKindDropsTests` so an
 * unclassifiable or empty diff keeps the lanes).
 */
export function partitionVerificationCommands({
  commands = [],
  reusableClassifications = [],
  includeCompleteLanes = true,
} = {}) {
  const reusable = new Set(reusableClassifications);
  const normalized = commands.map((item) => {
    const command = typeof item === 'string' ? item : item.command;
    return {
      ...(typeof item === 'string' ? {} : item),
      command,
      classification: classifyVerificationCommand(command),
    };
  });
  return {
    reused: normalized.filter(({ classification }) => reusable.has(classification)),
    completeLanes: includeCompleteLanes ? COMPLETE_TEST_LANES.map((lane) => ({ ...lane })) : [],
    targeted: normalized.filter(({ classification }) => classification === 'targeted'),
    compatibility: normalized.filter(({ classification }) =>
      ['test-fast-legacy', 'test-all-legacy'].includes(classification)
    ),
  };
}
