// @story #1500
import { randomUUID } from 'node:crypto';
import { guardEvidenceMutation } from './entry-guard.mjs';
import { selectEvidenceProtocol } from './protocol.mjs';
import { fail, frozen, uuidValue } from './value.mjs';

export async function reopenEvidenceCycle({
  repositoryId,
  issueNumber,
  operationId,
  reason,
  runtime,
}) {
  uuidValue(operationId, 'reopen-operation');
  if (typeof reason !== 'string' || !reason.trim()) fail('reopen-reason');
  const issue = await runtime.ports.readIssue({ repositoryId, issueNumber });
  const selection = selectEvidenceProtocol({ body: issue.body, context: runtime.context });
  const capability = await runtime.ports.readRuntimeCapability({ repositoryId, issueNumber });
  const residentEntries = await runtime.ports.listResidentEntries({ repositoryId, issueNumber });
  guardEvidenceMutation({
    selection,
    capability,
    authorityHostId: runtime.authorityHostId,
    residentEntries,
    verb: 'reopen',
  });
  if (issue.state !== 'CLOSED') fail('reopen-state');
  const event = frozen({
    schema: 'aitm.reopen/v2',
    operationId,
    cycleId: selection.projection.cycleId,
    nextCycleId: randomUUID(),
    reason: reason.trim(),
  });
  await runtime.ports.reopenIssue(event);
  return frozen({ status: 'reopened', event });
}
