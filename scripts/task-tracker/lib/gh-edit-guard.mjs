// Diff-based protection for `gh issue edit ... --body-file <path>` and
// `gh issue edit ... --body "<text>"` commands.
//
// Refuses writes that would:
//   * Introduce a deprecated visible-checkbox line (replaced by hidden marker).
//   * Drop a hidden marker that is present in the current issue body.
//
// Pure logic — caller injects body sources so this is fully unit-testable.

const ISSUE_EDIT_RE = /\bgh\s+issue\s+edit\s+(?:#)?(\d+)\b/;
const BODY_FILE_RE  = /--body-file\s+(\S+)/;
const BODY_INLINE_RE = /--body\s+(['"])((?:\\.|(?!\1).)*?)\1/;

const LEGACY_PATTERNS = [
  {
    name: 'Plan approved by human checkbox',
    re: /^[ \t]*- \[[ x]\] Plan approved by human\s*$/mi,
    advice: 'Replaced by hidden <!-- aitm-plan-approved: ... --> marker. Let the /task approve verb manage it.',
  },
  {
    name: 'Deep dive complete checkbox',
    re: /^[ \t]*- \[[ x]\] Deep dive complete\s*$/mi,
    advice: 'Replaced by hidden <!-- aitm-deep-dive-complete: ... --> marker. Let the /task check verb manage it.',
  },
];

const MARKER_PATTERNS = [
  { name: 'aitm-plan-approved',      re: /<!--\s*aitm-plan-approved:/i },
  { name: 'aitm-deep-dive-complete', re: /<!--\s*aitm-deep-dive-complete:/i },
  { name: 'aitm-review-approved',    re: /<!--\s*aitm-review-approved:/i },
];

export function parseGhIssueEdit(command) {
  const m = String(command || '').match(ISSUE_EDIT_RE);
  if (!m) return null;
  const issueNumber = Number(m[1]);
  const fileMatch = command.match(BODY_FILE_RE);
  if (fileMatch) return { issueNumber, source: 'file', path: fileMatch[1] };
  const inlineMatch = command.match(BODY_INLINE_RE);
  if (inlineMatch) return { issueNumber, source: 'inline', body: inlineMatch[2] };
  return { issueNumber, source: 'none' };
}

export function checkBodyChange({ newBody, currentBody, issueNumber }) {
  const src = String(newBody || '');
  const cur = String(currentBody || '');

  for (const { name, re, advice } of LEGACY_PATTERNS) {
    if (re.test(src) && !re.test(cur)) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} would introduce deprecated "${name}".\n` +
          `  ${advice}\n` +
          `  Strip the line from your draft before writing.`,
      };
    }
  }

  for (const { name, re } of MARKER_PATTERNS) {
    if (re.test(cur) && !re.test(src)) {
      return {
        block: true,
        reason:
          `gh issue edit on #${issueNumber} would drop hidden marker <${name}> that is present in the current body.\n` +
          `  This marker tracks verb completion. Re-fetch the current body, edit it in place, and re-write — do not replace wholesale.`,
      };
    }
  }

  return { block: false };
}

// Convenience wrapper: parses the command, resolves the body via injected
// readers, and runs the diff check. Returns { block: false } when the command
// is not a relevant `gh issue edit`, when the body can't be resolved, or when
// the diff is safe.
export function evaluateGhEdit({ command, readBodyFile, fetchCurrentBody }) {
  const parsed = parseGhIssueEdit(command);
  if (!parsed || parsed.source === 'none') return { block: false };

  let newBody;
  if (parsed.source === 'file') {
    try { newBody = readBodyFile(parsed.path); } catch { return { block: false }; }
  } else {
    newBody = parsed.body;
  }
  if (newBody == null) return { block: false };

  let currentBody = '';
  try { currentBody = fetchCurrentBody(parsed.issueNumber) ?? ''; } catch { currentBody = ''; }

  return checkBodyChange({ newBody, currentBody, issueNumber: parsed.issueNumber });
}
