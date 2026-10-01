// @story #1857
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { runClose } from '../../../helpers/close-convergence-wiring-helpers.mjs';
import {
  REUSED_SHA_A as SHA_A,
  reusedBranchDeliveryBody as deliveryBody,
} from '../../../helpers/reused-branch-delivery-harness.mjs';

test('#1857 no-command child Close uses posted deliverable and exact accepted Test Review heads', async () => {
  const quote = String.fromCharCode(34),
    nl = String.fromCharCode(10);
  const body =
    deliveryBody(SHA_A) +
    nl +
    '## AITM Progress Markers' +
    nl +
    nl +
    '<!-- aitm-issue-kind kind=' +
    quote +
    'research' +
    quote +
    ' -->' +
    nl +
    '<!-- aitm-deliverable-posted url=' +
    quote +
    'https://example.test/report' +
    quote +
    ' ts=' +
    quote +
    '2026-08-02T14:00:00.000Z' +
    quote +
    ' -->' +
    nl;
  let observed;
  const result = await runClose({
    issueNumber: 1857,
    body,
    acceptedSha: SHA_A,
    deliveryGateInput: {
      issueNumber: 1857,
      repository: 'o/r',
      body,
      acceptedSha: SHA_A,
      lineage: { parentIssueNumber: 1847, deliveryTarget: 'epic/1847' },
    },
    contextOverrides: {
      closeOutcomeLineageDeps: {
        listComments: async () => {
          throw new Error('resident child must not invent a commit trail');
        },
      },
    },
    createEstimationOutcomeWriter: (options) => ({
      ensure: async ({ issueNumber }) => {
        observed = await options.resolveDeliveryAuthority({ issueNumber, refresh: true });
        assert.equal(observed.testReceiptSha, SHA_A);
        assert.equal(observed.acceptedReviewSha, SHA_A);
        assert.equal(observed.lineageEvidence, undefined);
        return { status: 'existing' };
      },
    }),
  });
  assert.equal(result.exitCode, 0);
  assert.ok(observed);
});

test('#1857 child outcome callback obtains the existing lineage gate exact census', async () => {
  let observed = null;
  const commit = 'c'.repeat(40),
    target = 'd'.repeat(40);
  const result = await runClose({
    issueNumber: 1857,
    deliveryGateInput: {
      issueNumber: 1857,
      repository: 'o/r',
      acceptedSha: SHA_A,
      lineage: { parentIssueNumber: 1847, deliveryTarget: 'epic/1847' },
    },
    acceptedSha: SHA_A,
    contextOverrides: {
      closeOutcomeLineageDeps: {
        trunk: 'trunk',
        graph: (issue) => ({ parent: issue === 1857 ? 1847 : null, children: [] }),
        branchExists: () => true,
        resolveHead: async () => target,
        listComments: async () => [
          {
            body:
              '### 🔗 Commits' +
              String.fromCharCode(10) +
              '<!-- aitm-commits shas=' +
              String.fromCharCode(34) +
              commit +
              String.fromCharCode(34) +
              ' -->',
          },
        ],
        attributingCommits: async (issue, options) => {
          assert.deepEqual(options.refs, [target]);
          return [{ sha: commit }];
        },
      },
    },
    createEstimationOutcomeWriter: (options) => ({
      ensure: async ({ issueNumber }) => {
        observed = await options.resolveDeliveryAuthority({ issueNumber, refresh: true });
        assert.equal(observed.lineageEvidence.parentIssue, 1847);
        assert.equal(observed.lineageEvidence.acceptedSha, SHA_A);
        assert.equal(observed.lineageEvidence.targetHead, target);
        assert.deepEqual(observed.lineageEvidence.commits, [commit]);
        return { status: 'existing' };
      },
    }),
  });
  assert.equal(result.exitCode, 0);
  assert.ok(observed);
});

test('#1857 skipped child lineage cannot become canonical outcome authority', async () => {
  let attempted = false;
  let refusal = null;
  const result = await runClose({
    issueNumber: 1857,
    acceptedSha: SHA_A,
    deliveryGateInput: {
      issueNumber: 1857,
      repository: 'o/r',
      acceptedSha: SHA_A,
      lineage: { parentIssueNumber: 1847, deliveryTarget: 'epic/1847' },
    },
    contextOverrides: { closeOutcomeLineageDeps: { listComments: async () => [] } },
    createEstimationOutcomeWriter: (options) => ({
      ensure: async ({ issueNumber }) => {
        attempted = true;
        try {
          await options.resolveDeliveryAuthority({ issueNumber, refresh: true });
        } catch (error) {
          refusal = error.message;
          throw error;
        }
        throw new Error('skipped lineage was accepted');
      },
    }),
  });
  assert.equal(attempted, true);
  assert.equal(refusal, 'close-estimation-delivery-authority:lineage-unavailable');
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.issueCloses, 0);
  assert.equal(result.calls.bindingReleases, 0);
});
