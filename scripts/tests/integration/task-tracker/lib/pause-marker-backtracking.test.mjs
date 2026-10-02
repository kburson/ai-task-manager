// @story #1857
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const F = '2026-08-05T01:00:00Z';
const U = '2026-08-05T01:20:00Z';
test('parsePauseMarkers: malformed key chains finish within a bounded subprocess', () => {
  const moduleUrl = new URL('../../../../task-tracker/lib/timing-rows.mjs', import.meta.url).href;
  const script = `
    import { parsePauseMarkers } from ${JSON.stringify(moduleUrl)};
    import assert from 'node:assert/strict';
    const malformed = '<!-- aitm-pause: from=${F} until=${U} a=' + '!a='.repeat(100000);
    assert.deepEqual(parsePauseMarkers(malformed), []);
    const valid = '<!-- aitm-pause: until=${U} reason=question from=${F} -->';
    assert.equal(parsePauseMarkers(malformed + '> ' + valid).length, 1);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 2000,
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined, `parser subprocess failed: ${result.error}`);
  assert.equal(result.status, 0, result.stderr);
});
