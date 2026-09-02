import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseIssueKind } from './issue-kind.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';
import {
  buildVerificationFingerprint,
  hasEarnedDocsOnlyLaneSkip,
  parseVerificationReceipt,
  requiredTestReceiptClassifications,
  validateVerificationReceipt,
} from './verification-receipt.mjs';

const pexec = promisify(execFile);

async function defaultGetHeadSha({ projectDir }) {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD'], { cwd: projectDir });
  return String(stdout || '').trim();
}

export async function resolveDocsOnlyLaneSkipProof({
  body,
  issueNumber,
  projectDir,
  deps = {},
} = {}) {
  if (parseIssueKind(body) !== 'docs-only') return false;
  const parseReceipt = deps.parseVerificationReceipt || parseVerificationReceipt;
  const receipt = parseReceipt(body, 'test');
  const earned = deps.hasEarnedDocsOnlyLaneSkip || hasEarnedDocsOnlyLaneSkip;
  if (!receipt || !earned(receipt)) return false;

  try {
    const getHeadSha = deps.getHeadSha || defaultGetHeadSha;
    const commitSha = await getHeadSha({ projectDir });
    const buildFingerprint = deps.buildVerificationFingerprint || buildVerificationFingerprint;
    const fingerprint = await buildFingerprint({
      projectDir,
      commitSha,
      verificationCommands: parseVerificationCommands(body),
    });
    const required = (
      deps.requiredTestReceiptClassifications || requiredTestReceiptClassifications
    )(receipt);
    const validate = deps.validateVerificationReceipt || validateVerificationReceipt;
    return Boolean(
      validate({
        receipt,
        expectedIssue: Number(issueNumber),
        expectedStage: 'test',
        fingerprint,
        required,
      })?.ok
    );
  } catch {
    return false;
  }
}
