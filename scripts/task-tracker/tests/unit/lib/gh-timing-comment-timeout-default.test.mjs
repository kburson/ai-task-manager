// @story #1107
import assert from 'node:assert/strict';

import { DEFAULTS } from '../../../config.mjs';

const timingComment = await import('../../../gh-timing-comment.mjs');

assert.equal(
  timingComment.GH_TIMING_COMMENT_TIMEOUT_MS,
  10_000,
  'the timing-comment gh default must give mature issue comment fetches 10 seconds'
);
assert.equal(
  DEFAULTS.hookNetworkTimeoutMs,
  timingComment.GH_TIMING_COMMENT_TIMEOUT_MS,
  'runtime callers and direct ghExec callers must share the same timeout ceiling'
);

console.log('gh-timing-comment-timeout-default.test.mjs: all passed');
