// Test-only re-export surface for gh-timing-comment.mjs internals.
//
// Production code MUST NOT import from this module — only test files under
// `tests/` should reach in here. Anything that needs these symbols at
// runtime should call `postTimingEvent` (the public seam) instead.
//
// To keep the public surface of `gh-timing-comment.mjs` minimal, the
// following names are not part of the public named-export surface of that
// module. They are exposed via its `__internals` namespace and re-named
// here strictly so the existing tests can keep verifying the row format,
// GH shell-out shape, and retroactive-ts error contract.
import { __internals } from './gh-timing-comment.mjs';

export const TIMING_HEADING = __internals.TIMING_HEADING;
export const RETROACTIVE_TS_ERROR = __internals.RETROACTIVE_TS_ERROR;
export const buildInitialComment = __internals.buildInitialComment;
export const appendRow = __internals.appendRow;
export const findTimingComment = __internals.findTimingComment;
export const createTimingComment = __internals.createTimingComment;
export const updateTimingComment = __internals.updateTimingComment;
