// @story #1872
// Read-only observation adapter shared by all child admission routes.
import { createRankWaveRuntime } from './epic-rank-wave-runtime.mjs';
import { inspectRankWavePublication } from './epic-rank-wave-store.mjs';
import { evaluateRankWaveAdmission } from './epic-rank-wave-policy.mjs';
import { assertEpicAdmissionLock, currentEpicAdmissionLock } from './epic-admission-lock.mjs';

export async function observeRankWaveAdmission({
  cfg,
  parentEpicNumber,
  issueNumber,
  projectDir,
  readOnly = true,
  deps = {},
}) {
  const runtime =
    deps.rankWaveRuntime ?? createRankWaveRuntime({ cfg, projectDir, waveEpic: parentEpicNumber });
  const inspect = deps.inspectRankWavePublication ?? inspectRankWavePublication;
  const publication = await inspect({
    repository: cfg.repo,
    epic: parentEpicNumber,
    rank:
      deps.rank ??
      (
        await runtime.readSnapshot(parentEpicNumber, null, { includeBindings: false })
      ).children.find((c) => c.number === Number(issueNumber))?.rank,
    now: new Date().toISOString(),
    runtime,
  });
  if (publication.status === 'legacy')
    return { legacy: true, children: publication.snapshot.children };
  if (!readOnly)
    assertEpicAdmissionLock({
      projectDir,
      epic: parentEpicNumber,
      context: deps.admissionLockContext ?? currentEpicAdmissionLock(),
    });
  const children = publication.snapshot?.children ?? [];
  const graph = publication.record?.graph ?? publication.graph;
  const rankWave = {
    execution: 'rank-level',
    status: publication.status,
    graph,
    rank: publication.record?.rank,
    members: publication.record?.members,
    bindings: null,
  };
  if (publication.status === 'ready')
    rankWave.bindings = await runtime.verifyBindings({
      bindings: publication.record.bindings,
      parent: publication.record.parent,
      children,
      target: Number(issueNumber),
    });
  const decision = evaluateRankWaveAdmission({
    promotingNumber: Number(issueNumber),
    children,
    rankWave,
  });
  if (!decision.ok && publication.code) decision.code = publication.code;
  return { legacy: false, children, rankWave, decision };
}
