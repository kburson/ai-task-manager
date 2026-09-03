// @story #1500
import { randomUUID } from 'node:crypto';
import { inspectEnrollment } from './migration.mjs';
import { renderProtocolMarker } from './protocol.mjs';
import { validateRuntimeCapability } from './runtime-capabilities.mjs';
import { fail, frozen, hash, uuidValue } from './value.mjs';

export { inspectEnrollment } from './migration.mjs';

export async function enrollIssue({
  repositoryId,
  issueNumber,
  planDigest,
  operationId,
  authorityHostId,
  ports,
}) {
  uuidValue(operationId, 'enrollment-operation');
  uuidValue(authorityHostId, 'enrollment-authority-host');
  for (const name of [
    'withAuthorityLock',
    'appendImportRecords',
    'readImportRecords',
    'writeProjection',
  ])
    if (typeof ports?.[name] !== 'function') fail(`enrollment-${name}-port`);
  return ports.withAuthorityLock(
    { repositoryId, issueNumber, operationId, authorityHostId },
    async () => {
      const current = await inspectEnrollment({ repositoryId, issueNumber, ports });
      if (current.digest !== planDigest) fail('migration-plan-stale');
      const capability = await ports.readRuntimeCapability({ repositoryId, issueNumber });
      const residentEntries = await ports.listResidentEntries({ repositoryId, issueNumber });
      validateRuntimeCapability(capability, { authorityHostId, residentEntries });
      const records = current.imports.map((record, index) =>
        frozen({
          ...record,
          operationId,
          sequence: index + 1,
          planDigest,
        })
      );
      await ports.appendImportRecords(records);
      const saved = await ports.readImportRecords({ repositoryId, issueNumber, operationId });
      if (hash(saved) !== hash(records)) fail('import-readback');
      const marker = renderProtocolMarker({
        schema: 'aitm.evidence-projection/v2',
        repositoryId,
        issueNumber,
        cycleId: randomUUID(),
        headId: hash(records),
        authorityHostId,
      });
      await ports.writeProjection(marker, { expectedPlanDigest: planDigest, operationId });
      return frozen({ status: 'enrolled', planDigest, marker, records });
    }
  );
}
