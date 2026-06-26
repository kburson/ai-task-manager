// #534 — canonical pause/resume reason vocabulary.
//
// A non-switch work-interruption (`/task pause`) records its reason as a
// canonical slug on the timing row's Event cell (`pause:<slug>`), and the
// symmetric `/task resume` echoes the same slug (`resume:<slug>`). The slug set
// is a small fixed vocabulary; anything outside it collapses to `other`, and
// the operator's free text is preserved in the Description cell instead of the
// Event slug.
//
// Keeping this table in one module lets pause, resume, and their tests share a
// single source of truth for the mapping.

// The fixed canonical slugs. `other` is the catch-all and is intentionally NOT
// in this set — it is the fallback, not a directly-matchable keyword.
export const CANONICAL_PAUSE_SLUGS = ['question', 'discuss', 'blocked', 'break'];

// Synonyms that map onto a canonical slug. Keys are lower-cased bare words; the
// matcher tests whole-word membership of the reason text against these.
const SYNONYMS = {
  question: 'question',
  questions: 'question',
  q: 'question',
  ask: 'question',
  asking: 'question',
  discuss: 'discuss',
  discussion: 'discuss',
  discussing: 'discuss',
  brainstorm: 'discuss',
  brainstorming: 'discuss',
  blocked: 'blocked',
  blocker: 'blocked',
  blocking: 'blocked',
  block: 'blocked',
  break: 'break',
  lunch: 'break',
  afk: 'break',
  away: 'break',
};

// Resolve a free-text reason to a canonical slug. Returns one of
// CANONICAL_PAUSE_SLUGS, or 'other' when nothing matches (including an
// empty/undefined reason).
//
// Matching strategy: lower-case, then look for any whole word that is a
// canonical slug or a known synonym. First match wins, scanning the canonical
// slugs in declared order so a multi-word reason resolves deterministically.
export function canonicalPauseReason(reason) {
  const text = String(reason ?? '')
    .trim()
    .toLowerCase();
  if (!text) return 'other';
  const words = text.split(/[^a-z]+/).filter(Boolean);
  const wordSet = new Set(words);
  // Prefer a direct canonical-slug hit, in declared priority order.
  for (const slug of CANONICAL_PAUSE_SLUGS) {
    if (wordSet.has(slug)) return slug;
  }
  // Then fall back to synonyms.
  for (const word of words) {
    if (SYNONYMS[word]) return SYNONYMS[word];
  }
  return 'other';
}

// True when the resolved slug is `other` — i.e. the free text must be carried
// in the Description cell because it could not be canonicalized.
export function isOtherReason(slug) {
  return slug === 'other';
}
