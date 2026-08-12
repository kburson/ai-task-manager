const EARLY_STATES = new Set(['backlog', 'refine', 'ready-for-plan', 'plan']);
const IN_FLIGHT_STATES = new Set(['develop', 'test', 'review']);
const KNOWN_STATES = new Set([...EARLY_STATES, ...IN_FLIGHT_STATES, 'done']);

export function canonicalLogin(value) {
  const raw = typeof value === 'object' && value !== null ? value.login : value;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function canonicalLogins(assignees) {
  if (!Array.isArray(assignees)) return [];
  return assignees.map(canonicalLogin).filter(Boolean);
}

function verdict(kind, { currentUser, owners, ok = false, action } = {}) {
  return {
    ok,
    ...(action ? { action } : {}),
    kind,
    currentUser,
    owners,
  };
}

export function ownershipDecision({
  state,
  assignees,
  currentUser,
  mode = 'interactive',
  transition = null,
} = {}) {
  const user = canonicalLogin(currentUser);
  const owners = canonicalLogins(assignees);
  const normalizedState = String(state || '')
    .trim()
    .toLowerCase();

  if (!user || !Array.isArray(assignees) || !KNOWN_STATES.has(normalizedState)) {
    return verdict('ownership-unverifiable', { currentUser: user, owners });
  }
  if (owners.length > 1) {
    return verdict('multiple-owners', { currentUser: user, owners });
  }
  if (owners.length === 1 && owners[0] !== user) {
    return verdict('foreign-owner', { currentUser: user, owners });
  }
  if (owners.length === 1) {
    return verdict('owned-by-session', { currentUser: user, owners, ok: true });
  }

  if (normalizedState === 'plan' && transition === 'develop') {
    return verdict(mode === 'full-auto' ? 'claim-at-commitment' : 'assignment-required', {
      currentUser: user,
      owners,
      action: mode === 'full-auto' ? 'claim' : 'prompt',
    });
  }
  if (IN_FLIGHT_STATES.has(normalizedState)) {
    return verdict('human-coordination-required', {
      currentUser: user,
      owners,
      action: 'prompt',
    });
  }
  return verdict('team-unassigned', { currentUser: user, owners, ok: true });
}

export function isPreDevelopState(state) {
  return EARLY_STATES.has(
    String(state || '')
      .trim()
      .toLowerCase()
  );
}

export function isInFlightState(state) {
  return IN_FLIGHT_STATES.has(
    String(state || '')
      .trim()
      .toLowerCase()
  );
}
