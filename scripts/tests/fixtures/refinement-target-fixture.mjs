// @story #2073 — current raw target responses for compatibility tests, not traffic evidence.
import { fieldIdFor } from '../../task-tracker/project-fields.mjs';
import { createTrafficProvider } from '../helpers/refinement-traffic-provider.mjs';
import { targetShapes } from './refinement-target-shapes.mjs';
export function createTargetFixtureGraphql({ cfg, issueNumber, itemId, getBody, getProject }) {
  const calls = [];
  const graphql = async (request) => {
    const current = getProject(),
      estimateId = fieldIdFor(cfg, 'estimate'),
      sizeId = fieldIdFor(cfg, 'size');
    const content = {
      __typename: 'Issue',
      id: 'I_' + issueNumber,
      number: issueNumber,
      repository: { nameWithOwner: cfg.repo },
    };
    const defs = [
      {
        __typename: 'ProjectV2Field',
        id: estimateId,
        dataType: 'NUMBER',
        project: { id: cfg.projectId },
      },
      {
        __typename: 'ProjectV2SingleSelectField',
        id: sizeId,
        dataType: 'SINGLE_SELECT',
        project: { id: cfg.projectId },
        options: ['XS', 'S', 'M', 'L', 'XL'].map((name) => ({ id: 'OPT_' + name, name })),
      },
    ];
    const item = {
      __typename: 'ProjectV2Item',
      id: itemId,
      content,
      project: { __typename: 'ProjectV2', id: cfg.projectId, fields: { nodes: defs } },
      fieldValues: {
        nodes: [
          {
            __typename: 'ProjectV2ItemFieldNumberValue',
            id: 'V_EST',
            field: { id: estimateId },
            number: current.estimate ?? null,
          },
          {
            __typename: 'ProjectV2ItemFieldSingleSelectValue',
            id: 'V_SIZE',
            field: { id: sizeId },
            name: current.size ?? null,
            optionId: current.size == null ? null : 'OPT_' + current.size,
          },
        ],
      },
    };
    const p = createTrafficProvider({
      population: {
        repository: {
          nameWithOwner: cfg.repo,
          issue: { ...content, body: getBody(), projectItems: { nodes: [item] } },
        },
      },
      shapes: targetShapes,
    });
    try {
      return await p.graphql(request);
    } finally {
      calls.push(...p.ledger);
    }
  };
  return { graphql, calls };
}
