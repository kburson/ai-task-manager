// @story #1988 — actual process boundary over persistent injected provider state.
import { createTargetFixtureGraphql } from './refinement-target-fixture.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runInflateEstimate } from '../../task-tracker/verbs/inflate-estimate.mjs';
import { runUpdateEventFields } from '../../gh/update-event-fields.mjs';
import { tetherIssueToProject } from '../../gh/lib/project-tether.mjs';
import { migrateProjectIssue } from '../../gh/migrate-project.mjs';
import { bindProjectIssue } from '../../maintenance/bind-issues-to-new-project.mjs';
import { upsertPlannedEstimate } from '../../task-tracker/lib/refine-estimate-comment.mjs';
import { collectDecompositionCommentProposals } from '../../task-tracker/lib/decomposition-authority.mjs';
import { readDecompositionRecords } from '../../task-tracker/lib/decomposition-records.mjs';
import { parseIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { currentIssueLockOwner } from '../../task-tracker/issue-mutator-lock.mjs';
import { estimationIssueBody, estimationObservation } from './estimation-publication.mjs';
export function initialProcessProviderState(mode) {
  const repair = ['migrate', 'bind'].includes(mode),
    initial = mode === 'initial';
  return {
    body:
      estimationIssueBody({
        estimate: repair || initial ? 25 : 10,
        size: 'M',
        priority: 'P1',
        rank: 3,
      }) + '<!-- aitm-last-known-state state="develop" ts="2026-10-11T12:00:00Z" -->\n',
    board: { estimate: initial ? null : 10, size: initial ? null : 'M', priority: 'P1', rank: 3 },
    comment: {
      id: 99,
      node_id: 'IC_refine',
      body: '<!-- aitm-refined-estimate: 1987 -->\n### Refine estimate\n',
    },
    calls: [],
  };
}
export function processPublicationHarness({ file, dir, mode }) {
  const cfg = {
    repo: 'o/r',
    projectId: 'PVT_a',
    fieldIds: { estimate: 'EST', size: 'SIZE', priority: 'PRIORITY', rank: 'RANK' },
    fieldEstimate: 'EST',
    sizeFieldId: 'SIZE',
    sizeOptionMap: { M: 'M', L: 'L' },
    kanbanFieldId: 'STATUS',
  };
  const subject = {
    repository: cfg.repo,
    issue: 1987,
    projectId: cfg.projectId,
    projectItemId: 'ITEM_1987',
  };
  const defs = [
    { key: 'estimate', name: 'Estimate', type: 'number' },
    { key: 'size', name: 'Size', type: 'single_select' },
    { key: 'priority', name: 'Priority', type: 'single_select' },
    { key: 'rank', name: 'Rank', type: 'number' },
  ];
  const load = () => JSON.parse(readFileSync(file, 'utf8'));
  const effect = (name, mutate) => {
    const state = load();
    state.calls.push({ name, owned: Boolean(currentIssueLockOwner(1987)) });
    mutate(state);
    writeFileSync(file, JSON.stringify(state));
  };
  const decomposition = {
    findMainWorktreePath: () => dir,
    readIssue: async () => estimationObservation({ number: 1987, body: load().body }),
    readBackIssue: async () => estimationObservation({ number: 1987, body: load().body }),
    readProject: async () =>
      estimationObservation({
        ...subject,
        projectItemId: subject.projectItemId,
        ...load().board,
        children: [],
      }),
    readForecast: async () => {
      const state = load(),
        parsed = collectDecompositionCommentProposals({
          comments: [{ id: state.comment.node_id, body: state.comment.body }],
          subject,
          body: state.body,
          published: null,
          board: state.board,
          bodyFields: parseIssueFieldDb(state.body).values,
        });
      return estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: parsed.proposals,
        observedProjections: [],
      });
    },
    fetchBody: async () => load().body,
    pushBody: async (_repo, _issue, body) => {
      effect('projection', (state) => {
        state.body = body;
      });
      if (
        mode === 'kill-intent' &&
        readDecompositionRecords(body).publication?.status === 'pending'
      )
        process.exit(77);
    },
  };
  const writeField = async ({ fieldId, value }) => {
    effect('field:' + fieldId, (state) => {
      const key = Object.entries(cfg.fieldIds).find(([, id]) => id === fieldId)?.[0];
      if (key) state.board[key] = value.number ?? value.singleSelectOptionName;
    });
    return true;
  };
  const deps = {
    targetGraphql: createTargetFixtureGraphql({
      cfg,
      issueNumber: 1987,
      itemId: subject.projectItemId,
      getBody: () => load().body,
      getProject: () => load().board,
    }).graphql,
    decomposition,
    projectDir: dir,
    loadProjectFieldDefs: () => defs,
    projectItemForIssue: async () => ({ issueId: 'I_1987', itemId: subject.projectItemId }),
    projectValuesForIssue: async () => ({ ...load().board }),
    fieldOptionMap: async () => ({ SIZE: { M: 'M', L: 'L' } }),
    listComments: async () => [load().comment],
    patchComment: async ({ body }) =>
      effect('comment', (state) => {
        state.comment.body = body;
      }),
    getIssueBody: async () => load().body,
    fetchIssueBody: async () => ({ body: load().body }),
    mutateIssueBody: async ({ mutate }) => {
      const next = await mutate(load().body);
      effect('fields', (state) => {
        state.body = next;
      });
    },
    writeProjectFieldValue: writeField,
  };
  const runGql = async (query, v) => {
    if (query.includes('linkProjectV2ToRepository')) {
      effect('repository-link', () => {});
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: cfg.repo } } };
    }
    if (query.includes('updateProjectV2ItemFieldValue')) {
      await writeField({
        fieldId: v.field,
        value: v.val !== undefined ? { number: v.val } : { singleSelectOptionName: v.option },
      });
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: v.item } } };
    }
    if (query.includes('repository(owner:'))
      return {
        repository: {
          id: 'R_o',
          issue: {
            id: 'I_1987',
            number: 1987,
            projectItems: {
              nodes: [{ id: subject.projectItemId, project: { id: cfg.projectId } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    throw new Error('unregistered fixture query');
  };
  const run = async () => {
    try {
      if (mode === 'event')
        return await runUpdateEventFields({
          cfg,
          issueNumber: 1987,
          itemId: subject.projectItemId,
          state: 'develop',
          bindings: [{ field: 'estimate', value: 25 }],
          fieldDefs: defs,
          deps,
        });
      if (mode === 'migrate' || mode === 'bind')
        return await (mode === 'migrate' ? migrateProjectIssue : bindProjectIssue)({
          cfg,
          oldCfg: cfg,
          issue: { number: 1987, id: 'I_1987', state: 'open' },
          fieldDefs: defs,
          optionMap: {},
          deps,
        });
      if (mode === 'tether' || mode === 'initial')
        return await tetherIssueToProject({
          cfg,
          issueNumber: 1987,
          estimate: 25,
          size: mode === 'initial' ? 'M' : 'L',
          initialValues: mode === 'initial',
          runGql,
          deps,
        });
      if (mode === 'compat')
        return await upsertPlannedEstimate({
          cfg,
          issueNumber: 1987,
          refine: { estimate: 10, size: 'M' },
          plan: { estimate: 25, size: 'L' },
          rationale: 'growth',
          deps,
        });
      return await runInflateEstimate(
        {
          issueNumber: 1987,
          size: 'L',
          estimate: '25',
          reason: 'New work',
          items: ['Large revision (~15h)'],
        },
        cfg,
        deps
      );
    } catch (error) {
      return { status: 'refused', reason: error.message };
    }
  };
  return { run, load, deps, cfg };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const h = processPublicationHarness({
    file: process.argv[2],
    dir: process.argv[3],
    mode: process.argv[4],
  });
  const result = await h.run();
  process.stdout.write(
    JSON.stringify({
      result,
      calls: h.load().calls.length,
      publication: readDecompositionRecords(h.load().body).publication?.status ?? null,
    })
  );
}
