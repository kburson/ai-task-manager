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

// Canonical state slugs only. Boards using retired vocabulary
// (Groom/Analyze/Development/Validate) must be migrated via
// `scripts/migrate/rename-status-2026-05.mjs` before consumption.
export function normalizeStateSlug(input) {
  if (input == null) return null;
  return String(input).toLowerCase();
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
