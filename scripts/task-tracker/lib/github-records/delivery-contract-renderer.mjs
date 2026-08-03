import { createHash } from 'node:crypto';

function projectionHash(markdown) {
  return `sha256:${createHash('sha256').update(markdown).digest('hex')}`;
}

function renderDefinitions(entries, renderEntry) {
  return entries.map(renderEntry).join('\n');
}

function checkbox(contract, kind, logicalId) {
  return contract.lifecycleProjection?.[kind]?.[logicalId] === true ? 'x' : ' ';
}

export function renderDeliveryContract({ contract } = {}) {
  const markdown = [
    '## Delivery Contract',
    '',
    '### Acceptance Criteria',
    '',
    renderDefinitions(
      contract.acceptanceCriteria,
      ({ logicalId, text }) =>
        `- [${checkbox(contract, 'acceptanceCriteria', logicalId)}] [${logicalId}] ${text}`
    ),
    '',
    '### Verification Commands',
    '',
    renderDefinitions(
      contract.verificationCommands,
      ({ logicalId, command }) =>
        `- [${checkbox(contract, 'verificationCommands', logicalId)}] [${logicalId}] \`${command}\``
    ),
    '',
    '### Definition of Done',
    '',
    renderDefinitions(
      contract.definitionOfDone,
      ({ logicalId, text }) =>
        `- [${checkbox(contract, 'definitionOfDone', logicalId)}] [${logicalId}] ${text}`
    ),
    '',
  ].join('\n');

  return Object.freeze({ markdown, projectionHash: projectionHash(markdown) });
}

export function validateRenderedContractProjection({ contract, markdown } = {}) {
  const rendered = renderDeliveryContract({ contract });
  if (rendered.markdown !== markdown || rendered.projectionHash !== contract.projectionHash) {
    throw new TypeError('delivery-contract:projection-mismatch');
  }
  return true;
}
