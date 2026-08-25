// @story #1276
import test from 'node:test';

import '../../fixtures/co-review-finalization-cases.mjs';
import { cleanupTemporaryRoots } from '../../fixtures/co-review-fixture.mjs';

test.afterEach(cleanupTemporaryRoots);
