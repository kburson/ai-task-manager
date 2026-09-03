// @story #1500
import { inspectEnrollment, enrollIssue } from '../lib/evidence-v2/enrollment.mjs';

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}
function issueNumber(token) {
  const value = Number(String(token || '').replace(/^#/, ''));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('Usage: aitm evidence <inspect|enroll> <N>');
  return value;
}

export async function verbEvidence(ctx) {
  const [action, issueToken, ...flags] = ctx.rest;
  if (!ctx.evidenceV2) throw new Error('evidence-v2:runtime-unavailable');
  const issue = issueNumber(issueToken);
  const common = {
    repositoryId: ctx.evidenceV2.repositoryId,
    issueNumber: issue,
    ports: ctx.evidenceV2.ports,
  };
  if (action === 'inspect') {
    const result = await inspectEnrollment(common);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  if (action === 'enroll') {
    const result = await enrollIssue({
      ...common,
      planDigest: value(flags, '--plan-digest'),
      operationId: value(flags, '--operation-id'),
      authorityHostId: ctx.evidenceV2.authorityHostId,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  throw new Error('Usage: aitm evidence <inspect|enroll> <N>');
}
