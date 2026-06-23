// @story #502
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deriveAndRescan } from '../../lib/review-derive-rescan.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const VERB_DIR = path.resolve(__dir, '../../verbs');

// The live (post-derive) body the gate SHOULD scan: acs + checkboxes ticked.
const LIVE_TICKED_BODY = [
  '## Definition of Done',
  '- [x] `dod:functional:tests`',
  '- [x] `dod:functional:lint`',
  '- [x] `dod:functional:commits`',
  '- [x] `dod:functional:acs`',
  '- [x] `dod:functional:checkboxes`',
].join('\n');

// The stale pre-derive body the bug used to scan: acs + checkboxes UN-ticked.
const STALE_BODY = LIVE_TICKED_BODY.replace(
  '- [x] `dod:functional:acs`',
  '- [ ] `dod:functional:acs`'
).replace('- [x] `dod:functional:checkboxes`', '- [ ] `dod:functional:checkboxes`');

// pexec stub: `gh issue view` returns the live ticked body; `git rev-parse`
// returns a sha. `ghViewError`/`revParseError` opt those calls into throwing.
function makePexec({ ghViewError = null, revParseError = null } = {}) {
  return async (bin, args = []) => {
    if (bin === 'git' && args[0] === 'rev-parse') {
      if (revParseError) throw revParseError;
      return { stdout: 'abc1234\n' };
    }
    if (bin === 'gh' && args[0] === 'issue' && args[1] === 'view') {
      if (ghViewError) throw ghViewError;
      return { stdout: LIVE_TICKED_BODY };
    }
    throw new Error(`unexpected pexec call: ${bin} ${args.join(' ')}`);
  };
}

function makeLog() {
  const lines = [];
  return { log: (m) => lines.push(String(m)), lines };
}

test('deriveAndRescan: derive throws → failure is logged AND live ticked body is returned', async () => {
  const { log, lines } = makeLog();
  const deriveAndStampFunctionalDod = async () => {
    throw new Error('boom: version conflict');
  };
  const out = await deriveAndRescan({
    issueNumber: 502,
    repo: 'o/r',
    scanBody: STALE_BODY,
    deps: {
      pexec: makePexec(),
      deriveAndStampFunctionalDod,
      nowIso: () => '2026-06-23T00:00:00Z',
      log,
    },
  });

  // AC1 — the swallow is now observable.
  assert.equal(
    out.errors.some((e) => e.phase === 'derive'),
    true
  );
  assert.ok(
    lines.some((l) => l.includes('derive pass failed')),
    'expected a diagnostic log line for the derive failure'
  );
  // AC2 — the gate scans the live (ticked) body despite the derive throwing.
  assert.equal(out.scanBody, LIVE_TICKED_BODY);
  assert.ok(out.scanBody.includes('- [x] `dod:functional:acs`'));
  assert.ok(out.scanBody.includes('- [x] `dod:functional:checkboxes`'));
});

test('deriveAndRescan: derive returns noop → live ticked body is still returned', async () => {
  const { log } = makeLog();
  const deriveAndStampFunctionalDod = async () => ({ status: 'noop' });
  const out = await deriveAndRescan({
    issueNumber: 502,
    repo: 'o/r',
    scanBody: STALE_BODY,
    deps: {
      pexec: makePexec(),
      deriveAndStampFunctionalDod,
      nowIso: () => '2026-06-23T00:00:00Z',
      log,
    },
  });

  // AC2 — noop must NOT leave the scan on the stale body.
  assert.equal(out.scanBody, LIVE_TICKED_BODY);
  assert.deepEqual(out.errors, []);
  assert.equal(out.derived.status, 'noop');
});

test('deriveAndRescan: derive ok → live ticked body returned', async () => {
  const { log } = makeLog();
  const deriveAndStampFunctionalDod = async () => ({ status: 'ok' });
  const out = await deriveAndRescan({
    issueNumber: 502,
    repo: 'o/r',
    scanBody: STALE_BODY,
    deps: {
      pexec: makePexec(),
      deriveAndStampFunctionalDod,
      nowIso: () => '2026-06-23T00:00:00Z',
      log,
    },
  });
  assert.equal(out.scanBody, LIVE_TICKED_BODY);
  assert.equal(out.derived.status, 'ok');
});

test('deriveAndRescan: live refresh throws → diagnostic logged AND falls back to pre-derive body', async () => {
  const { log, lines } = makeLog();
  const deriveAndStampFunctionalDod = async () => ({ status: 'ok' });
  const out = await deriveAndRescan({
    issueNumber: 502,
    repo: 'o/r',
    scanBody: STALE_BODY,
    deps: {
      pexec: makePexec({ ghViewError: new Error('network down') }),
      deriveAndStampFunctionalDod,
      nowIso: () => '2026-06-23T00:00:00Z',
      log,
    },
  });
  // No crash; falls back to the caller's body.
  assert.equal(out.scanBody, STALE_BODY);
  assert.equal(
    out.errors.some((e) => e.phase === 'refresh'),
    true
  );
  assert.ok(lines.some((l) => l.includes('live-body refresh failed')));
});

// #502 — the bug reproduces through BOTH callers of the test→review pre-close
// completeness guard: `verbs/review.mjs` AND `verbs/promote.mjs`. The original
// fix wired the derive into review.mjs only; promote.mjs (the `/task promote`
// path) still scanned the un-derived body and falsely refused on acs/checkboxes.
// These structural assertions ensure both call-sites run the derive+rescan
// before the guard, gated to the test→review transition.
for (const verb of ['review.mjs', 'promote.mjs']) {
  test(`${verb} wires deriveAndRescan before the test→review completeness guard`, () => {
    const src = readFileSync(path.join(VERB_DIR, verb), 'utf8');
    assert.ok(
      /import\s*\{\s*deriveAndRescan\s*\}\s*from\s*'\.\.\/lib\/review-derive-rescan\.mjs'/.test(
        src
      ),
      `${verb} should import deriveAndRescan`
    );
    assert.ok(src.includes('deriveAndRescan('), `${verb} should call deriveAndRescan`);
  });
}

test('promote.mjs gates the derive to the test→review transition only', () => {
  const src = readFileSync(path.join(VERB_DIR, 'promote.mjs'), 'utf8');
  assert.ok(
    /recorded === 'test' && target === 'review'/.test(src),
    'promote.mjs should only run the derive on the test→review transition'
  );
});

test('deriveAndRescan: missing required deps throws', async () => {
  await assert.rejects(
    () => deriveAndRescan({ issueNumber: 1, repo: 'o/r', deps: {} }),
    /pexec is required/
  );
  await assert.rejects(
    () => deriveAndRescan({ issueNumber: 1, repo: 'o/r', deps: { pexec: async () => ({}) } }),
    /deriveAndStampFunctionalDod is required/
  );
});
