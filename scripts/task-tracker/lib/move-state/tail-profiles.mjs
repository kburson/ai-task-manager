export const TAIL_PROFILE_TASK_OWNER = 'task-owner';
export const TAIL_PROFILE_BACKGROUND_CONVERGENCE = 'background-convergence';

const PROFILE_SCOPES = Object.freeze({
  [TAIL_PROFILE_TASK_OWNER]: Object.freeze(['issue', 'project', 'session']),
  [TAIL_PROFILE_BACKGROUND_CONVERGENCE]: Object.freeze(['issue', 'project']),
});

export function resolveTailProfile(name = TAIL_PROFILE_TASK_OWNER) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('invalid move-tail profile: expected a non-empty string');
  }
  const scopes = PROFILE_SCOPES[name];
  if (!scopes) throw new Error(`unknown move-tail profile: ${name}`);
  return { name, scopes };
}

export function selectTailSteps(steps, profileName) {
  const { scopes } = resolveTailProfile(profileName);
  const allowed = new Set(scopes);
  return (steps || []).filter((step) => allowed.has(step.scope || 'issue'));
}
