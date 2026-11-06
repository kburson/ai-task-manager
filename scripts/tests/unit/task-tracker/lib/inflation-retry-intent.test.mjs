// @story #2163 — pure comparison uses real record/proposal parsers and never returns authority.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rmSync } from 'node:fs';
import {
  fixture,
  subject,
  observed,
  freshUnitDir,
  hash,
} from './decomposition-authority-fixtures.mjs';
import { withActiveInflationForecast } from '../../../fixtures/inflation-scenarios.mjs';
import {
  assertInflationRetryAuthority,
  deriveInflationIntendedInput,
} from '../../../../task-tracker/lib/inflation-intent.mjs';
import {
  executeEstimateWriter,
  readEstimateBeforeRecord,
} from '../../../../task-tracker/lib/estimate-writer-publication.mjs';
import { buildInflationSection } from '../../../../task-tracker/verbs/inflate-estimate.mjs';
import { loadForecastProjection } from '../../../../task-tracker/lib/estimation/runtime-adapter.mjs';
import { parsePreloadedIssueComments } from '../../../../task-tracker/lib/github-records/github-comment-store.mjs';
import {
  parseIssueFieldDb,
  stripIssueFieldDb,
  formatIssueFieldDb,
} from '../../../../task-tracker/issue-field-db.mjs';
import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';

