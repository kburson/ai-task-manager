// @story #2093 #2105
// Offline CLI refusal fixture; any GitHub traffic is an unexpected effect.
import { mock } from 'node:test';
import { appendFileSync } from 'node:fs';
import * as github from '../../gh/lib/gh-client.mjs';
function unexpected() {
  appendFileSync(process.env.AITM_BRANCH_EXTERNAL_LOG, 'unexpected GitHub traffic\n');
  throw new Error('unexpected GitHub traffic before refusal');
}
mock.module(new URL('../../gh/lib/gh-client.mjs', import.meta.url).href, {
  namedExports: {
    ...github,
    pexec: unexpected,
    ghClient: { execFile: unexpected, spawn: unexpected, pexec: unexpected },
  },
});
