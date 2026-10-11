// @story #1987
import test from 'node:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import assert from 'node:assert/strict';
import {
  collectDecompositionAuthority,
  createDecompositionRuntime,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  fixture,
  subject,
  observed,
  unavailable,
  hash,
  publication,
} from './decomposition-authority-fixtures.mjs';
const cfg = { repo: 'o/r', projectId: 'PVT_a' };
const collect = (f) =>
  collectDecompositionAuthority({ subject, cfg, projectDir: process.cwd(), deps: f.deps });
test('effect-free collection computes current input but absent projection denies scoped admission', async () => {
  const f = fixture();
  const r = await collect(f);
  assert.equal(r.assessment.status, 'story-ok');
  assert.equal(r.projection.status, 'absent');
  assert.equal(r.capabilities.includes('scoped-implementation'), false);
  assert.equal(f.writes.length, 0);
  assert.equal(
    typeof createDecompositionRuntime({ cfg, projectDir: process.cwd(), deps: f.deps }).collect,
    'function'
  );
});
test('display ticks proof timing and body revision do not stale semantic identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body =
    f.body
      .replace('- [ ]', '- [x]')
      .replace(
        'Collect current authority.',
        'Collect current authority. <!-- aitm-execution-proof payload="display" -->'
      ) + '\n<!-- aitm-body-version version="99" -->\n## Timing Log\nnew timing row';
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});
for (const [name, change] of [
  [
    'scope',
    (f) =>
      (f.body = f.body.replace(
        'Collect current authority.',
        'Collect current and proposal authority.'
      )),
  ],
  ['verifier', (f) => (f.body = f.body.replace('node verify.mjs', 'node other.mjs'))],
  [
    'criterion',
    (f) =>
      (f.body = f.body.replace(
        'Current inputs must agree.',
        'All inputs and pending intent must agree.'
      )),
  ],
]) {
  test(`semantic ${name} change invalidates old assessment`, async () => {
    const f = fixture();
    const a = await collect(f);
    f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
    change(f);
    const b = await collect(f);
    assert.notEqual(b.inputDigest, a.inputDigest);
    assert.equal(b.projection.status, 'stale');
    assert.equal(b.capabilities.includes('scoped-implementation'), false);
  });
}
for (const port of ['readIssue', 'readProject', 'readSelectedPlan', 'readForecast', 'readPolicy']) {
  test(`unavailable ${port} preserves mandatory estimate signal and denies admission`, async () => {
    const f = fixture(25);
    f.deps[port] = async () => unavailable();
    const r = await collect(f);
    assert.equal(r.assessment.status, 'indeterminate');
    assert.equal(r.capabilities.includes('scoped-implementation'), false);
    if (port !== 'readIssue' && port !== 'readProject')
      assert.equal(
        r.assessment.signals.some((s) => s.code === 'estimate-hours'),
        true
      );
  });
}
test('disagreeing body project and forecast retain higher observed estimate', async () => {
  const f = fixture(7);
  f.values.project.estimate = 25;
  const r = await collect(f);
  assert.equal(r.input.estimate.hours, 25);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('authority-conflict'));
});
test('missing configured membership is unavailable rather than exemption', async () => {
  const f = fixture();
  f.values.project.projectItemId = null;
  assert.equal((await collect(f)).assessment.status, 'indeterminate');
});
for (const marker of [
  '<!-- aitm-issue-kind kind="unknown" -->',
  '<!-- aitm-issue-kind kind="epic" -->\n<!-- aitm-issue-kind kind="code" -->',
  '<!-- aitm-issue-kind kind=code -->',
]) {
  test(`malformed or duplicate explicit kind cannot fall back to code: ${marker}`, async () => {
    const f = fixture();
    f.body += marker;
    assert.equal((await collect(f)).assessment.status, 'indeterminate');
  });
}
test('pending intent fences matching old low authority before any effect', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: a.assessment,
    publication: publication(a.inputDigest),
  });
  const r = await collect(f);
  assert.equal(r.assessment.status, 'pending');
  assert.equal(r.capabilities.includes('scoped-implementation'), false);
  assert.equal(f.writes.length, 0);
});
test('selected exact plan content and named root references bind digest', async () => {
  const f = fixture();
  const content = '### Task 2: Collect authority\nBounded bytes.\n';
  f.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: '### Task 2: Collect authority',
    digest: hash(content),
    availability: 'available',
    content,
    references: 'shared wire bytes',
  };
  const a = await collect(f);
  assert.equal(a.input.plan.content, content);
  assert.equal(a.input.plan.digest, hash(content));
  f.values.plan.references = 'changed wire bytes';
  assert.notEqual((await collect(f)).inputDigest, a.inputDigest);
});
test('dishonest observed digest is unavailable authority', async () => {
  const f = fixture();
  f.deps.readPolicy = async () => ({ ...observed(f.values.policy), digest: '0'.repeat(64) });
  assert.equal((await collect(f)).assessment.status, 'indeterminate');
});

