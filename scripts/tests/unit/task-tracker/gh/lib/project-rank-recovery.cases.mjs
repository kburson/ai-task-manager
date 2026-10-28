// @story #2092 #2104 — real pending Refine, native setter and canonical body writer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { main as setRank } from '../../../../../gh/set-rank.mjs';
import { runRefine } from '../../../../../task-tracker/verbs/refine.mjs';
import { mutateIssueBody } from '../../../../../task-tracker/lib/issue-body-mutate.mjs';
import { parseIssueFieldDb } from '../../../../../task-tracker/issue-field-db.mjs';
import { verifyRefinementSnapshot } from '../../../../../task-tracker/lib/refinement-snapshot.mjs';
import {
  readDecompositionRecords,
  replaceDecompositionRecords,
} from '../../../../../task-tracker/lib/decomposition-records.mjs';
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../../fixtures/estimation-publication.mjs';

export function registerRankRecoveryCases({ cfg, makeRunner, actualTether }) {
  for (const scenario of [
    'omitted',
    'explicit',
    'mixed-case',
    'replaced-item',
    'replacement-during-write',
    'missing-key',
    'wrong-key',
    'extra-key',
    'typed-key',
    'foreign-repository',
    'foreign-project',
    'missing-before',
    'explicit-conflict',
    'pending-drift',
  ]) {
    test(`#2092: real pending Refine and native rank setter — ${scenario}`, async () => {
      const explicit = scenario === 'explicit' || scenario === 'explicit-conflict';
      let body =
        estimationIssueBody({
          priority: 'P1',
          size: 'S',
          estimate: 1,
          rank: null,
          engagedTime: null,
        }) + '<!-- aitm-last-known-state state="refine" ts="2026-10-23T12:00:00Z" -->\n';
      const board = { estimate: 1, size: 'S', rank: null };
      const fixture = estimationPublicationFixture({
        cfg,
        issueNumber: 1987,
        getBody: () => body,
        setBody: (next) => (body = next),
        getProject: () => board,
        getForecast: () =>
          estimationObservation({
            estimate: null,
            size: null,
            recordId: null,
            proposals: [],
            observedProjections: [],
          }),
      });
      const base = makeRunner({
        issueSideItems: [{ id: 'ITEM_1987', project: { id: cfg.projectId } }],
      }).runGql;
      const runGql = async (query, variables) => {
        const result = await base(query, variables);
        if (query.includes('updateProjectV2ItemFieldValue')) {
          if (variables.field === cfg.fieldEstimate) board.estimate = variables.val;
          if (variables.field === cfg.sizeFieldId) board.size = 'S';
          if (variables.field === cfg.fieldRank) board.rank = variables.val;
        }
        return result;
      };
      let interrupt = explicit;
      const args = {
        issueNumber: 1987,
        size: 'S',
        estimate: 3,
        priority: 'p1',
        reason: 'recover the exact original omitted-rank intent',
        ...(explicit ? { rank: 3 } : {}),
      };
      const nativeBody = (input) => mutateIssueBody({ ...input, deps: fixture.decomposition });
      const deps = {
        ...fixture,
        assertBound: () => {},
        fetchBody: async () => body,
        fetchLabels: async () => ['bug'],
        tetherIssueToProject: (input) =>
          actualTether({ ...input, runGql, deps: input.deps ?? fixture }),
        mutateBody: async (input) => {
          if (interrupt) {
            interrupt = false;
            throw new Error('interrupted before body');
          }
          return nativeBody(input);
        },
        verbPromote: async () => {},
      };
      const first = await runRefine({ args, cfg, deps });
      assert.equal(first.status, 'partial');
      if (!explicit) assert.equal(first.reason, 'refinement-snapshot:field-rank');
      const pending = readDecompositionRecords(body).publication;
      assert.equal(pending.status, 'pending');
      assert.equal(parseIssueFieldDb(body).values.rank, null);
      const key = {
        size: 'S',
        estimate: 3,
        priority: 'p1',
        rank: explicit ? 3 : null,
        reason: args.reason,
      };
      if (scenario === 'wrong-key') key.reason = 'a different intent';
      if (scenario === 'extra-key') key.extra = true;
      if (scenario === 'typed-key') key.estimate = '3';
      if (scenario === 'missing-before')
        body = body.replace(/<!-- aitm-estimate-before[^>]*-->/, '');
      const keyFile = path.join(fixture.projectDir, 'original-refine-key.json');
      writeFileSync(keyFile, JSON.stringify(key));
      const before = body;
      let rankWrites = 0;
      const wanted = explicit ? (scenario === 'explicit-conflict' ? 8 : 3) : 8;
      const setter = {
        skipNetwork: false,
        loadConfig: () => ({
          ...cfg,
          ...(scenario === 'foreign-repository' ? { repo: 'foreign/repository' } : {}),
          ...(scenario === 'mixed-case' ? { repo: 'KBurson/AI-Task-Manager' } : {}),
          ...(scenario === 'foreign-project' ? { projectId: 'OTHER_PROJECT' } : {}),
        }),
        fetchBody: async () => body,
        readRank: async () => ({
          itemId:
            scenario === 'replaced-item' ||
            (scenario === 'replacement-during-write' && rankWrites > 0)
              ? 'REPLACEMENT_ITEM'
              : 'ITEM_1987',
          rank: board.rank,
        }),
        tetherIssueToProject: async ({ rank }) => {
          rankWrites++;
          await actualTether({ cfg, issueNumber: 1987, rank, runGql, deps: fixture });
          if (scenario === 'pending-drift') {
            const records = readDecompositionRecords(body);
            records.publication.updatedAt = '2026-10-29T12:00:00Z';
            body = replaceDecompositionRecords(body, records);
          }
        },
        mutateBody: nativeBody,
        log: () => {},
        exit: (code) => {
          throw new Error(`exit:${code}`);
        },
      };
      const command = [
        'node',
        'set-rank.mjs',
        '1987',
        String(wanted),
        ...(scenario === 'missing-key' ? [] : ['--refine-key-file', keyFile]),
      ];
      if (!['omitted', 'explicit', 'mixed-case'].includes(scenario)) {
        await assert.rejects(
          () => setRank(command, setter),
          new RegExp('set-rank:|estimate-publication:')
        );
        assert.equal(parseIssueFieldDb(body).values.rank, null);
        assert.equal(
          rankWrites,
          ['pending-drift', 'replacement-during-write'].includes(scenario) ? 1 : 0
        );
        if (scenario !== 'pending-drift') assert.equal(body, before);
        assert.equal(readDecompositionRecords(body).publication.operationId, pending.operationId);
        return;
      }
      await setRank(command, setter);
      assert.equal(rankWrites, 1);
      assert.equal(board.rank, wanted);
      assert.equal(parseIssueFieldDb(body).values.rank, wanted);
      assert.equal(parseIssueFieldDb(body).values.engagedTime, null);
      assert.deepEqual(
        readDecompositionRecords(body).publication,
        pending,
        'setter preserves every pending operation field'
      );
      const retried = await runRefine({ args, cfg, deps });
      assert.equal(retried.status, 'refined', retried.reason);
      const complete = readDecompositionRecords(body).publication;
      assert.equal(complete.operationId, pending.operationId);
      assert.equal(complete.status, 'complete');
      const snapshot = verifyRefinementSnapshot(body, { labels: ['bug'] });
      assert.equal(snapshot.ok, true, snapshot.reason);
      assert.equal(snapshot.snapshot.fields.rank, wanted);
    });
  }
}
