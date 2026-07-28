// State object: done (#292).
//
// Done is the terminal state: no forward exit. Entry guards (the
// post-close timing flush and the parent-cannot-close-before-children
// invariant) currently live in `verbs/close.mjs`. They migrate into this
// module's entry list via sub-issue #279.
//
// `exitGuards` is intentionally empty: `done` has no canonical forward
// successor in `FORWARD_CHAIN`. Historical backward edges out of `done`
// (e.g. `done → plan`) remain non-executable until a future issue widens the
// canonical lifecycle policy.

import { bodyGatesEntryGuardDone } from '../lib/body-gates-entry-guard.mjs';

export default Object.freeze({
  name: 'done',
  entryGuards: Object.freeze([bodyGatesEntryGuardDone]),
  exitGuards: Object.freeze([]),
  onEnter: Object.freeze([]),
});
