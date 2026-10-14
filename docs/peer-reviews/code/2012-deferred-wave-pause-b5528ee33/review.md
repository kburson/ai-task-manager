# Independent review of #2012

## Verdicts

- **Specification: PASS.** The plan correctly requires a bounded completion pause, independent immediate withdrawals, unchanged source authority, and neutral operational chatter. The findings below are implementation defects against that specification, not requests to expand its scope.
- **Code: ChangesRequested.** One P1 withdrawal bypass and one P2 false withdrawal remain.
- **Exact bounded local-tarball adoption: Refused.** Package provenance passes, but the package reproduces both code defects. No consumer installation or global package change was performed.

## Scope and independence

Reviewed source: `b5528ee33b517202aa5091d5271404e1ae79c795`.
Accepted source base: `2fd90eb3f84f442e0329783943ed432b45d25473`.
Publication head at review start: `ba55a86ccb6e605b819c4d4006237ad46126e644`.
PR: <https://github.com/kburson/ai-task-manager/pull/2013>.

This is the requested standalone GPT Astra 6/high review, executed directly in root chat `01a138f7-8083-7d31-9344-a35863d2499e`, separate from Sol 6.1/high author chat `01a138e5-7d07-7671-883d-e4ef5d43f917`. No subagents or peer-review broker protocol were used; this is an independent code/specification review report, not a sealed SPR/XPR acceptance receipt. No production code was changed.

Current boot, adapter, Tier-1, pickup, preferences, live issue and plan were read. The registered Start command bound #2012 in the existing worktree and branch with the real reviewer SID and binding generation `118a1363-18de-4fce-85ac-d175c9e954cf`; Status confirmed an active Develop timer. The author active file was absent, and the #2012 occupancy row named only this reviewer. Explain returned promotion ready with `test-develop-finalization-pending`; no lifecycle promotion was requested or performed. Report publication is followed by registered Stop and read-only discharge verification in the final handoff.

The source base retains the accepted #2008/#2009 repairs. The reviewed production diff contains only the source grammar module; the other scripts diff is its new regression test. Publication head adds only package-provenance JSON. Source identity/hash verification, transcript loading, chronology, historical cutoff, complete later-human scanning and original grant recognition are unchanged in the diff. The future pause remains an owner instruction and does not itself grant authority or approve a later wave. This review does not claim that runtime execution has reached that boundary or that native AIVC is ready.

## Finding 1 — P1: A neutral deployment head conceals an explicit admission withdrawal

Location: `scripts/task-tracker/lib/epic-rank-wave-source.mjs:362-364` (new deployment exclusions in `admissionTarget`; consumed at line 467).

Given the existing exact grant for epic #2, rank 4, stories #4, #5, #6, #7, #14, the later human command:

> Stop deployment and parallel execution for epic #2 rank 4.

must revoke the rank-4 execution permission immediately. The reviewed real loader/verifier instead returns `verified`, and the loader omits the command from `subsequentStatements`. The accepted base returns `blocked` / `rank-wave-source-contradiction`. The exact reviewed tarball also returns `verified`.

Adding `deploying|deployments?` to the head-only neutral regex makes the entire joined object neutral, including its explicitly scoped parallel-execution target. The second object contains no separately recognized command, so the verb loop never recovers its withdrawal. The same failure occurs for:

- `Hold off on deployment and parallel execution for epic #2 rank 4.`
- `When wave 4 is complete pause. Stop deployment and parallel execution for epic #2 rank 4.`
- `When wave 4 is complete pause. Stop deploying and running epic #2 rank 4 in parallel.`

Impact: continued admission after an authentic explicit stop. This is a regression introduced by the added neutral deployment classification and violates the immediate/mixed withdrawal requirement independently of deferred-pause parsing.

Required correction: retain the deployment-only neutral case while evaluating coordinated admission targets independently. Add native loader/verifier regressions for the joined objects above, with and without the completion sentence. Merely testing two separately repeated stop verbs does not cover this case.

## Finding 2 — P2: Completion context turns a negated operational preference into withdrawal

Location: `scripts/task-tracker/lib/epic-rank-wave-source.mjs:461-466` (new cross-sentence completion context; interacts with object slicing at line 452 and negated-verb return at line 483).

These later human statements should leave unfinished rank-4 authority intact:

> When wave 4 is complete pause. I do not want to run tests.

> When wave 4 is complete pause. I do not want to start deployment.

Both return `blocked` / `rank-wave-source-contradiction` in the reviewed source and exact tarball. Removing only the completion-pause sentence makes both operational statements return `verified`. Direct operational forms such as `Do not execute tests.` and `Do not start deployment.` remain neutral even with the completion sentence.

The loop interprets negated `want` as an independent admission verb. Its object is truncated to `to ` by the later `run` or `start`; the new completion context supplies rank-4 relevance, and the function returns a contradiction before reaching the actual neutral operation. Thus the condition does not extend to a later stop, but its context incorrectly changes an ordinary testing/deployment preference into authorization withdrawal.

Impact: the same source-refresh obstruction this issue is meant to remove remains for routine operational conversation after a valid deferred pause. The old base blocks the whole combined statement because it also mishandles the initial deferred pause; it nevertheless verifies each operational statement alone. This finding is an unmet explicit requirement exposed by the new completion-context path, not a claim that the old base supported the combined statement.

