#!/usr/bin/env node
// @story #681
// Kind-aware Definition-of-Done: no-code kinds (spike/research) omit the
// code-oriented `tests` DoD item and its derived two-lane (`npm test` +
// `npm run test:slow`) verification commands, while code kinds render a
// byte-identical DoD.
//
// This file is the verifier bound to all seven ACs of #681:
//   AC1  declarative per-item kind annotation + documented default
//   AC2  preflight filters DoD by resolved kind; VC derivation runs over survivors
//   AC3  `tests` excluded for spike/research; lint/commits/acs/checkboxes for all
//   AC4  filtered body has no phantom-required Functional key (check/close contract)
//   AC5  documentation ships (template inline comment + functional-dod.md)
//   AC6  back-compat: code/default renders byte-identical DoD tail + VC
//   AC7  render-by-kind coverage: code keeps the two-lane test commands;
//        spike/research omit them

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';
import {
  parseDodKindsAnnotation,
  dodLineAppliesToKind,
  filterDodForKind,
} from '../../../task-tracker/lib/dod-kind-filter.mjs';
import { parseFunctionalDodKeys } from '../../../task-tracker/lib/functional-dod-evidence.mjs';

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../../../task-tracker/preflight-issue.mjs');
const REPO_ROOT = path.resolve(HERE, '../../../..');
const RUNTIME_DOD = path.join(REPO_ROOT, '.ai-task-manager', 'templates', 'definition-of-done.md');
const PACKAGED_DOD = path.join(REPO_ROOT, 'templates', 'definition-of-done.md');
const CONTRACT_DOC = path.join(REPO_ROOT, 'skill', 'shared', 'rules', 'functional-dod.md');

function makeFixture(kind = 'code') {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'kind-aware-dod-'));
  const story = path.join(dir, 'story.md');
  const scope = path.join(dir, 'scope.md');
  const ac = path.join(dir, 'ac.md');
  const vc = path.join(dir, 'vc.md');
  const origin = path.join(dir, 'origin.md');
  const meta = path.join(dir, 'meta.md');
  writeFileSync(scope, 'Scope.\n', 'utf8');
  writeFileSync(
    story,
    'As a task author\nI want to create kind-aware issue bodies\nSo that each issue carries the correct verification floor\n',
    'utf8'
  );
  writeFileSync(ac, '- [ ] Something happens. <!-- aitm-verified vc-list="vc:1" -->\n', 'utf8');
  writeFileSync(vc, 'node --test x.mjs\n', 'utf8');
  writeFileSync(origin, `- **kind**: ${kind}\n`, 'utf8');
  writeFileSync(meta, '- **Size**: M\n', 'utf8');
  return { dir, story, scope, ac, vc, origin, meta };
}