test('ordinary verified proof changes retain declarations and semantic identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = f.body.replace(
    'vc-list="vc:1"',
    'vc-list="vc:1" sha="abc" ts="2026-10-11T12:00:00Z" evidence="verified"'
  );
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});
test('malformed observed policy becomes typed unavailable rather than throwing', async () => {
  const f = fixture();
  f.deps.readPolicy = async () => observed({ policy: 'unknown' });
  const r = await collect(f);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('policy-unavailable'));
});
test('production plan adapter classifies exact pinned selected bytes over dirty working copy', async () => {
  const f = fixture();
  delete f.deps.readSelectedPlan;
  const selected = '### Task 2: Collect authority\n\nBounded selected content.\n';
  const full =
    '# Plan\n## Shared wire and API contracts\nShared bytes.\n## Work\n### Task 1: Other\nOther bytes.\n' +
    selected +
    '## Tail\nTail bytes.\n';
  f.body = f.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
  );
  f.deps.readPlanAtCommit = async (args) => {
    assert.equal(args.planCommit, '1'.repeat(40));
    return full;
  };
  const dir = mkdtempProjectIsolated('decomposition-plan-');
  try {
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs/plan.md'), 'dirty unrelated file');
    const r = await collectDecompositionAuthority({ subject, cfg, projectDir: dir, deps: f.deps });
    assert.equal(r.input.plan.content, selected);
    assert.equal(r.input.plan.digest, hash(selected));
    assert.equal(r.assessment.status, 'story-ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('duplicate records remain distinct from missing authority', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
  f.body += f.body.match(/<!-- aitm-decomposition-assessment[^]*?-->/)[0];
  const r = await collect(f);
  assert.equal(r.projection.status, 'malformed');
  assert.equal(r.assessment.status, 'indeterminate');
});
test('stale displayed status and capabilities are not treated as current projection', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: null });
  f.body = f.body.replace('Status: story-ok', 'Status: must-decompose');
  const r = await collect(f);
  assert.equal(r.projection.status, 'stale');
});

function epicFixture(terminal = false) {
  const f = fixture(25);
  f.body += '<!-- aitm-issue-kind kind="epic" -->';
  const content = '### Task 1: Child authority\n\nRun: `node verify-child.mjs`\n';
  f.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: null,
    digest: hash(content),
    availability: 'available',
    content,
    references: null,
  };
  f.values.project.children = [
    {
      number: 2001,
      title: 'Child authority',
      body:
        '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        '1'.repeat(40) +
        '\n- **Source-plan-section**: ### Task 1: Child authority\n\n<!-- aitm-refinement-snapshot schema="3" digest="' +
        'a'.repeat(64) +
        '" provenance="' +
        'b'.repeat(64) +
        '" priority="P1" size="M" estimate="7" rank="1" ts="2026-10-11T12:00:00Z" -->',
      rank: 1,
      blockedBy: [],
      hasCurrentRefinement: true,
      state: terminal ? 'done' : 'ready-for-plan',
      issueState: terminal ? 'closed' : 'open',
      boardState: terminal ? 'done' : 'ready-for-plan',
      closeReason: terminal ? 'completed' : null,
      recoveryPhase: null,
    },
  ];
  f.deps.readPlanAtCommit = async () => content;
  return f;
}
test('real materialized WBS permits planning while R4P children deny completion', async () => {
  const f = epicFixture();
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.planning, true);
  assert.equal(r.input.epicReadiness.completion, false);
  assert.equal(r.assessment.status, 'epic-readiness-required');
  assert.equal(
    r.assessment.signals.some((s) => s.code === 'estimate-hours'),
    false
  );
});
test('only accepted terminal provider child evidence permits epic completion', async () => {
  const f = epicFixture(true);
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.completion, true);
  f.values.project.children[0].boardState = 'review';
  assert.equal((await collect(f)).input.epicReadiness.completion, false);
});
test('child readiness cannot be supplied as an admission boolean', async () => {
  const f = epicFixture();
  f.values.project.children[0].hasCurrentRefinement = false;
  f.values.project.planning = true;
  const r = await collect(f);
  assert.equal(r.input.epicReadiness.planning, false);
  assert.equal(r.input.epicReadiness.completion, false);
});

