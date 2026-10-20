// @story #2073 — isolated raw population and real production publication boundary.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTrafficProvider } from '../helpers/refinement-traffic-provider.mjs';
import {
  retainedShapes,
  routeShapes,
  retainedHookQuery,
  optimizedHookRoot,
  optimizedHookGraph,
  optimizedHookFence,
  optimizedHookContinuations,
} from './refinement-traffic-shapes.mjs';
import { installStubGh } from './stub-gh.mjs';
import { targetShapes } from './refinement-target-shapes.mjs';
import { configureHookPopulation } from './refinement-hook-population.mjs';
import { estimationIssueBody } from './estimation-publication.mjs';

export const fixtureBudgets = {
  'changed-publication': {
    total: 384,
    families: {
      membership: 96,
      projection: 96,
      'issue-body-read': 160,
      'body-write': 32,
      'project-field-write': 8,
      'repository-link': 4,
      'target-binding': 1,
      'target-project': 80,
      'target-body': 40,
      'field-options': 4,
    },
  },
  'unchanged-publication': {
    total: 16,
    families: { membership: 4, projection: 4, 'issue-body-read': 8 },
  },
};
export const retainedBaselineBudget = {
  total: 512,
  families: {
    ...fixtureBudgets['changed-publication'].families,
    membership: 196,
    'target-binding': 0,
    'target-project': 0,
    'target-body': 0,
  },
};
export function semanticOutcome(snapshot) {
  return snapshot;
}
export async function makeTrafficFixture({ sourceRoot, fixtureId, projectDir }) {
  sourceRoot = path.resolve(sourceRoot);
  projectDir = path.resolve(projectDir);
  mkdirSync(projectDir, { recursive: true });
  const previousEnv = { ...process.env },
    NativeDate = globalThis.Date,
    originalCwd = process.cwd();
  const load = (name) => import(pathToFileURL(path.join(sourceRoot, name)).href);
  let shim, client, previousPorts;
  try {
    process.chdir(projectDir);
    process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
    process.env.AI_TASK_MANAGER_SESSION_ID = 'fixture-2073-traffic';
    globalThis.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : ['2026-10-20T00:00:00.000Z']));
      }
      static now() {
        return NativeDate.parse('2026-10-20T00:00:00.000Z');
      }
    };
    ({ ghClient: client } = await load('scripts/gh/lib/gh-client.mjs'));
    shim = installStubGh({ seam: client });
    previousPorts = { ...client };
    delete process.env.TT_SKIP_NETWORK;
    const cfg = {
      repo: 'o/r',
      projectId: 'P',
      fieldIds: { estimate: 'E', size: 'S' },
      sizeFieldId: 'S',
      fieldEstimate: 'E',
      sizeOptionMap: { S: 'OPT_S', M: 'OPT_M' },
      kanbanFieldId: 'STATUS',
    };
    const initial =
      fixtureId === 'unchanged-publication'
        ? { estimate: 3, size: 'M' }
        : { estimate: 2, size: 'S' };
    const field = (id, name, type) => ({
      id,
      name,
      dataType: type,
      project: { id: 'P' },
      __typename: type === 'SINGLE_SELECT' ? 'ProjectV2SingleSelectField' : 'ProjectV2Field',
    });
    const estimateField = field('E', 'Estimate', 'NUMBER'),
      sizeField = {
        ...field('S', 'Size', 'SINGLE_SELECT'),
        options: ['XS', 'S', 'M', 'L', 'XL'].map((name) => ({ id: 'OPT_' + name, name })),
      };
    const issue = {
      id: 'I',
      __typename: 'Issue',
      number: 2073,
      title: 'Traffic fixture',
      url: 'https://example.invalid/issues/2073',
      body: estimationIssueBody(initial).replace(
        '## AITM Progress Markers',
        '## AITM Progress Markers\n<!-- aitm-issue-kind kind="code" -->'
      ),
      repository: { nameWithOwner: 'o/r' },
      assignees: { nodes: [{ login: 'operator' }] },
      comments: { nodes: [] },
      subIssues: { nodes: [] },
    };
    const item = {
      id: 'ITEM',
      __typename: 'ProjectV2Item',
      project: {
        id: 'P',
        __typename: 'ProjectV2',
        title: 'Fixture',
        url: 'https://example.invalid/project',
        fields: { nodes: [estimateField, sizeField] },
      },
      content: { __typename: 'Issue', id: 'I', number: 2073, repository: { nameWithOwner: 'o/r' } },
      fieldValueByName: { name: 'Develop', optionId: 'DEVELOP' },
      fieldValues: {
        nodes: [
          {
            id: 'VE',
            __typename: 'ProjectV2ItemFieldNumberValue',
            number: initial.estimate,
            field: estimateField,
          },
          {
            id: 'VS',
            __typename: 'ProjectV2ItemFieldSingleSelectValue',
            name: initial.size,
            optionId: 'OPT_' + initial.size,
            field: sizeField,
          },
        ],
      },
    };
    issue.projectItems = { nodes: [item] };
    const population = {
      repository: { id: 'R', nameWithOwner: 'o/r', issue },
      viewer: { login: 'operator' },
    };
    issue.labels = { nodes: [] };
    const failureSchedule = configureHookPopulation({ population, cfg, projectDir, fixtureId });
    if (fixtureId === 'legacy-pending')
      failureSchedule.push({
        family: 'project-field-write',
        occurrence: 1,
        mode: 'apply-then-throw',
      });
    const shapes = [
      ...retainedShapes,
      ...routeShapes,
      ...targetShapes,
      ...optimizedHookContinuations,
      { query: retainedHookQuery, family: 'hook-root' },
      { query: optimizedHookRoot, family: 'hook-root' },
      { query: optimizedHookGraph, family: 'hook-graph' },
      { query: optimizedHookFence, family: 'hook-fence' },
    ].map((shape) => ({
      ...shape,
      ...(shape.family === 'repository-link'
        ? {
            apply: ({ state, variables }) => {
              if (variables.project !== 'P' || variables.repo !== 'R')
                throw new Error('foreign link');
              state.linkProjectV2ToRepository = { repository: { nameWithOwner: 'o/r' } };
            },
          }
        : {}),
      ...(shape.family === 'project-field-write'
        ? {
            apply: ({ state, variables }) => {
              if (
                variables.project !== 'P' ||
                variables.item !== 'ITEM' ||
                !['E', 'S'].includes(variables.field)
              )
                throw new Error('foreign mutation');
              const current = state.repository.issue.projectItems.nodes[0].fieldValues.nodes.find(
                (v) => v.field.id === variables.field
              );
              if (variables.field === 'E') current.number = variables.val;
              else {
                if (!sizeField.options.some((o) => o.id === variables.option))
                  throw new Error('unknown option');
                current.optionId = variables.option;
                current.name = variables.option.slice(4);
              }
              state.updateProjectV2ItemFieldValue = { projectV2Item: { id: 'ITEM' } };
            },
          }
        : {}),
    }));
    const provider = createTrafficProvider({ population, shapes, failureSchedule });
    Object.assign(client, {
      pexec: provider.pexec,
      execFile: provider.execFile,
      spawn: provider.spawn,
    });
    provider.assertNoEscapes = () => {
      if (shim.count()) throw new Error('offline transport escape: ' + shim.calls().join('\n'));
    };
    const deps = {
      projectDir,
      decomposition: {
        findMainWorktreePath: () => projectDir,
        pexec: provider.pexec,
        readPlanAtCommit: ({ planPath }) => readFileSync(path.join(projectDir, planPath), 'utf8'),
      },
    };
    const subject = { repository: 'o/r', issue: 2073, projectId: 'P', projectItemId: 'ITEM' };
    const invoke = async (boundary) => {
      if (boundary === 'hook') {
        const { evaluateHookDecomposition } = await load(
          'scripts/task-tracker/lib/decomposition-activity.mjs'
        );
        return evaluateHookDecomposition({
          cfg,
          issue: 2073,
          projectDir,
          activity: ['empty-epic', 'unready-epic'].includes(fixtureId)
            ? 'scoped-completion'
            : 'checkpoint',
          targets: [],
          deps: {
            graphql: provider.graphql,
            readPlanAtCommit: deps.decomposition.readPlanAtCommit,
          },
        });
      }
      if (boundary === 'refine-entry-route') {
        const { runRefine } = await load('scripts/task-tracker/verbs/refine.mjs');
        try {
          await runRefine({
            cfg,
            args: {
              issueNumber: 2073,
              size: 'M',
              estimate: '3',
              priority: 'p1',
              reason: 'current bounded fixture',
            },
            deps: {
              ...deps,
              assertBound: (number) => {
                if (number !== 2073) throw new Error('foreign fixture binding');
              },
              verbPromote: async () => {
                throw new Error('2073-promotion-boundary');
              },
            },
          });
        } catch (error) {
          if (error.message !== '2073-promotion-boundary') throw error;
          return {
            status: 'route-boundary',
            reason: 'promotion-sentinel',
            wholeCommandSuccess: false,
          };
        }
        throw new Error('missing promotion boundary');
      }
      if (boundary !== 'publication') throw new Error('unsupported boundary: ' + boundary);
      const { publishFieldEstimateRevision } = await load(
        'scripts/task-tracker/lib/decomposition-field-writer.mjs'
      );
      const { writeProjectFieldValue } = await load('scripts/gh/lib/github-projects.mjs');
      return publishFieldEstimateRevision({
        cfg,
        issueNumber: 2073,
        writerId: 'refine',
        key: 'traffic-2073',
        estimate: 3,
        size: 'M',
        deps,
        writeField: ({ field, value }) =>
          writeProjectFieldValue({
            projectId: 'P',
            itemId: 'ITEM',
            fieldId: cfg.fieldIds[field],
            value: field === 'estimate' ? { number: value } : { singleSelectOptionName: value },
            optionMap: { S: Object.fromEntries(sizeField.options.map((o) => [o.name, o.id])) },
          }),
      });
    };
    const snapshot = async () => {
      const body = provider.state.repository.issue.body;
      const { readDecompositionRecords } = await load(
        'scripts/task-tracker/lib/decomposition-records.mjs'
      );
      const { readEstimateBeforeRecord } = await load(
        'scripts/task-tracker/lib/estimate-writer-publication.mjs'
      );
      const values = provider.state.repository.issue.projectItems.nodes[0].fieldValues.nodes;
      return {
        issueBody: body,
        projectValues: { estimate: values[0].number, size: values[1].name },
        publication: readDecompositionRecords(body).publication,
        before: readEstimateBeforeRecord(body),
        subject,
      };
    };
    return {
      cfg,
      subject,
      provider,
      deps,
      invoke,
      snapshot,
      close() {
        provider.assertNoEscapes();
        Object.assign(client, previousPorts);
        shim.restore();
        process.chdir(originalCwd);
        globalThis.Date = NativeDate;
        for (const key of Object.keys(process.env))
          if (!(key in previousEnv)) delete process.env[key];
        Object.assign(process.env, previousEnv);
      },
    };
  } catch (error) {
    if (client && previousPorts) Object.assign(client, previousPorts);
    shim?.restore();
    process.chdir(originalCwd);
    globalThis.Date = NativeDate;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    throw error;
  }
}
