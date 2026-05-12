// Canonical 7-state kanban transition matrix. Pure data + a validator.
// Consumers: move-state.mjs hardening (W2.3), /task move verb (W3.1),
// parent-admission gate (W1.3), activity-policy lookup (W1.2).

export const STATES = ['backlog', 'groom', 'analyze', 'development', 'validate', 'review', 'done'];

export const FORWARD = {
  backlog: 'groom',
  groom: 'analyze',
  analyze: 'development',
  development: 'validate',
  validate: 'review',
  review: 'done',
};

export const BACKWARD = {
  validate: 'development',
  review: 'development',
};

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
