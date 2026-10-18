// @story #1988 — complete authority ports below legacy cancellation orchestration.
import { runCancelPlan } from '../../task-tracker/verbs/cancel-plan.mjs';
import { estimationPublicationFixture, estimationObservation } from './estimation-publication.mjs';
import { collectDecompositionCommentProposals } from '../../task-tracker/lib/decomposition-authority.mjs';
import { parseIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
export async function runCancelPlanWithPublication(input) {
  const original = input.deps ?? {};
  if (original.decomposition) return runCancelPlan(input);
  const { cfg, issueNumber } = input;
  let body = (await original.fetchIssueBody({ cfg, issueNumber })).body,
    board = null;
  const readBoard = async () => {
    board ??= original.fetchBoardFields
      ? await original.fetchBoardFields({ cfg, issueNumber })
      : parseIssueFieldDb(body).values;
    return board;
  };
  const fetch = async () => {
    const record = await original.fetchIssueBody({ cfg, issueNumber });
    body = record.body;
    return record;
  };
  const comments = async () =>
    (original.plannedEstimate?.listComments ?? (async () => []))({ cfg, issueNumber });
  const subject = {
    repository: cfg.repo.toLowerCase(),
    issue: issueNumber,
    projectId: cfg.projectId,
    projectItemId: `ITEM_${issueNumber}`,
  };
  const fixture = estimationPublicationFixture({
    cfg,
    issueNumber,
    getBody: () => body,
    setBody: (b) => (body = b),
    getProject: () => board ?? parseIssueFieldDb(body).values,
    getForecast: () => null,
  });
  const decomposition = {
    ...fixture.decomposition,
    readIssue: async () =>
      estimationObservation({ number: issueNumber, body: (await fetch()).body }),
    readBackIssue: async () =>
      estimationObservation({ number: issueNumber, body: (await fetch()).body }),
    readProject: async () =>
      estimationObservation({
        ...subject,
        projectItemId: subject.projectItemId,
        ...(await readBoard()),
        children: [],
      }),
    fetchBody: async () => (await fetch()).body,
    pushBody: async (_repo, _issue, next) => {
      await original.mutateIssueBody({ mutate: () => next, publicationProjection: true });
      body = (await fetch()).body;
    },
    readForecast: async () => {
      const list = await comments(),
        current = (await fetch()).body,
        actual = await readBoard();
      const parsed = collectDecompositionCommentProposals({
        comments: list.map((c) => ({ id: c.node_id ?? String(c.id), body: c.body })),
        subject,
        body: current,
        published: null,
        board: actual,
        bodyFields: parseIssueFieldDb(current).values,
      });
      return estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: parsed.proposals,
        observedProjections: [],
      });
    },
  };
  return runCancelPlan({
    ...input,
    deps: {
      ...original,
      ...fixture,
      decomposition,
      fetchIssueBody: fetch,
      fetchBoardFields: readBoard,
      restoreBoardFields: async (args) => {
        if (original.restoreBoardFields) await original.restoreBoardFields(args);
        board = { ...args.fields };
      },
      plannedEstimate: { ...original.plannedEstimate, listComments: comments },
    },
  });
}