Required correction: associate the preference/negation with its actual operational object before inheriting admission context. Preserve blocking for `When wave 4 is complete pause. I do not want to run epic #2 rank 4 in parallel.` and for independent `Stop now.`.

## Independent verification

- **127 affected unit/integration tests passed**, including all 55 focused source tests and the rank-wave authority, binding, policy, recovery, refinement, runtime, lock and wave-admission tests. Raw output: `affected.log`.
- **19 adjacent orchestration-plan tests passed**, covering the inherited fresh graph adoption and unchanged refresh/revoke boundaries. Raw output: `adjacent.log`.
- **20 independently constructed native loader/verifier probes** were run on the reviewed source, a clean archive of the accepted base, and the extracted immutable tarball. Source and tarball outcomes matched in all 20 cases. Four withdrawal-bypass variants and two false-withdrawal variants failed the required expectation; 14 cases met it. Complete inputs and three-way outcomes: `comparison.json`.
- The exact owner text preserves authority on the reviewed source and package. Immediate stop, mixed revocation, negated pause, explicitly other-wave pause, and direct neutral operation controls behaved as recorded in `comparison.json`.
- The affected suite independently exercises no standalone/later-wave authorization, altered source hashes, cutoff behavior, late revocation beyond 65 unrelated messages, and existing identity/chronology checks.
- Author fast/lint/format results were read as prior author evidence; this reviewer did not rerun the 961-file fast lane or claim a new full lint/format result. Review-document formatting and whitespace checks are recorded separately at publication.
- Full slow tests and canonical upstream Test/Review/Done remain pending. No merge, closure, consumer installation, live admission or native readiness is claimed.

## Exact immutable package verification

Tarball: `.scratch/runtime/2012-b5528ee33/kburson-ai-task-manager-0.1.0.tgz` in the reviewed source worktree.

- Size: `3005649` bytes.
- SHA256: `5d00afbead05bb23fc824f85709d4ee91a0a4e7cdf89397e82c3f4f3c7d46626`.
- SRI: `sha512-sZk3O8miTyYDLoUZRRgeA+SujIhoo31HTex47tsGgQdHqnjof+yjwECSV9oTNuOYEU2NIhPHcy45rlBE8po9tA==`.
- Production grammar SHA256: `b32af3e47146843155f1fc23b67112e8800831efb6affb149b4c26f97ac3b169`.
- Regression-file SHA256: `573602173592ebd3677daf337e244ee1b0bfe4288da76aede33a8802f962eb3a`.

Every one of the **917 regular packed files** was compared byte-for-byte to `git archive b5528ee33b517202aa5091d5271404e1ae79c795`, with zero missing or differing source counterparts. Tarball size, SHA256, SHA512 SRI, inventory SHA256, regression SHA256 and all published module hashes match the committed sidecar. The eight sidecar-listed inherited modules/entrypoints are byte-identical to the accepted base. Tests/reports are not included in the npm inventory, as published. Detailed independent results: `package-check.json`.

Package extraction was into review-owned scratch for inspection and probes; it was not an installation. The historical `18e364...` proposal and its evidence were preserved and were not substituted for the final reviewed grammar.

## Reproduction

From the reviewed worktree, run this inline Node probe. It uses a synthetic, explicitly test-owned transcript and the actual exported source loader/verifier; it neither edits production source nor supplies native session identity overrides. Replace `later` with any input in `comparison.json` to reproduce the recorded outcome. For the accepted-base comparison, import from a clean archive of the stated base commit; for the package comparison, import from its extracted `package` directory.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { createRankWaveSourceLoader, verifyRankWaveSource } from './scripts/task-tracker/lib/epic-rank-wave-source.mjs';
import { hashAuthorizationStatement } from './scripts/task-tracker/lib/workflow-policy/authority-resolver.mjs';
const dir = path.resolve('.scratch/inspect/2012-review-reproduction');
fs.mkdirSync(dir, { recursive: true });
const transcriptPath = path.join(dir, 'synthetic.jsonl');
const selected = 'Authorize parallel execution for epic #2 rank 4 stories #4, #5, #6, #7, #14.';
const later = 'Stop deployment and parallel execution for epic #2 rank 4.';
const sessionId = 'independent-review-test';
const message = (text, id, timestamp) => ({ type: 'response_item', timestamp, payload: { type: 'message', id, role: 'user', content: [{ type: 'input_text', text }] } });
fs.writeFileSync(transcriptPath, [
  { type: 'session_meta', payload: { id: sessionId, cwd: dir } },
  message(selected, 'selected', '2026-10-14T00:40:00Z'),
  message(later, 'later', '2026-10-14T00:45:00Z'),
].map(JSON.stringify).join('\n'));
const source = { schema: 'aitm.rank-wave-source/v1', sessionId, messages: [{ messageId: 'selected', statementHash: hashAuthorizationStatement(selected) }] };
const scope = { repository: 'o/r', epic: 2, rank: 4, members: [4, 5, 6, 7, 14] };
const loadContext = createRankWaveSourceLoader({ resolveTranscriptPath: async () => transcriptPath, resolveRepository: async () => 'o/r' });
console.log(await verifyRankWaveSource({ source, scope, recordingActor: 'independent-review/test-only', loadContext }));
console.log((await loadContext(source, { scope })).subsequentStatements);
NODE
```

## Disposition

Return to the author for the two bounded grammar corrections and meaningful regressions, then request a fresh independent exact-source/package review. This review does not authorize adopting the present tarball. Existing author evidence and the source worktree remain intact.
