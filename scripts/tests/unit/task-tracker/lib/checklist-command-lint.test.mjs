// @story #236
// #236 — Tests for the author-time checklist command lint.
//
// Verifies that compound CLI commands in AC `aitm-verified cmd="..."` markers and
// `## Verification Commands` section are rejected before the body reaches
// `gh issue create` / `gh issue edit`, mirroring the `/task test` sandbox.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lintChecklistCommands,
  formatViolations,
  FORBIDDEN_TOKENS,
} from '../../../../task-tracker/lib/checklist-command-lint.mjs';

const CLEAN_BODY = `# Title

## Acceptance Criteria

- [ ] Lints cleanly. <!-- aitm-verified cmd="\`npm run lint\`" -->
- [ ] Tests pass. <!-- aitm-verified cmd="\`npm test\` \`npm run format:check\`" -->

## Verification Commands

- [ ] \`npm run lint\`
- [ ] \`npm test\`
`;

describe('lintChecklistCommands', () => {
  it('passes on a clean body', () => {
    const r = lintChecklistCommands(CLEAN_BODY);
    assert.equal(r.ok, true);
    assert.equal(r.violations.filter((v) => v.severity === 'error').length, 0);
  });

  it('returns ok on empty body', () => {
    const r = lintChecklistCommands('');
    assert.equal(r.ok, true);
    assert.deepEqual(r.violations, []);
  });

  it('accepts multi-command markers (each command separately)', () => {
    const body = `## Acceptance Criteria

- [ ] Multi. <!-- aitm-verified cmd="\`npm run lint\` \`npm test\` \`npm run format:check\`" -->
`;
    const r = lintChecklistCommands(body);
    assert.equal(r.ok, true);
  });

  it('warns when a marker payload has no backtick-quoted command', () => {
    const body = `## Acceptance Criteria

- [ ] Bare. <!-- aitm-verified cmd="npm run lint" -->
`;
    const r = lintChecklistCommands(body);
    assert.equal(r.ok, true);
    const warns = r.violations.filter((v) => v.severity === 'warn');
    assert.equal(warns.length, 1);
    assert.equal(warns[0].rule, 'missing-backticks');
  });

  // #773 — a backtick-free `vc-list="vc:N"` id-citation marker is intentional:
  // its command lives in `## Verification Commands`, not the marker. The
  // missing-backticks author-lint must not warn for it.
  it('does not warn for a backtick-free `vc-list` id-citation marker', () => {
    const body = `## Acceptance Criteria

- [ ] Cited. <!-- aitm-verified vc-list="vc:1 vc:2" -->

## Verification Commands

- [ ] \`node --test a.test.mjs\` <!-- id=1 -->
- [ ] \`node --test b.test.mjs\` <!-- id=2 -->
`;
    const r = lintChecklistCommands(body);
    assert.equal(r.ok, true);
    const warns = r.violations.filter((v) => v.rule === 'missing-backticks');
    assert.equal(warns.length, 0, JSON.stringify(warns));
  });

  // The interim ordinal citation (`cmd="vc:N"`) is likewise backtick-free by
  // design; it must not trip missing-backticks either.
  it('does not warn for a backtick-free ordinal `cmd="vc:N"` citation', () => {
    const body = `## Acceptance Criteria

- [ ] Cited. <!-- aitm-verified cmd="vc:1" -->

## Verification Commands

- [ ] \`node --test a.test.mjs\` <!-- id=1 -->
`;
    const r = lintChecklistCommands(body);
    const warns = r.violations.filter((v) => v.rule === 'missing-backticks');
    assert.equal(warns.length, 0, JSON.stringify(warns));
  });

  it('rejects each FORBIDDEN needle in a VC command', () => {
    for (const { needle, name } of FORBIDDEN_TOKENS) {
      // Skip newline/CR — the parser splits on lines so they can't appear
      // inside a single backtick-quoted command.
      if (needle === '\n' || needle === '\r') continue;
      // backtick inside a backtick-quoted command would close it — VC parser sees a
      // truncated command, so this needle is unreachable through the VC path.
      // Coverage is provided by the AC marker test (markers use HTML comment
      // delimiters, not backticks).
      if (needle === '`') continue;
      const body = `## Verification Commands

- [ ] \`npm test ${needle}rm -rf /\`
`;
      const r = lintChecklistCommands(body);
      const errs = r.violations.filter((v) => v.severity === 'error');
      assert.equal(r.ok, false, `expected rejection for ${name}`);
      assert.ok(
        errs.some((e) => e.section === 'verification-commands' && e.rule === name),
        `expected verification-commands violation with rule "${name}"; got ${JSON.stringify(errs)}`
      );
    }
  });

  it('rejects each FORBIDDEN needle in an AC evidence marker', () => {
    for (const { needle, name } of FORBIDDEN_TOKENS) {
      if (needle === '\n' || needle === '\r') continue;
      // backtick is the marker payload delimiter; if the needle IS a backtick,
      // it would close the inner command — skip (verification-commands path
      // covers it already).
      if (needle === '`') continue;
      const body = `## Acceptance Criteria

- [ ] AC. <!-- aitm-verified cmd="\`npm test ${needle}rm -rf /\`" -->
`;
      const r = lintChecklistCommands(body);
      const errs = r.violations.filter((v) => v.severity === 'error');
      assert.equal(r.ok, false, `expected rejection for ${name} in AC marker`);
      assert.ok(
        errs.some((e) => e.section === 'ac-evidence-marker' && e.rule === name),
        `expected ac-evidence-marker violation with rule "${name}"; got ${JSON.stringify(errs)}`
      );
    }
  });

  it('rejects the classic && compound in both AC and VC', () => {
    const body = `## Acceptance Criteria

- [ ] AC. <!-- aitm-verified cmd="\`npm run lint && npm test\`" -->

## Verification Commands

- [ ] \`npm run lint && npm test\`
`;
    const r = lintChecklistCommands(body);
    assert.equal(r.ok, false);
    const errs = r.violations.filter((v) => v.severity === 'error');
    assert.equal(errs.length, 2);
    assert.ok(errs.some((e) => e.section === 'ac-evidence-marker'));
    assert.ok(errs.some((e) => e.section === 'verification-commands'));
  });

  it('formatViolations emits one line per violation with line numbers', () => {
    const body = `## Verification Commands

- [ ] \`npm test | tee log\`
`;
    const r = lintChecklistCommands(body);
    const lines = formatViolations(r.violations);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /verification-commands:\d+:/);
    assert.match(lines[0], /forbidden pipe/);
  });
});
