// @story #1276
// @parallel-unsafe (#1276) — imported fixture spawns Git subprocesses transitively.

import test from 'node:test';

import '../../fixtures/co-review-finalization-cases.mjs';
import { cleanupTemporaryRoots } from '../../fixtures/co-review-fixture.mjs';

test.afterEach(cleanupTemporaryRoots);
