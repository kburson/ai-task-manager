// @story #1500
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';
import {
  renderProtocolMarker,
  selectEvidenceProtocol,
} from '../../../../../task-tracker/lib/evidence-v2/protocol.mjs';

test('installed runtime selects v2 for the exact repository and issue while legacy remains v1', () => {
  const root = path.join(projectScratchDir('test'), `protocol-${randomUUID()}`);
  const dirs = ['tool', 'source', 'authority'].map((name) => path.join(root, name));
  dirs.forEach((dir) => mkdirSync(dir, { recursive: true }));
  const repositoryId = { nodeId: 'R_repo', nameWithOwner: 'owner/repo' };
  const authorityHostId = randomUUID();
  const context = {
    schema: 'aitm.execution-context/v2',
    providerMode: 'live',
    repositoryId,
    issueNumber: 1500,
    toolRoot: dirs[0],
    sourceRoot: dirs[1],
    authorityRoot: dirs[2],
    authorityHostId,
  };
  const marker = renderProtocolMarker({
    schema: 'aitm.evidence-projection/v2',
    repositoryId,
    issueNumber: 1500,
    cycleId: randomUUID(),
    headId: 'sha256:' + 'a'.repeat(64),
    authorityHostId,
  });
  try {
    assert.equal(selectEvidenceProtocol({ body: 'legacy' }).protocol, 'v1');
    assert.equal(selectEvidenceProtocol({ body: marker, context }).protocol, 'v2');
    assert.throws(
      () => selectEvidenceProtocol({ body: marker, context: { ...context, issueNumber: 1501 } }),
      /installed-identity/
    );
    assert.throws(
      () => selectEvidenceProtocol({ body: '<!-- aitm-evidence-v2 broken -->', context }),
      /projection/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
