// #730 — canonical commit-message issue-ID attribution format (foundation for
// epic #727's message-based, VCS-process-agnostic commit attribution).
//
// The token `[#N]` leads the commit subject:
//
//   [#730] feat(commit-attr): add subject-line lint gate
//
// Design contract:
//   - The id lives inside the leading bracket token; the token is the leftmost
//     token of the subject (leading whitespace tolerated).
//   - Greppable via a single stable regex (`\[#(\d+)\]`) over `git log
//     --oneline`, so attribution survives rebase/squash/cherry-pick/amend —
//     the token rides in the message, unlike a SHA.
//   - It composes BEFORE the conventional-commit `type(scope): subject`, so any
//     type-based gate (notably the `chore:` gate) must read the type token
//     AFTER the bracket run. `classifyType` does exactly that.
//   - Multiple ids are allowed as a contiguous leading run — `[#730] [#731] …`
//     — so one commit can attribute to several issues.
//
// This module is a pure, side-effect-free source of truth. #731's attribution
// engine and #733's gates consume these helpers instead of re-implementing the
// regex.

// Matches a single leading `[#N]` token (leading whitespace tolerated); capture
// group 1 is the id digits. Anchored, so a mid-subject token is NOT a prefix.
export const ISSUE_PREFIX_RE = /^\s*\[#(\d+)\]/;

// Global, unanchored form for extracting every id token from a line — the grep
// primitive #731 builds its `git log --all --grep=` attribution on.
export const ISSUE_ID_GLOBAL_RE = /\[#(\d+)\]/g;

// One `[#N]` token plus the whitespace that follows it, used to walk the
// contiguous leading run and to strip it before reading the commit type.
const LEADING_TOKEN_RE = /^\s*\[#(\d+)\]\s*/;

// Conventional-commit type at the start of a (bracket-stripped) subject:
// `type`, optional `(scope)`, optional `!`, then `:`.
const CONVENTIONAL_TYPE_RE = /^(\w+)(?:\([^)]*\))?!?:/;

// Coerce an issue-number input (`730`, `'730'`, `'#730'`) to its digit string.
// Throws on anything that is not a positive integer id — inject must never
// silently produce a malformed token.
function normalizeIssueId(issueNumber) {
  const raw = String(issueNumber ?? '')
    .trim()
    .replace(/^#/, '');
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid issue number for commit prefix: ${JSON.stringify(issueNumber)}`);
  }
  return raw;
}

// True when the subject leads with a well-formed `[#N]` token.
export function hasIssuePrefix(subject) {
  return ISSUE_PREFIX_RE.test(subject ?? '');
}

// Parse the ids in the contiguous leading `[#N]` run, in order. A token that
// appears only mid-subject is intentionally ignored — attribution keys on the
// prefix, not on incidental references in the message body.
export function parseIssueIds(subject) {
  let rest = subject ?? '';
  const ids = [];
  let m;
  while ((m = rest.match(LEADING_TOKEN_RE))) {
    ids.push(Number(m[1]));
    rest = rest.slice(m[0].length);
  }
  return ids;
}

// Idempotently ensure the subject carries `[#issueNumber]` in its leading run.
// If the id already appears anywhere in the leading run, the subject is
// returned unchanged; otherwise the token is prepended ahead of any existing
// run. Never doubles a token.
export function injectIssuePrefix(subject, issueNumber) {
  const id = normalizeIssueId(issueNumber);
  const s = subject ?? '';
  if (parseIssueIds(s).includes(Number(id))) return s;
  return `[#${id}] ${s}`;
}

// Lint predicate for the commit-trail handler and (later, #733) the
// commit-trace / review-preflight / close gates. Returns `null` when the
// subject already carries the bound issue's prefix, or a structured finding
// `{ code, message, injected }` when it does not. `injected` is the subject the
// handler WOULD produce via `injectIssuePrefix`, so a caller can amend or just
// warn. This is deliberately non-throwing: a malformed `issueNumber` yields a
// null (nothing to lint against) rather than aborting a commit hook.
export function lintCommitSubject(subject, issueNumber) {
  let id;
  try {
    id = normalizeIssueId(issueNumber);
  } catch {
    return null;
  }
  if (typeof subject !== 'string') return null;
  if (parseIssueIds(subject).includes(Number(id))) return null;
  return {
    code: 'missing-issue-prefix',
    message:
      `commit subject is missing the issue-ID prefix "[#${id}] ".\n` +
      `Subject: ${subject}\n` +
      `Fix: prefix the subject with "[#${id}] " (e.g. amend: \`git commit --amend\`),\n` +
      `     so attribution survives history rewrites (epic #727).`,
    injected: injectIssuePrefix(subject, id),
  };
}

// Read the conventional-commit type AFTER stripping the leading `[#N]` run.
// Returns the type string (e.g. `feat`, `chore`) or null when the subject has
// no conventional-commit type. This is what lets the `chore:` gate compose with
// the bracket prefix.
export function classifyType(subject) {
  let rest = subject ?? '';
  let m;
  while ((m = rest.match(LEADING_TOKEN_RE))) {
    rest = rest.slice(m[0].length);
  }
  const typeMatch = rest.match(CONVENTIONAL_TYPE_RE);
  return typeMatch ? typeMatch[1] : null;
}
