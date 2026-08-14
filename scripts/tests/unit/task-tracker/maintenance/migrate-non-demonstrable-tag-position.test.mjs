#!/usr/bin/env node
// @story #891
// Unit tests for the pure-function core of the
// migrate-non-demonstrable-tag-position maintenance script:
// findLegacyNonDemonstrableAcs + migrateBody.
import { strict as assert } from 'node:assert';
import {
  CANONICAL_MARKER,
  findLegacyNonDemonstrableAcs,
  migrateBody,
} from '../../../../maintenance/lib/migrate-non-demonstrable-tag-position-core.mjs';

const HEAD = '## Acceptance Criteria\n\n';
const TAIL = '\n\n## Verification Commands\n\n- `node --test foo.test.mjs`\n';

// 1. A legacy prose-tagged AC line is found and migrated: the marker is
//    appended, and the original prose is left intact (additive, not lossy).
{
  const body = HEAD + '- [ ] Subjective quality goal — invalid — non-demonstrable' + TAIL;
  const offenders = findLegacyNonDemonstrableAcs(body);
  assert.equal(offenders.length, 1);
  assert.match(offenders[0].label, /invalid — non-demonstrable/);

  const { changed, next, migrated } = migrateBody(body);
  assert.equal(changed, true);
  assert.equal(migrated.length, 1);
  assert.match(next, /invalid — non-demonstrable/); // original prose preserved
  assert.match(next, /<!-- aitm-non-demonstrable -->/);
  const line = next.split('\n').find((l) => l.includes('Subjective quality goal'));
  assert.equal(
    line,
    `- [ ] Subjective quality goal — invalid — non-demonstrable ${CANONICAL_MARKER}`
  );
}

// 2. A line already carrying the canonical marker is left alone — no
//    double-stamping on re-run (idempotency).
{
  const body =
    HEAD + `- [ ] alpha — tagged \`invalid — non-demonstrable\` ${CANONICAL_MARKER}` + TAIL;
  assert.equal(findLegacyNonDemonstrableAcs(body).length, 0);
  const { changed, next } = migrateBody(body);
  assert.equal(changed, false);
  assert.equal(next, body);
}

// 3. A second migrateBody() pass over already-migrated output is a no-op.
{
  const body = HEAD + '- [ ] beta — tagged `invalid — non-demonstrable`' + TAIL;
  const first = migrateBody(body);
  assert.equal(first.changed, true);
  const second = migrateBody(first.next);
  assert.equal(second.changed, false);
  assert.equal(second.next, first.next);
}

// 4. An AC with no legacy prose is untouched.
{
  const body = HEAD + '- [ ] gamma <!-- aitm-verified cmd="`node --test foo.test.mjs`" -->' + TAIL;
  assert.equal(findLegacyNonDemonstrableAcs(body).length, 0);
  assert.equal(migrateBody(body).changed, false);
}

// 5. Multiple legacy AC lines in one body are all migrated.
{
  const body =
    HEAD +
    '- [ ] one — invalid — non-demonstrable\n' +
    '- [x] two <!-- aitm-verified cmd="`node --test bar.test.mjs`" -->\n' +
    '- [ ] three — invalid — non-demonstrable' +
    TAIL;
  const { changed, migrated, next } = migrateBody(body);
  assert.equal(changed, true);
  assert.equal(migrated.length, 2);
  assert.equal((next.match(/<!-- aitm-non-demonstrable -->/g) || []).length, 2);
}

// 6. A body with no Acceptance Criteria section at all is untouched.
{
  const body = '## Description\n\nnothing here — invalid — non-demonstrable\n';
  assert.equal(findLegacyNonDemonstrableAcs(body).length, 0);
  assert.equal(migrateBody(body).changed, false);
}

console.log('migrate-non-demonstrable-tag-position.test.mjs: all assertions passed');
