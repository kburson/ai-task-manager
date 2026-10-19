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
  // @story #2037 — includeBindings:false is rank-independent. Reuse only the
  // matching first inspection read; later verification and invocations stay fresh.
  const initial =
    deps.rank == null
      ? await runtime.readSnapshot(parentEpicNumber, null, { includeBindings: false })
      : null;
  const rank = deps.rank ?? initial.children.find((c) => c.number === Number(issueNumber))?.rank;
  let firstRead = true;
  const inspectionRuntime = initial
    ? {
        ...runtime,
        readSnapshot: async (epic, requestedRank, options) => {
          const reuse =
            firstRead &&
            epic === parentEpicNumber &&
            requestedRank === rank &&
            options?.includeBindings === false;
          firstRead = false;
          return reuse ? initial : runtime.readSnapshot(epic, requestedRank, options);
        },
      }
    : runtime;
  const publication = await inspect({
    repository: cfg.repo,
    epic: parentEpicNumber,
    rank,
    now: new Date().toISOString(),
    runtime: inspectionRuntime,
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
