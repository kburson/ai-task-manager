// @story #1752
import { actionPolicyFor } from '../lifecycle-policy/actions.mjs';
import { forwardTarget } from '../lifecycle-policy/executable-transitions.mjs';

const EARLY_PROMOTE_STATES = new Set(['backlog', 'refine', 'ready-for-plan', 'plan']);

const blocker = (code, args = {}) => ({
  guardId: 'action-navigation',
  code,
  args,
  noAutomaticRemediation: {
    reason:
      code === 'state-unavailable' ? 'state-investigation-required' : 'action-not-explain-ready',
  },
});

const route = (status, target = null, delegate = null, cause = null) => ({
  status,
  target,
  delegate,
  blocker: cause,
});

/** Pure navigation derived from the executable lifecycle policy, never a grant. */
export function resolveActionNavigation({ actionId, state } = {}) {
  const recorded = typeof state === 'object' && state !== null ? state.recorded : state;
  const live = typeof state === 'object' && state !== null ? state.live : recorded;
  const policy = actionPolicyFor(actionId, recorded);
  if (recorded === 'done' && recorded === live) return route('terminal');
  if (policy.kind === 'unknown-action') {
    return route('indeterminate', null, null, blocker('unknown-vocabulary'));
  }
  if (recorded !== live) {
    return route(
      'indeterminate',
      null,
      null,
      blocker('state-unavailable', { reason: 'conflicting' })
    );
  }
  if (policy.kind === 'unknown-state' || policy.kind === 'bootstrap') {
    return route('indeterminate', null, null, blocker('state-unavailable', { reason: 'unknown' }));
  }
  if (!policy.ok) {
    return route('pending', policy.target ?? null, null, blocker('action-not-explain-ready'));
  }
  if (actionId === 'bind' || actionId === 'resume') return route('ready');
  if (actionId === 'test') {
    return recorded === 'develop' || recorded === 'test'
      ? route('ready', 'test')
      : route('pending', 'test', null, blocker('action-not-explain-ready'));
  }
  if (actionId === 'review') {
    return recorded === 'test' || recorded === 'review'
      ? route('ready', 'review', 'review')
      : route('pending', 'review', null, blocker('action-not-explain-ready'));
  }
  if (actionId === 'deliver') return route('ready', 'deliver', 'deliver');
  if (actionId !== 'promote') {
    return route('pending', policy.target ?? null, null, blocker('action-not-explain-ready'));
  }
  const target = forwardTarget(recorded);
  if (!target || policy.target !== target) {
    return route(
      'indeterminate',
      null,
      null,
      blocker('state-unavailable', { reason: 'conflicting' })
    );
  }
  if (!EARLY_PROMOTE_STATES.has(recorded)) {
    if (recorded === 'develop' && target === 'test' && policy.delegate === 'test') {
      return route('ready', target, 'test');
    }
    if (recorded === 'test' && target === 'review' && policy.delegate === 'review') {
      return route('ready', target, 'review');
    }
    if (recorded === 'review' && target === 'done' && policy.delegate === 'close') {
      return route('ready', 'review', 'review');
    }
    return route('pending', target, policy.delegate ?? null, blocker('action-not-explain-ready'));
  }
  return route('ready', target);
}