for (const active of [false, true])
  test(`pure pending completion preserves actual inputs and forecast retirement: active=${active}`, async (t) => {
    const f = fixture(active ? 4 : 2),
      dir = freshUnitDir('inflation-retry-pure-');
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const cfg = {
      repo: subject.repository,
      projectId: subject.projectId,
      fieldIds: { size: 'F_SIZE', estimate: 'F_EST' },
    };
    let state = {
      repository: subject.repository,
      number: subject.issue,
      body: f.body,
      board: { size: 'M', estimate: active ? 4 : 2 },
      comments: [
        {
          id: 101,
          node_id: 'IC_refine',
          body: `<!-- aitm-refined-estimate: ${subject.issue} -->\n### Planned Estimate\n\n| Field | Refine | Planned |\n|---|---|---|\n| Size | M | M |\n| Estimate (h) | 2 | 2 |\n`,
          created_at: '2026-11-05T00:00:00Z',
          updated_at: '2026-11-05T00:00:00Z',
        },
      ],
    };
    if (active) state = withActiveInflationForecast(state);
    f.body = state.body;
    Object.assign(f.values.project, state.board);
    state.comments.push({
      ...state.comments[0],
      id: 202,
      node_id: 'IC_other',
      body: '### 🔁 Plan re-estimate\n\n**HUMAN ATTENTION** — not auto-applied\n\n| Field | Before | After |\n|---|---|---|\n| Size | S | S |\n| Estimate (h) | 1 | 1 |\n',
    });
    const nodes = () =>
      state.comments.map((c) => ({
        __typename: 'IssueComment',
        id: c.node_id,
        databaseId: c.id,
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        author: { login: 'operator' },
        issue: { number: subject.issue, repository: { nameWithOwner: subject.repository } },
      }));
    const graphql = async ({ query, variables }) => {
      assert.match(query, /query AitmEstimationProjection\(/);
      assert.deepEqual(variables, { owner: 'o', name: 'r', issue: subject.issue });
      return {
        data: {
          repository: {
            issue: {
              body: f.body,
              comments: { nodes: nodes(), pageInfo: { hasNextPage: false, endCursor: null } },
              projectItems: {
                nodes: [
                  {
                    id: subject.projectItemId,
                    project: { id: subject.projectId },
                    fieldValues: {
                      nodes: [
                        { number: f.values.project.estimate, field: { id: 'F_EST' } },
                        { name: f.values.project.size, field: { id: 'F_SIZE' } },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      };
    };
    const { readForecast: _unused, ...ports } = f.deps;
    const decomposition = { ...ports, forecast: { graphql } },
      runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: decomposition });
    const evidence = async () => ({
      body: f.body,
      comments: nodes(),
      projection: await loadForecastProjection({
        cfg,
        issueNumber: subject.issue,
        deps: { graphql },
      }),
      records: parsePreloadedIssueComments({
        nodes: nodes(),
        repository: subject.repository,
        issue: subject.issue,
      }),
    });
    const identity = {
        repository: subject.repository,
        issue: subject.issue,
        restId: 101,
        graphqlId: 'IC_refine',
      },
      proposal = { estimate: { basis: 'published', hours: 6, proposalId: null }, size: 'M' };
    let beforeBody,
      intendedBody,
      validations = 0,
      sawIntermediate = false,
      sawRetired = false,
      negativeChecked = false;
    const result = await executeEstimateWriter({
      cfg,
      issueNumber: subject.issue,
      writerId: 'inflate-estimate',
      key: { test: 'pure-completion', active },
      proposal,
      deps: {
        projectDir: dir,
        projectItemForIssue: async () => ({ itemId: subject.projectItemId }),
        decomposition,
        afterPublicationEffects: async () => {
          const current = await runtime.collect(subject),
            args = {
              current,
              proposal,
              commentIdentity: identity,
              beforeBody: state.comments[0].body,
              intendedBody,
              publication: current.publication,
              beforeRecord: readEstimateBeforeRecord(f.body),
              forecastEvidence: await evidence(),
            },
            copy = structuredClone(args);
          assert.equal(await assertInflationRetryAuthority(args), undefined);
          assert.deepEqual(args, copy);
          if (active)
            sawRetired = !current.sourceObservations.readForecast.value.proposals.some(
              (p) => p.proposalId === 'comment:IC_refine:planned-estimate'
            );
        },
      },
      deriveIntendedInput: (initial) =>
        deriveInflationIntendedInput({
          initial,
          proposal,
          commentIdentity: identity,
          beforeBody,
          intendedBody,
        }),
      effects: async ({ createdAt, operationId }) => {
        beforeBody = state.comments[0].body;
        intendedBody =
          beforeBody +
          buildInflationSection({
            reason: 'Discovered integration work.',
            items: ['Integration validation (~4h)'],
            beforeSize: 'M',
            beforeEstimate: active ? 4 : 2,
            newSize: 'M',
            newEstimate: 6,
            date: createdAt.slice(0, 10),
          }) +
          `\nPublication operation: ${operationId}\n`;
        return [
          {
            id: 'audit',
            resource: 'comment',
            targetIdentity: 'comment:101',
            value: intendedBody,
            read: async () => observed(state.comments[0].body),
            apply: async () => {
              state.comments[0].body = intendedBody;
            },
          },
          ...['size', 'estimate'].map((key) => ({
            id: key,
            resource: `project-${key}`,
            targetIdentity: subject.projectItemId,
            value: key === 'size' ? 'M' : 6,
            read: async () => observed(f.values.project[key]),
            apply: async () => {
              f.values.project[key] = key === 'size' ? 'M' : 6;
            },
          })),
          {
            id: 'fields',
            resource: 'body-fields',
            targetIdentity: `${subject.repository}#${subject.issue}:fields`,
            value: { size: 'M', estimate: 6 },
            read: async () => {
              const v = parseIssueFieldDb(f.body).values;
              return observed({ size: v.size, estimate: v.estimate });
            },
            apply: async () => {
              f.body =
                stripIssueFieldDb(f.body) +
                '\n' +
                formatIssueFieldDb({ size: 'M', estimate: 6 }) +
                '\n';
            },
          },
        ];
      },
      validatePendingInput: async (current, { publication, beforeRecord }) => {
        const args = {
            current,
            proposal,
            commentIdentity: identity,
            beforeBody: state.comments[0].body,
            intendedBody,
            publication,
            beforeRecord,
            forecastEvidence: await evidence(),
          },
          copy = structuredClone(args);
        assert.equal(await assertInflationRetryAuthority(args), undefined);
        assert.deepEqual(args, copy);
        validations++;
        const forecast = current.sourceObservations.readForecast.value;
        if (
          active &&
          f.values.project.estimate === 6 &&
          forecast.observedProjections[1].estimate === 4
        ) {
          assert.ok(
            forecast.proposals.some((p) => p.proposalId === 'comment:IC_refine:planned-estimate')
          );
          sawIntermediate = true;
        }
        if (active && publication.effects.find((e) => e.id === 'fields').status === 'confirmed') {
          assert.equal(
            forecast.proposals.some((p) => p.proposalId === 'comment:IC_refine:planned-estimate'),
            false
          );
          sawRetired = true;
        }
        if (!negativeChecked) {
          negativeChecked = true;
          for (const mutate of [
            (a) => {
              a.current.sourceObservations.readIssue.status = 'unavailable';
            },
            (a) => {
              a.forecastEvidence.records.push({});
            },
            (a) => {
              a.forecastEvidence.comments.push(structuredClone(a.forecastEvidence.comments[0]));
            },
            (a) => {
              a.forecastEvidence.body += ' ';
            },
            (a) => {
              a.forecastEvidence.projection.board.estimate = 99;
            },
            (a) => {
              a.current.input.availability = {
                status: 'incomplete',
                reasons: ['forecast-unavailable'],
              };
            },
            (a) => {
              a.publication.intendedInputDigest = hash('replacement intent');
            },
          ]) {
            const changed = structuredClone(args);
            mutate(changed);
            await assert.rejects(
              () => assertInflationRetryAuthority(changed),
              /inflate-estimate:pending-source-drift/
            );
          }
          const other = state.comments.find((c) => c.id === 202),
            saved = other.body;
          other.body += ' ';
          try {
            const changed = await runtime.collect(subject),
              changedEvidence = await evidence();
            await assert.rejects(
              () =>
                assertInflationRetryAuthority({
                  ...args,
                  current: changed,
                  forecastEvidence: changedEvidence,
                }),
              /inflate-estimate:pending-source-drift:intent/
            );
          } finally {
            other.body = saved;
          }
        }
      },
    });
    assert.equal(result.status, 'recorded', result.reason);
    assert.ok(validations > 4);
    if (active) {
      assert.equal(sawIntermediate, true);
      assert.equal(sawRetired, true);
    }
  });
