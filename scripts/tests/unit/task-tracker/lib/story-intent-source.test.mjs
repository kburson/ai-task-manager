// @story #1711
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as source from '../../../../task-tracker/lib/story-intent-source.mjs';
import { validateGovernedLinkedPlan } from '../../../../task-tracker/lib/governed-plan-policy.mjs';

const story =
  '## User Story\n\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n';
const intent =
  '- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n';
const deep = `${story}\n## Deep-Dive Analysis\n\n### Story Intent\n${intent}`;
const linked = (selector = '') =>
  `${story}\n## Plan Metadata\n- **Source-plan**: docs/plan.md\n${selector}`;
function fixture(t, content) {
  const root = mkdtempSync(path.join(projectScratchDir('test', process.cwd()), 'intent-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/plan.md'), content);
  return root;
}
test('adapter is available without an arbitrary read-path override', () => {
  assert.equal(typeof source.resolveStoryIntentSource, 'function');
});
test('resolves deep-dive and validates prose and rendered intent quality', () => {
  const result = source.resolveStoryIntentSource({ body: deep, projectDir: '.' });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'deep-dive');
  assert.match(result.binding.storyDigest, /^[a-f0-9]{64}$/);
  assert.match(result.binding.storyIntentDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    source.resolveStoryIntentSource({
      body: deep.replace('As a release operator', 'As a governed agent'),
      projectDir: '.',
    }).violations[0].code,
    'story-administrative-beneficiary'
  );
  assert.equal(
    source.resolveStoryIntentSource({
      body: deep.replace('**Beneficiary:** release operator', '**Beneficiary:** governed agent'),
      projectDir: '.',
    }).ok,
    false
  );
});
test('resolves current root and exact task bytes irrespective of pinned commit', (t) => {
  const root = fixture(
    t,
    `## Story Intent\n${intent}\n## Tasks\n### Task 3: Publish\n#### Story Intent\n${intent.replace('release operator', 'registry maintainer')}`
  );
  const rootResult = source.resolveStoryIntentSource({ body: linked(), projectDir: root });
  assert.equal(rootResult.source, 'linked-plan');
  const body = linked(
    '- **Source-plan-section**: ### Task 3: Publish\n- **Source-plan-commit**: aaaaaaa\n'
  );
  const task = source.resolveStoryIntentSource({ body, projectDir: root });
  assert.equal(task.source, 'linked-plan-task');
  assert.equal(task.intent.beneficiary, 'registry maintainer');
  assert.deepEqual(
    source.resolveStoryIntentSource({ body: body.replace('aaaaaaa', 'bbbbbbb'), projectDir: root })
      .binding,
    task.binding
  );
  writeFileSync(path.join(root, 'docs/plan.md'), 'malformed current B');
  assert.equal(source.resolveStoryIntentSource({ body, projectDir: root }).ok, false);
});
test('shares one read with policy and cannot certify a different body observation', () => {
  let reads = 0;
  const body = linked();
  const deps = {
    resolvePlanPath: () => ({ path: '/repo/docs/plan.md' }),
    readFile: () => {
      reads++;
      return `## Story Intent\n${intent}`;
    },
  };
  const governedPlan = validateGovernedLinkedPlan({ body, projectDir: '/repo', deps });
  const result = source.resolveStoryIntentSource({ body, projectDir: '/repo', governedPlan, deps });
  assert.equal(result.ok, true);
  assert.equal(reads, 1);
  assert.equal(
    source.resolveStoryIntentSource({
      body: body.replace('plan.md', 'other.md'),
      projectDir: '/repo',
      governedPlan,
      deps,
    }).ok,
    false
  );
  assert.equal(reads, 1);
  source.resolveStoryIntentSource({ body, projectDir: '/repo', deps });
  assert.equal(reads, 2);
});
test('a copied policy result cannot certify substituted bytes under the old observation', () => {
  const body = linked();
  const policy = validateGovernedLinkedPlan({
    body,
    projectDir: '/repo',
    deps: {
      resolvePlanPath: () => ({ path: '/repo/docs/plan.md' }),
      readFile: () => `## Story Intent\n${intent}`,
    },
  });
  const text = policy.observation.text.replace('release operator', 'registry operator');
  const copied = {
    ...policy,
    observation: {
      ...policy.observation,
      text,
      contentSha256: createHash('sha256').update(text).digest('hex'),
    },
  };
  assert.equal(
    source.resolveStoryIntentSource({ body, projectDir: '/repo', governedPlan: copied }).ok,
    false
  );
});
test('refuses absent, unreadable, escaping and symlink-parent linked files without fallback', (t) => {
  const root = fixture(t, `## Story Intent\n${intent}`);
  const outside = fixture(t, `## Story Intent\n${intent}`);
  symlinkSync(path.join(outside, 'docs'), path.join(root, 'escape'));
  for (const candidate of ['missing.md', '../outside.md', '/etc/passwd', 'escape/plan.md']) {
    const result = source.resolveStoryIntentSource({
      body: `${deep}\n## Plan Metadata\n- **Source-plan**: ${candidate}\n`,
      projectDir: root,
    });
    assert.equal(result.ok, false, candidate);
  }
  assert.equal(
    source.resolveStoryIntentSource({
      body: linked(),
      projectDir: root,
      deps: {
        readFile: () => {
          throw new Error('unreadable');
        },
      },
    }).ok,
    false
  );
});
test('refuses duplicate, blank, template, missing selectors and conflicting plan keys', (t) => {
  const root = fixture(t, `### Task 3: Publish\n#### Story Intent\n${intent}`);
  for (const selector of ['', '[selector]', '### Task 4: Missing']) {
    assert.equal(
      source.resolveStoryIntentSource({
        body: linked(`- **Source-plan-section**: ${selector}\n`),
        projectDir: root,
      }).ok,
      false
    );
  }
  const selected = linked('- **Source-plan-section**: ### Task 3: Publish\n');
  assert.equal(
    source.resolveStoryIntentSource({
      body: `${selected}- **Source-plan-section**: ### Task 3: Publish\n`,
      projectDir: root,
    }).ok,
    false
  );
  writeFileSync(path.join(root, 'docs/other.md'), `## Story Intent\n${intent}`);
  assert.equal(
    source.resolveStoryIntentSource({
      body: `${selected}- **Implementation-plan**: docs/other.md\n`,
      projectDir: root,
    }).ok,
    false
  );
});
