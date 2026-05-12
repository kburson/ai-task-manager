// Canonical 7-state kanban transition matrix. Pure data + a validator.
// Consumers: move-state.mjs hardening (W2.3), /task move verb (W3.1),
// parent-admission gate (W1.3), activity-policy lookup (W1.2).

export const KANBAN_STATES = Object.freeze({
  BACKLOG: 'backlog',
  REFINE: 'refine',
  PLAN: 'plan',
  DEVELOP: 'develop',
  TEST: 'test',
  REVIEW: 'review',
  DONE: 'done',
});

export const STATES = ['backlog', 'refine', 'plan', 'develop', 'test', 'review', 'done'];

export const FORWARD = {
  backlog: 'refine',
  refine: 'plan',
  plan: 'develop',
  develop: 'test',
  test: 'review',
  review: 'done',
};

export const BACKWARD = {
  test: 'develop',
  review: 'develop',
};

// Legacy column-name aliases. Board columns may still be named "Groom",
// "Analyze", "Development", "Validate" in existing projects; map them to the
// new canonical slugs so live-state reads work without renaming columns.
const BOARD_NAME_ALIASES = {
  groom: 'refine',
  analyze: 'plan',
  analysis: 'plan',
  development: 'develop',
  validate: 'test',
  validation: 'test',
};

export function normalizeStateSlug(input) {
  if (input == null) return null;
  const slug = String(input).toLowerCase();
  return BOARD_NAME_ALIASES[slug] || slug;
}

export function validateTransition(from, to) {
  if (!STATES.includes(from)) {
    return { ok: false, reason: `unknown state: ${from}` };
  }
  if (!STATES.includes(to)) {
    return { ok: false, reason: `unknown state: ${to}` };
  }
  if (FORWARD[from] === to) return { ok: true };
  if (BACKWARD[from] === to) return { ok: true };
  const allowed = [FORWARD[from], BACKWARD[from]].filter(Boolean).join(', ') || 'none';
  return { ok: false, reason: `illegal transition: ${from} → ${to}. Allowed: ${allowed}.` };
}
