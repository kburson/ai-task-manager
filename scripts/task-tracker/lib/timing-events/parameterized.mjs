import { stateIds } from '../lifecycle-policy/index.mjs';
import { EVENT_CLASS } from './catalog.mjs';

const STATES = new Set(stateIds());
const REASON_RE = /^[a-z0-9][a-z0-9-]*$/;

function result(event, name, kind, eventClass, extra = {}) {
  return Object.freeze({
    event,
    family: 'parameterized',
    name,
    kind,
    eventClass,
    stage: null,
    phase: null,
    description: '',
    emittable: true,
    legacy: false,
    retired: false,
    canonicalPhase: kind === 'audit',
    role: null,
    interruptionKind: null,
    terminalReviewHandoffCloser: false,
    ...extra,
  });
}

export function describeParameterizedTimingEvent(event) {
  let match = event.match(/^demoted:([a-z-]+)$/);
  if (match && STATES.has(match[1])) {
    return result(event, 'demoted-target', 'audit', EVENT_CLASS.PHASE, {
      target: match[1],
      terminalReviewHandoffCloser: match[1] === 'develop',
    });
  }

  match = event.match(/^pause:(.+)$/);
  if (match && REASON_RE.test(match[1])) {
    return result(event, 'pause-reason', 'departure', EVENT_CLASS.DEPARTURE, {
      role: 'open',
      interruptionKind: 'pause',
      reason: match[1],
    });
  }

  match = event.match(/^resume:(.+)$/);
  if (match && REASON_RE.test(match[1])) {
    return result(event, 'resume-reason', 'reengagement', EVENT_CLASS.REENGAGEMENT, {
      role: 'close',
      reason: match[1],
    });
  }

  match = event.match(/^switch-out:#([1-9]\d*)$/);
  if (match) {
    return result(event, 'switch-out-issue', 'departure', EVENT_CLASS.DEPARTURE, {
      role: 'open',
      interruptionKind: 'switch-out',
      peer: `#${match[1]}`,
    });
  }

  return null;
}
