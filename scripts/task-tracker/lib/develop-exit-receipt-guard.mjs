// @story #937

import { execFileSync } from 'node:child_process';
import {
  hasMalformedVerificationReceiptClaim,
  hasVerificationReceiptMarker,
  parseVerificationReceipt,
  qualifyRecordedDevelopReceipt,
  validateVerificationReceiptStructure,
  validateVerificationReceiptCommandAuthority,
} from './verification-receipt.mjs';
import { hasAcceptedTestEvidence } from './github-records/lifecycle-gate-source.mjs';

export const GUARD_ID = 'develop-exit-receipt';
const nativeReadData = new WeakMap();

function resolveHead(ctx, reads) {
  if (/^[0-9a-f]{40}$/.test(String(ctx?.headSha || ''))) return ctx.headSha;
  if (typeof ctx?.projectDir !== 'string') return null;
  let options;
  try {
    options = { cwd: ctx.projectDir, encoding: 'utf8' };
    const stdout = execFileSync('git', ['rev-parse', 'HEAD'], options);
    reads.push(Object.freeze({ cwd: options.cwd, stdout, stderr: '', exitCode: 0 }));
    return stdout.trim();
  } catch (error) {
    if (options) reads.push(Object.freeze({ cwd: options.cwd, stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''), exitCode: Number.isInteger(error.status) ? error.status : null }));
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
  return structural.ok && qualifyRecordedDevelopReceipt({ receipt, issueNumber, headSha });
}

export const developExitReceiptGuard = Object.freeze({
  id: GUARD_ID,
  async run(ctx) {
    if (ctx?.toState && ctx.toState !== 'test') return { ok: true };
    if (typeof ctx?.body !== 'string') return { ok: true };
    if (hasAcceptedTestEvidence(ctx.lifecycleEvidence)) return { ok: true };
    if (hasMalformedVerificationReceiptClaim(ctx.body)) {
      const reason =
        'develop-to-test-receipt-malformed: a claimed verification receipt is malformed and cannot establish authority';
      return { ok: false, reason, blockers: [reason] };
    }
    const reads = [];
    let native = false;
    try {
      const contextFields = Object.getOwnPropertyDescriptors(ctx);
      const contextPrototype = Object.getPrototypeOf(ctx);
      const plain = contextPrototype === Object.prototype || contextPrototype === null;
      const dataFields = Object.values(contextFields).every(field => Object.hasOwn(field, 'value'));
      const inherited = key => contextPrototype !== null && Object.getOwnPropertyDescriptor(contextPrototype, key) !== undefined;
      const deps = contextFields.deps?.value;
      const fields = deps == null ? {} : Object.getOwnPropertyDescriptors(deps);
      const prototype = deps == null ? null : Object.getPrototypeOf(deps);
      // Never execute optional ctx/deps getters or move their original reads.
      native = plain && dataFields && !Object.hasOwn(contextFields, 'headSha') &&
        !['headSha', 'deps', 'projectDir'].some(inherited) &&
        (deps == null || ((prototype === Object.prototype || prototype === null) &&
          !Object.hasOwn(fields, 'readDevelopReceipt') &&
          (prototype === null || Object.getOwnPropertyDescriptor(prototype, 'readDevelopReceipt') === undefined) &&
          Object.values(fields).every(field => Object.hasOwn(field, 'value'))));
    } catch { native = false; }
    const headSha = resolveHead(ctx, reads);
    const finish = out => {
      if (native && reads.length === 1) nativeReadData.set(out, Object.freeze({ projectDir: reads[0].cwd, head: reads[0] }));
      return out;
    };
    const readReceipt =
      ctx?.deps?.readDevelopReceipt || ((body) => parseVerificationReceipt(body, 'develop-final'));
    const receipt = await readReceipt(ctx.body);
    if (headSha && receiptPasses(receipt, ctx.issueNumber, headSha)) {
      if (hasVerificationReceiptMarker(ctx.body, 'develop-final')) {
        const authority = validateVerificationReceiptCommandAuthority({
          body: ctx.body,
          expectedIssue: Number(ctx.issueNumber),
          expectedStage: 'develop-final',
          expectedCommitSha: headSha,
          projectDir: ctx.projectDir || process.cwd(),
        });
        if (!authority.ok) {
          const code = authority.reasons[0]?.code || 'invalid';
          const reason = `develop-to-test-receipt-${code}: the Develop receipt no longer matches live Verification Commands authority`;
          return finish({ ok: false, reason, blockers: [reason] });
        }
      }
      return finish({ ok: true });
    }
    const reason =
      'develop-to-test-receipt-missing: a fresh Develop action receipt for exact HEAD is required before Test entry';
    return finish({ ok: false, reason, blockers: [reason] });
  },
});

const originalRun = developExitReceiptGuard.run;
export function readDevelopReceiptReadData(result, invocation) {
  try {
    if (!invocation || Object.keys(invocation).sort().join(',') !== 'guard,id,run' ||
        invocation.guard !== developExitReceiptGuard || invocation.run !== originalRun ||
        invocation.id !== GUARD_ID) return null;
    return result && typeof result === 'object' ? nativeReadData.get(result) ?? null : null;
  } catch { return null; }
}