async function runPreflight(args) {
  try {
    const { stdout, stderr } = await pexec('node', [SCRIPT, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function subIssueArgs(fx, extra = []) {
  return [
    '--shape',
    'sub-issue',
    '--parent',
    '1',
    '--user-story-file',
    fx.story,
    '--scope-file',
    fx.scope,
    '--ac-file',
    fx.ac,
    '--verification-commands-file',
    fx.vc,
    '--story-origin-file',
    fx.origin,
    '--plan-metadata-file',
    fx.meta,
    ...extra,
  ];
}

// The DoD tail slice preflight injects, for direct filter assertions.
const RUNTIME_DOD_TEXT = readFileSync(RUNTIME_DOD, 'utf8').replace(/\s+$/, '');

// ---------------------------------------------------------------------------
// AC1 — declarative per-item annotation + documented default
// ---------------------------------------------------------------------------
describe('AC1: dod:kinds annotation grammar + default', () => {
  it('parses exclude / include and returns null for unannotated lines', () => {
    assert.deepEqual(
      parseDodKindsAnnotation('- [ ] x <!-- dod:kinds exclude="spike,research" -->'),
      { mode: 'exclude', kinds: ['spike', 'research'] }
    );
    assert.deepEqual(parseDodKindsAnnotation('- [ ] x <!-- dod:kinds include="code" -->'), {
      mode: 'include',
      kinds: ['code'],
    });
    assert.equal(parseDodKindsAnnotation('- [ ] x <!-- dod:functional:lint -->'), null);
  });

  it('unannotated item applies to every kind (documented default)', () => {
    const line = '- [ ] Lint <!-- dod:functional:lint -->';
    for (const k of ['code', 'spike', 'research', 'audit', 'epic']) {
      assert.equal(dodLineAppliesToKind(line, k), true, `kind=${k}`);
    }
  });

  it('exclude renders for all-but-listed; include renders only-if-listed', () => {
    const excl = '- [ ] t <!-- dod:kinds exclude="spike,research" -->';
    assert.equal(dodLineAppliesToKind(excl, 'code'), true);
    assert.equal(dodLineAppliesToKind(excl, 'spike'), false);
    assert.equal(dodLineAppliesToKind(excl, 'research'), false);
    const incl = '- [ ] t <!-- dod:kinds include="code" -->';
    assert.equal(dodLineAppliesToKind(incl, 'code'), true);
    assert.equal(dodLineAppliesToKind(incl, 'spike'), false);
  });
});

// ---------------------------------------------------------------------------
// AC3 — the `tests` item and BOTH kind-split `commits` items are annotated in
// the real template (#883 split `commits` into a non-epic `git log` line and an
// epic-only derived-trail line); lint/acs/checkboxes stay kind-agnostic.
// ---------------------------------------------------------------------------
describe('AC3: template annotation is scoped to the tests + split commits items', () => {
  it('tests + kind-split commits lines carry annotations; lint/acs/checkboxes stay kind-agnostic', () => {
    for (const dodPath of [RUNTIME_DOD, PACKAGED_DOD]) {
      const text = readFileSync(dodPath, 'utf8');
      const lines = text.split('\n');

      const testsLine = lines.find((l) => l.includes('dod:functional:tests'));
      assert.ok(testsLine, `tests line present in ${dodPath}`);
      assert.match(testsLine, /dod:kinds\s+exclude="spike,research"/);

      // `commits` is now two kind-scoped lines sharing one functional key: the
      // non-epic `git log` line (exclude="epic") and the epic-only derived-trail
      // line (include="epic").
      const gitLogCommitsLine = lines.find(
        (l) => l.includes('dod:functional:commits') && l.includes('git log')
      );
      assert.ok(gitLogCommitsLine, `git-log commits line present in ${dodPath}`);
      assert.match(gitLogCommitsLine, /dod:kinds\s+exclude="epic"/);

      const epicTrailLine = lines.find(
        (l) => l.includes('dod:functional:commits') && l.includes('verify-epic-trail')
      );
      assert.ok(epicTrailLine, `epic-trail commits line present in ${dodPath}`);
      assert.match(epicTrailLine, /dod:kinds\s+include="epic"/);

      for (const key of ['lint', 'acs', 'checkboxes']) {
        const line = lines.find((l) => l.includes(`dod:functional:${key}`));
        assert.ok(line, `${key} line present`);
        assert.doesNotMatch(line, /dod:kinds/, `${key} must stay kind-agnostic`);
      }
    }
  });

  it('packaged and runtime DoD templates are byte-identical', () => {
    assert.equal(readFileSync(PACKAGED_DOD, 'utf8'), readFileSync(RUNTIME_DOD, 'utf8'));
  });
});

// ---------------------------------------------------------------------------
// AC2 + AC7 — preflight render-by-kind
// ---------------------------------------------------------------------------
describe('AC2/AC7: preflight filters DoD + derived VC by kind', () => {
  it('code (default) renders the tests item AND its two-lane verification commands', async () => {
    const fx = makeFixture();
    try {
      const r = await runPreflight(subIssueArgs(fx));
      assert.equal(r.code, 0, r.stderr);
      assert.match(r.stdout, /dod:functional:tests/);
      assert.match(r.stdout, /## Verification Commands/);
      assert.match(r.stdout, /- \[ \] `npm test`/);
      assert.match(r.stdout, /- \[ \] `npm run test:slow`/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  for (const kind of ['spike', 'research']) {
    it(`${kind} omits the tests item AND drops its derived test commands`, async () => {
      const fx = makeFixture(kind);
      try {
        const r = await runPreflight(subIssueArgs(fx, ['--kind', kind]));
        assert.equal(r.code, 0, r.stderr);
        assert.doesNotMatch(r.stdout, /dod:functional:tests/);
        // the derived VC checkbox for the tests item must be gone (the DoD
        // header comment still *mentions* the commands, so scope to the VC line);
        // `test:slow` is unique to the tests item, so its absence proves the drop
        assert.doesNotMatch(r.stdout, /- \[ \] `npm run test:slow`/);
        // the other Functional items still render
        for (const key of ['lint', 'commits', 'acs', 'checkboxes']) {
          assert.match(r.stdout, new RegExp(`dod:functional:${key}`), `${key} must survive`);
        }
      } finally {
        rmSync(fx.dir, { recursive: true, force: true });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// AC4 — a filtered body yields no phantom-required Functional key
// ---------------------------------------------------------------------------
describe('AC4: check/close enumeration is body-derived; no phantom key', () => {
  it('filtered spike DoD has no `tests` key from parseFunctionalDodKeys', () => {
    const filtered = filterDodForKind(RUNTIME_DOD_TEXT, 'spike');
    const keys = parseFunctionalDodKeys(filtered).map((it) => it.key);
    assert.ok(!keys.includes('tests'), `keys: ${keys.join(',')}`);
    // the derived + other stampable keys remain enumerable
    for (const key of ['lint', 'commits', 'acs', 'checkboxes']) {
      assert.ok(keys.includes(key), `${key} must remain a Functional key`);
    }
  });

  it('code DoD still enumerates the `tests` key', () => {
    const keys = parseFunctionalDodKeys(filterDodForKind(RUNTIME_DOD_TEXT, 'code')).map(
      (it) => it.key
    );
    assert.ok(keys.includes('tests'));
  });
});

// ---------------------------------------------------------------------------
// AC6 — code-kind back-compat: the code kind still renders every non-epic item.
// Since #883 added an epic-only derived-trail line (include="epic"), the code
// filter drops exactly that one line and nothing else; default === --kind code.
// ---------------------------------------------------------------------------
describe('AC6: code-kind back-compat', () => {
  it('filterDodForKind drops only the epic-only derived-trail line for the code kind', () => {
    const filtered = filterDodForKind(RUNTIME_DOD_TEXT, 'code');
    // the epic-only derived-trail line is the sole removal
    assert.doesNotMatch(filtered, /verify-epic-trail/);
    assert.doesNotMatch(filtered, /include="epic"/);
    // every other item survives, including the non-epic git-log commits line
    assert.match(filtered, /dod:functional:tests/);
    assert.match(filtered, /git log --oneline -1/);
    assert.match(filtered, /dod:functional:lint/);
    assert.match(filtered, /dod:functional:acs/);
    assert.match(filtered, /dod:functional:checkboxes/);
    // exactly the include="epic" line, and only it, is filtered out
    const expected = RUNTIME_DOD_TEXT.split('\n')
      .filter((l) => !l.includes('include="epic"'))
      .join('\n');
    assert.equal(filtered, expected);
  });

  it('default output === explicit --kind code output, for each shape', async () => {
    for (const shapeArgs of [['sub-issue', '--parent', '1'], ['epic'], ['solo']]) {
      const fx = makeFixture();
      try {
        const base = [
          '--shape',
          shapeArgs[0],
          ...shapeArgs.slice(1),
          '--user-story-file',
          fx.story,
          '--scope-file',
          fx.scope,
          '--ac-file',
          fx.ac,
          '--verification-commands-file',
          fx.vc,
          '--story-origin-file',
          fx.origin,
          '--plan-metadata-file',
          fx.meta,
        ];
        const def = await runPreflight(base);
        const code = await runPreflight([...base, '--kind', 'code']);
        assert.equal(def.code, 0, def.stderr);
        assert.equal(code.code, 0, code.stderr);
        assert.equal(def.stdout, code.stdout, `shape ${shapeArgs[0]} byte-identical`);
        assert.match(def.stdout, /dod:functional:tests/);
        assert.match(def.stdout, /- \[ \] `npm test`/);
        assert.match(def.stdout, /- \[ \] `npm run test:slow`/);
      } finally {
        rmSync(fx.dir, { recursive: true, force: true });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC5 — documentation ships with the mechanism
// ---------------------------------------------------------------------------
describe('AC5: documentation ships', () => {
  it('both DoD templates carry an inline comment explaining the annotation', () => {
    for (const dodPath of [RUNTIME_DOD, PACKAGED_DOD]) {
      const text = readFileSync(dodPath, 'utf8');
      assert.match(text, /Kind-aware items \(#681\)/);
      assert.match(text, /dod:kinds/);
      assert.match(text, /exclude="spike,research"/);
    }
  });

  it('functional-dod.md documents syntax, precedence, and rationale', () => {
    const doc = readFileSync(CONTRACT_DOC, 'utf8');
    assert.match(doc, /Kind-aware items \(#681\)/);
    assert.match(doc, /exclude="a,b"/);
    assert.match(doc, /include="a,b"/);
    assert.match(doc, /no phantom-required key/);
  });
});
