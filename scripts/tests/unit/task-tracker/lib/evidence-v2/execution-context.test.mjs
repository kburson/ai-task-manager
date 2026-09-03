// @story #1500
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import { resolveInstalledExecutionContext } from '../../../../../task-tracker/lib/evidence-v2/execution-context.mjs';

test('installed context keeps trusted tool, source and authority roots distinct and immutable', () => {
  const root = path.join(projectScratchDir('test'), `context-${randomUUID()}`);
  const toolRoot = path.join(root, 'tool');
  const sourceRoot = path.join(root, 'source');
  const authorityRoot = path.join(root, 'authority');
  for (const dir of [toolRoot, sourceRoot, authorityRoot]) mkdirSync(dir, { recursive: true });
  try {
    const context = resolveInstalledExecutionContext({
      schema: 'aitm.execution-context/v2',
      providerMode: 'live',
      repositoryId: { nodeId: 'R_repo', nameWithOwner: 'owner/repo' },
      issueNumber: 1500,
      toolRoot,
      sourceRoot,
      authorityRoot,
      authorityHostId: randomUUID(),
    });
    assert.notEqual(context.toolRoot, context.sourceRoot);
    assert.equal(context.sourceRoot, sourceRoot);
    assert.equal(context.productionEvidenceEligible, true);
    assert.ok(Object.isFrozen(context));
    assert.throws(
      () => resolveInstalledExecutionContext({ ...context, toolRoot: sourceRoot }),
      /tool-source-alias/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