test('proof reference IDs and legacy display proof cannot alter semantic admission identity', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = f.body.replace(
    'vc-list="vc:1"',
    'vc-list="vc:1" proof="#123" verified-at="2026-10-11T12:00:00Z"'
  );
  assert.equal((await collect(f)).inputDigest, a.inputDigest);
});

test('dangling VC citation is unavailable scope authority', async () => {
  const f = fixture();
  f.body = f.body.replace('vc-list="vc:1"', 'vc-list="vc:999"');
  const r = await collect(f);
  assert.equal(r.assessment.status, 'indeterminate');
  assert.ok(r.input.availability.reasons.includes('scope-unavailable'));
});
test('declared named root reference cannot become empty valid authority', async () => {
  const f = fixture();
  delete f.deps.readSelectedPlan;
  const content =
    '### Task 2: Collect authority\n\nRead exact root Shared wire and API contracts.\n';
  f.body = f.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
  );
  f.deps.readPlanAtCommit = async () => content;
  const dir = mkdtempProjectIsolated('decomposition-ref-');
  try {
    mkdirSync(path.join(dir, 'docs'));
    writeFileSync(path.join(dir, 'docs/plan.md'), content);
    const r = await collectDecompositionAuthority({ subject, cfg, projectDir: dir, deps: f.deps });
    assert.equal(r.assessment.status, 'indeterminate');
    assert.ok(r.input.availability.reasons.includes('plan-unavailable'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const variant of ['crlf', 'quoted-heading']) {
  test(`selected pinned bytes remain exact with ${variant}`, async () => {
    const f = fixture();
    delete f.deps.readSelectedPlan;
    const selected = '### Task 2: Collect authority\n\nActual selected bytes.\n';
    let full = '# Plan\n## Work\n' + selected + '## Tail\nTail.\n';
    if (variant === 'quoted-heading')
      full =
        '# Plan\n```md\n### Task 2: Collect authority\nFake quoted task.\n```\n## Work\n' +
        selected +
        '## Tail\nTail.\n';
    if (variant === 'crlf') full = full.replaceAll('\n', '\r\n');
    f.body = f.body.replace(
      '## AITM Progress Markers',
      '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
        '1'.repeat(40) +
        '\n- **Source-plan-section**: ### Task 2: Collect authority\n\n## AITM Progress Markers'
    );
    f.deps.readPlanAtCommit = async () => full;
    const dir = mkdtempProjectIsolated('decomposition-bytes-');
    try {
      mkdirSync(path.join(dir, 'docs'));
      writeFileSync(path.join(dir, 'docs/plan.md'), full);
      const r = await collectDecompositionAuthority({
        subject,
        cfg,
        projectDir: dir,
        deps: f.deps,
      });
      assert.equal(
        r.input.plan.content,
        variant === 'crlf' ? selected.replaceAll('\n', '\r\n') : selected
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

for (const field of ['estimate', 'size']) {
  test(`observed missing board ${field} conflicts with published body fields`, async () => {
    const f = fixture();
    f.values.project[field] = null;
    const r = await collect(f);
    assert.equal(r.assessment.status, 'indeterminate');
    assert.ok(r.input.availability.reasons.includes('authority-conflict'));
  });
}
