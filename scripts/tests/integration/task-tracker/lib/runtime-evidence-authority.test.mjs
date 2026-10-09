// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createActivatedRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { createLiveEvidenceRuntime } from '../../../../task-tracker/lib/evidence-v2/runtime-adapter.mjs';
import { inspectRuntimeWriterLeases } from '../../../../task-tracker/lib/runtime-migration-lock.mjs';
test('live evidence enrollment retains a durable operation lease and rejects foreign authority roots', async () => {
  const root = await createActivatedRuntimeRootFixture('evidence-live-root-');
  const toolRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
  const context = { providerMode: 'live', authorityHostId: '11111111-1111-4111-8111-111111111111', repositoryId: { nameWithOwner: 'fixture/repo', nodeId: 'R_fixture' }, issueNumber: 1857, sourceRoot: root, authorityRoot: root, toolRoot };
  try {
    const runtime = createLiveEvidenceRuntime({ context, cfg: { repo: 'fixture/repo' } });
    await runtime.ports.withAuthorityLock({ issueNumber: 1857 }, async () => {
      assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 1);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 1);
    });
    assert.equal(inspectRuntimeWriterLeases({ projectRoot: root, mainRoot: root }).length, 0);
    const volatile = path.join(root, '.scratch', 'authority');
    mkdirSync(volatile, { recursive: true });
    assert.throws(() => createLiveEvidenceRuntime({ context: { ...context, authorityRoot: volatile }, cfg: {} }), { code: 'ROOT_IDENTITY_MISMATCH' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
