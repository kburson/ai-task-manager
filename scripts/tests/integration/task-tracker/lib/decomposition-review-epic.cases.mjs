// @story #2006
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unavailable,
  publication,
} from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { readyEpic } from './decomposition-remote.cases.mjs';
import { createObservationAttempt } from '../../../../task-tracker/lib/action-decision/observations.mjs';
import { observeDecompositionForAction } from '../../../../task-tracker/lib/action-decision/decomposition.mjs';
import { evaluateAction } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';
import { runExplain } from '../../../../task-tracker/verbs/explain.mjs';
import { decompositionPlanExitGuard } from '../../../../task-tracker/lib/decomposition-plan-exit-guard.mjs';

function attemptFor(f, state) {
  return createObservationAttempt({
    repository: 'o/r',
    issue: 107,
    boundaryId: 'current-epic-repair',
    now: () => new Date().toISOString(),
    read: async (request) => ({
      ...request,
      value:
        request.resource === 'issue-body'
          ? { number: 107, body: f.authority.body }
          : request.resource === 'migration-journal'
            ? { active: false }
            : { state, assignees: ['operator'] },
    }),
  });
}
export function registerReviewEpicCases() {
  // Selecting terminal completion for Plan promotion falsely fences reviewed R4P children.
  test('real Plan epic observer admits materialized planning readiness before child completion', async () => {
    const f = await readyEpic(false);
    try {
      const current = await f.runtime.collect(f.subject);
      assert.equal(current.input.epicReadiness.planning, true);
      assert.equal(current.input.epicReadiness.completion, false);
      const verdict = await observeDecompositionForAction({
        actionId: 'promote',
        state: 'plan',
        subject: f.subject,
        runtime: f.runtime,
        attempt: attemptFor(f, 'plan'),
      });
      assert.deepEqual(
        verdict.blockers,
        [],
        JSON.stringify({
          assessment: current.assessment.status,
          projection: current.projection.status,
          observations: verdict.observations.map((o) => ({
            status: o.status,
            provenance: o.provenance,
          })),
        })
      );
      const native = await decompositionPlanExitGuard.run({
        issueNumber: 107,
        cfg: f.cfg,
        projectDir: f.native.root,
        deps: {
          decomposition: {
            subject: f.subject,
            runtime: f.runtime,
            readOwnership: async () => ({
              state: 'plan',
              assignees: ['operator'],
              currentUser: 'operator',
            }),
          },
        },
      });
      assert.equal(native.ok, true);
    } finally {
      f.native.close();
    }
  });
  test('actual Plan Explain passes effective state without inventing ordinary approval readiness', async () => {
    const f = await readyEpic(false);
    try {
      f.authority.body = f.authority.body.replace('state="develop"', 'state="plan"');
      await f.runtime.refresh(f.subject);
      const cfg = { ...f.cfg, preferences: { gateAssigneeMatch: false } };
      const writesBefore = f.authority.writes.length;
      let output = '';
      const result = await runExplain(
        { issue: 107, actionId: 'promote', known: [], knownSource: null, diagnostic: false },
        {
          projectRoot: f.native.root,
          evaluate: async () => ({
            decision: await evaluateAction({
              actionId: 'promote',
              repository: 'o/r',
              issue: 107,
              inputs: {
                state: 'plan',
                head: 'a'.repeat(40),
                body: f.authority.body,
                config: cfg,
                sessionState: {},
              },
              attempt: attemptFor(f, 'plan'),
              deps: {
                effectAttempts: () => f.authority.writes.slice(writesBefore),
                decomposition: { subject: f.subject, runtime: f.runtime },
                promotePorts: {
                  cfg,
                  projectDir: f.native.root,
                  deps: { decomposition: { subject: f.subject, runtime: f.runtime } },
                },
              },
            }),
          }),
          stdout: {
            write: (text) => {
              output += text;
            },
          },
        }
      );
      assert.equal(
        result.result.blockers.some((b) => b.code === 'decomposition-required'),
        false,
        output
      );
      assert.equal(
        result.result.blockers.some((b) => b.guardId === 'decomposition-continuation'),
        false,
        output
      );
      assert.equal(f.authority.writes.length, writesBefore);
    } finally {
      f.native.close();
    }
  });
  for (const restriction of ['pending', 'unavailable'])
    test('epic Plan promotion retains ' + restriction + ' authority fence', async () => {
      const f = await readyEpic(false);
      try {
        if (restriction === 'pending') {
          const current = await f.runtime.collect(f.subject);
          f.authority.body = replaceDecompositionRecords(f.authority.body, {
            assessment: current.assessment,
            publication: publication(current.inputDigest, { subject: f.subject }),
          });
        } else f.authority.deps.readForecast = async () => unavailable();
        const verdict = await observeDecompositionForAction({
          actionId: 'promote',
          state: 'plan',
          subject: f.subject,
          runtime: f.runtime,
          attempt: attemptFor(f, 'plan'),
        });
        assert.equal(
          verdict.blockers.some(
            (b) =>
              b.code ===
              (restriction === 'pending'
                ? 'decomposition-assessment-pending'
                : 'decomposition-authority-unavailable')
          ),
          true
        );
      } finally {
        f.native.close();
      }
    });
  for (const terminal of [false, true])
    test('epic terminal completion remains ' + (terminal ? 'admitted' : 'fenced'), async () => {
      const f = await readyEpic(terminal);
      try {
        const verdict = await observeDecompositionForAction({
          actionId: 'close',
          state: 'review',
          subject: f.subject,
          runtime: f.runtime,
          attempt: attemptFor(f, 'review'),
        });
        assert.equal(
          verdict.blockers.some((b) => b.code === 'decomposition-required'),
          !terminal
        );
      } finally {
        f.native.close();
      }
    });
}
