// #921 — Duplicate-sub-issue creation guard.
//
// `create-issue.mjs --shape sub-issue --parent <E>` had no check against the
// parent epic's already-existing children. A session that never loaded the
// epic's current sub-issue tree (resumed/compacted, or one that skipped the
// read) would re-run the same decomposition and produce near-identical
// duplicate stories under the same parent. This recurred during the #912
// fan-out (#917–#920 duplicated #913–#916), which is the signal that the fix
// must be a script-level guard rather than another behavioral CLAUDE.md
// reminder.
//
// This module is the pure decision core plus a default GraphQL fetcher. The
// core (`evaluateDuplicateChild`) is what the regression test drives; the
// fetcher mirrors the `subIssues` query already used by `wave-admission.mjs`.

import { gql, splitRepo } from './github-projects.mjs';
import { stripKnownPrefix } from './kind-prefix.mjs';

// Default similarity threshold. A conservative value: a duplicate re-run of the
// same decomposition scores very high (≈1.0 modulo a prefix or a reordered
// word), while genuinely distinct siblings sit well below. Tunable per call.
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

// Deterministic exit code for a refused duplicate-child creation. Distinct from
// create-issue.mjs's existing 1/2/4/6 so callers/tests can assert on it.
export const DUPLICATE_CHILD_EXIT_CODE = 7;

// Small stopword set — words that carry no discriminating signal for issue
// titles. Kept intentionally tiny so it never suppresses a real topic word.
const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'in', 'on']);

// Tokenize a title into a normalized Set of significant words:
//   1. strip a leading known kind/epic prefix (🐞 [BUG] , 🧑‍🧒‍🧒 [Epic] , …),
//   2. lowercase,
//   3. split on any non-alphanumeric run (drops backticks, brackets, punctuation),
//   4. drop empty tokens and stopwords.
export function normalizeTitle(title) {
  const stripped = stripKnownPrefix(String(title ?? ''));
  const tokens = stripped
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t && !STOPWORDS.has(t));
  return new Set(tokens);
}

// Similarity of two titles in [0,1]. `max(jaccard, containment)`:
//   - jaccard    = |A∩B| / |A∪B|  — overall token overlap,
//   - containment = |A∩B| / min(|A|,|B|) — catches a duplicate that merely adds
//     or drops a qualifier word (one token set ⊆ the other scores 1.0).
// Returns 0 when either side has no significant tokens.
export function titleSimilarity(a, b) {
  const setA = a instanceof Set ? a : normalizeTitle(a);
  const setB = b instanceof Set ? b : normalizeTitle(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  if (inter === 0) return 0;
  const union = setA.size + setB.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(setA.size, setB.size);
  return Math.max(jaccard, containment);
}

// Is a sibling descriptor OPEN? Only open siblings can collide — a closed
// (including NOT_PLANNED) duplicate must never block a legitimate re-file.
// Accepts either GitHub's `state: 'OPEN'|'CLOSED'` casing or a lowercase form.
function isOpenSibling(sib) {
  if (!sib) return false;
  const raw = String(sib.state ?? '').toUpperCase();
  // Default to OPEN only when state is entirely absent (injected test fixtures
  // may omit it); an explicit CLOSED is respected.
  return raw === '' ? true : raw === 'OPEN';
}

// Core decision. Given the new child's title and the parent's existing
// siblings, return `{ refuse, matches }`:
//   - `matches`: every OPEN sibling whose similarity ≥ threshold, each
//     `{ number, title, score }`, sorted by descending score then ascending
//     number (stable, deterministic ordering).
//   - `refuse`: `matches.length > 0 && !overridden`.
// Pure — no I/O.
export function evaluateDuplicateChild({
  newTitle,
  siblings = [],
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
  overridden = false,
} = {}) {
  const newSet = normalizeTitle(newTitle);
  const matches = [];
  for (const sib of Array.isArray(siblings) ? siblings : []) {
    if (!isOpenSibling(sib)) continue;
    if (sib.number == null) continue;
    const score = titleSimilarity(newSet, sib.title);
    if (score >= threshold) {
      matches.push({ number: Number(sib.number), title: String(sib.title ?? ''), score });
    }
  }
  matches.sort((x, y) => y.score - x.score || x.number - y.number);
  return { refuse: matches.length > 0 && !overridden, matches };
}

// Deterministic refusal message naming the colliding issue number(s) so the
// operator adopts/links instead of duplicating.
export function formatDuplicateRefusal(parent, matches) {
  const list = matches
    .map((m) => `  #${m.number} — "${m.title}" (similarity ${m.score.toFixed(2)})`)
    .join('\n');
  const nums = matches.map((m) => `#${m.number}`).join(', ');
  return (
    `refusing to create sub-issue under epic #${parent}: the new title is a high-similarity ` +
    `match to ${matches.length} existing open sub-issue(s):\n${list}\n` +
    `Adopt/link ${nums} instead of duplicating, or pass --allow-duplicate-child to override ` +
    `for a genuinely distinct near-duplicate.`
  );
}

// Default fetcher: the parent epic's sub-issues with number/title/state, scoped
// to what the guard needs (no project-item fields). Mirrors the query shape in
// `wave-admission.mjs`. Throws if `repo` is missing — the caller decides the
// fail-open/closed policy on a thrown read.
export async function defaultFetchOpenChildren({ parentEpicNumber, repo } = {}) {
  if (parentEpicNumber == null) return [];
  if (!repo) throw new Error('duplicate-child-guard: repo is required');
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          subIssues(first: 100) {
            nodes { number title state }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(parentEpicNumber) }
  );
  const subs = data?.repository?.issue?.subIssues?.nodes || [];
  return subs.filter(Boolean).map((s) => ({ number: s.number, title: s.title, state: s.state }));
}
