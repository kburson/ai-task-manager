// @story #2069
import { observeContent } from '../../task-tracker/lib/story-cache/native-observation.mjs';
import { stageOwnedComment } from '../../task-tracker/lib/story-cache/stage-comment.mjs';
import { context } from './story-timing-candidate-fixture.mjs';
const body = (suffix, size, hours) =>
  `### 🔁 Plan re-estimate\n\n**HUMAN ATTENTION**: not auto-applied\n\n| Field | Before | After |\n|---|---|---|\n| Size | ${size} | ${size} |\n| Estimate (h) | ${hours} | ${hours} |\n\n<!-- aitm-estimate-operation: 11111111-1111-4111-8111-11111111100${suffix} -->\n\n<!-- aitm-owned-comment key="estimate.proposal:${suffix}" -->`;
export function addPublishedPlanProposal({ generation, payloads, identity, size, hours }) {
  const text = body(2, size, hours);
  const { body: ignored, ...row } = observeContent({
    identity,
    node: {
      id: 'IC_Z_prior_proposal',
      lastEditedAt: null,
      includesCreatedEdit: false,
      userContentEdits: { totalCount: 0, nodes: [] },
    },
    body: text,
  });
  void ignored;
  payloads.set('base/prior-proposal.md', text);
  generation.baseSnapshot.resources['comment:IC_Z_prior_proposal'] = {
    ...row,
    ownership: 'owned',
    payloadPath: 'base/prior-proposal.md',
  };
  generation.baseSnapshot.inventory.push('IC_Z_prior_proposal');
  generation.baseSnapshot.inventory.sort();
}
export async function stagePendingPlanProposal({ f, size, hours }) {
  return context(f.root, () =>
    stageOwnedComment({
      store: f.store,
      claim: f.claim,
      key: 'comment:new:A_new_proposal',
      body: body(1, size, hours),
    })
  );
}
