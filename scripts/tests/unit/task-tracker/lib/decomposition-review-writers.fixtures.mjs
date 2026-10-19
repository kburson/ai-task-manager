// @story #2006 — external transports are controlled; publication, tether and fresh-base writes stay real.
import {
  estimationIssueBody,
  estimationPublicationFixture,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { formatIssueFieldDb, stripIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
export const writerCfg = {
  repo: 'o/r',
  projectId: 'PVT_a',
  kanbanFieldId: 'STATUS',
  priorityFieldId: 'PRIORITY',
  priorityOptionP1: 'P1',
  sizeFieldId: 'SIZE',
  sizeOptionMap: { M: 'M', L: 'L' },
  fieldEstimate: 'EST',
  fieldRank: 'RANK',
  fieldIds: { estimate: 'EST', size: 'SIZE', priority: 'PRIORITY', rank: 'RANK' },
};
export const writerDefs = [
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'priority', name: 'Priority', type: 'single_select' },
  { key: 'rank', name: 'Rank', type: 'number' },
];
export function unchangedWriterFixture(state = 'refine') {
  let body =
    estimationIssueBody({ estimate: 10, size: 'M', priority: 'P1', rank: 1 }) +
    '<!-- aitm-last-known-state state="' +
    state +
    '" ts="2026-10-11T12:00:00Z" -->\n';
  const board = { estimate: 10, size: 'M', priority: 'P1', rank: 1 },
    effects = [];
  const publication = estimationPublicationFixture({
    cfg: writerCfg,
    issueNumber: 1987,
    getBody: () => body,
    setBody: (b) => {
      body = b;
    },
    getProject: () => ({ ...board }),
    getForecast: () =>
      estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: [],
        observedProjections: [],
      }),
  });
  const revise = (project = true) => {
    if (project) {
      board.estimate = 25;
      board.size = 'L';
    }
    body =
      stripIssueFieldDb(body) +
      '\n' +
      formatIssueFieldDb({ ...board, estimate: 25, size: 'L' }) +
      '\n';
  };
  let afterOrdinary = () => {};
  const runGql = async (query, v) => {
    if (query.includes('linkProjectV2ToRepository'))
      return { linkProjectV2ToRepository: { repository: { nameWithOwner: 'o/r' } } };
    if (query.includes('repository(owner:') && query.includes('issue(number:'))
      return {
        repository: {
          id: 'REPO_a',
          issue: {
            id: 'ISSUE_1987',
            number: 1987,
            url: 'https://github.com/o/r/issues/1987',
            projectItems: {
              nodes: [
                {
                  id: 'ITEM_1987',
                  project: {
                    id: 'PVT_a',
                    title: 'Board',
                    url: 'https://github.com/users/o/projects/1',
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    if (query.includes('updateProjectV2ItemFieldValue')) {
      effects.push(v.field);
      if (v.field === 'PRIORITY') {
        board.priority = 'P1';
        afterOrdinary();
      }
      if (v.field === 'EST') board.estimate = v.val;
      if (v.field === 'SIZE') board.size = v.option;
      if (v.field === 'RANK') board.rank = v.val;
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: v.item } } };
    }
    throw Error('Unexpected provider query: ' + query.slice(0, 80));
  };
  return {
    board,
    effects,
    revise,
    runGql,
    ...publication,
    get body() {
      return body;
    },
    set body(value) {
      body = value;
    },
    afterOrdinary: (fn) => {
      afterOrdinary = fn;
    },
    deps: {
      ...publication,
      fetchIssueBody: async () => ({ body }),
      projectValuesForIssue: async () => ({ ...board }),
    },
  };
}
