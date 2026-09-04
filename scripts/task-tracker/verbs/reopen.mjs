// @story #1500
import { reopenEvidenceCycle } from '../lib/evidence-v2/reopen.mjs';

function flag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
export async function verbReopen(ctx) {
  if (!ctx.evidenceV2) throw new Error('evidence-v2:runtime-unavailable');
  const issueNumber = Number(String(ctx.rest[0] || '').replace(/^#/, ''));
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0)
    throw new Error('Usage: aitm reopen <N> --operation-id <uuid> --reason <text>');
  const result = await reopenEvidenceCycle({
    repositoryId: ctx.evidenceV2.repositoryId,
    issueNumber,
    operationId: flag(ctx.rest, '--operation-id'),
    reason: flag(ctx.rest, '--reason'),
    runtime: ctx.evidenceV2,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}
