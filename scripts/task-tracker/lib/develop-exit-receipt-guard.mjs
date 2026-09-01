// @story #937

import { execFileSync } from 'node:child_process';
import {
  parseVerificationReceipt,
  validateVerificationReceiptStructure,
} from './verification-receipt.mjs';
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';

export const GUARD_ID = 'develop-exit-receipt';

function resolveHead(ctx) {
  if (/^[0-9a-f]{40}$/.test(String(ctx?.headSha || ''))) return ctx.headSha;
  if (typeof ctx?.projectDir !== 'string') return null;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ctx.projectDir,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function receiptPasses(receipt, issueNumber, headSha) {
  if (receipt?.ok === true) {
    return receipt.stage === 'develop-final' && receipt.commitSha === headSha;
  }
  const structural = validateVerificationReceiptStructure({
    receipt,
    expectedIssue: Number(issueNumber),
    expectedStage: 'develop-final',
  });
  if (!structural.ok || receipt.commitSha !== headSha) return false;
  return ['lint-full', 'format-full'].every((classification) =>
    receipt.commands.some(
      (command) => command.classification === classification && command.exitCode === 0
    )
  );
}

export const developExitReceiptGuard = Object.freeze({
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
    const headSha = resolveHead(ctx);
    const readReceipt =
      ctx?.deps?.readDevelopReceipt || ((body) => parseVerificationReceipt(body, 'develop-final'));
    const receipt = await readReceipt(ctx.body);
    if (headSha && receiptPasses(receipt, ctx.issueNumber, headSha)) return { ok: true };
    const reason =
      'develop-to-test-receipt-missing: a fresh Develop action receipt for exact HEAD is required before Test entry';
    return { ok: false, reason, blockers: [reason] };
  },
});
