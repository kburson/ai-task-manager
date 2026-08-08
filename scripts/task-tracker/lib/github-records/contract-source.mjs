import { parseAcceptanceCriteria } from '../acceptance-criteria.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
import { validateContractProjection } from './delivery-contract.mjs';
import { getCommentsByNodeIds } from './github-comment-store.mjs';
import { parseIssueDirectory } from './issue-directory.mjs';

const RECORD_SCHEMA = 'aitm.record/v1';
const RECORD_TYPE = 'singleton-projection';
const RECORD_END = '\n-->\n';

export class ContractSourceError extends TypeError {
  constructor(category, cause) {
    super(`contract-source:${category}`, cause === undefined ? undefined : { cause });
    this.name = 'ContractSourceError';
    this.category = category;
  }
}

function fail(category, cause) {
  throw new ContractSourceError(category, cause);
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function legacyDodItems(issueBody) {
  const lines = String(issueBody).split('\n');
  const heading = lines.findIndex((line) => /^##\s+Definition of Done\s*$/.test(line));
  if (heading === -1) return [];
  const items = [];
  const used = new Set();
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    const checkbox = /^- \[([ x])\]\s+(.+)$/.exec(lines[index]);
    if (!checkbox) continue;
    const key = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i.exec(checkbox[2])?.[1];
    const declaration = checkbox[2];
    const baseId = key ? `dod-${key.toLowerCase()}` : `dod-${items.length + 1}`;
    let logicalId = baseId;
    let suffix = 2;
    while (used.has(logicalId)) logicalId = `${baseId}-${suffix++}`;
    used.add(logicalId);
    items.push({
      logicalId,
      text: cleanText(declaration),
      declaration,
      checked: checkbox[1] === 'x',
    });
  }
  return items;
}

function legacyContract(issueBody) {
  const acceptanceCriteria = (parseAcceptanceCriteria(issueBody) ?? []).map((item, index) => ({
    logicalId: `ac-${index + 1}`,
    text: cleanText(item.label),
    declaration: item.label,
    checked: item.checked,
  }));
  const verificationCommands = parseVerificationCommands(issueBody).map((item, index) => ({
    logicalId: `vc-${item.id ?? index + 1}`,
    command: item.command,
    checked: item.checked,
  }));
  return deepFreeze({
    acceptanceCriteria,
    verificationCommands,
    definitionOfDone: legacyDodItems(issueBody),
    acceptedRecordIds: [],
  });
}

function recordMarkdown(body) {
  if (typeof body !== 'string') fail('record');
  const end = body.indexOf(RECORD_END);
  if (end === -1) fail('record');
  return body.slice(end + RECORD_END.length);
}

function validateRecord(record, { repository, issue, commentNodeId }) {
  const envelope = record?.envelope;
  const contract = envelope?.payload;
  if (
    record?.commentNodeId !== commentNodeId ||
    envelope?.schema !== RECORD_SCHEMA ||
    envelope?.recordType !== RECORD_TYPE ||
    envelope?.repository !== repository ||
    envelope?.issue !== issue ||
    envelope?.recordId !== contract?.recordId ||
    envelope?.authority?.epoch !== contract?.authorityEpoch ||
    envelope?.authority?.grantId !== contract?.coordinatorGrantId
  ) {
    fail('record');
  }
  try {
    validateContractProjection({ contract, markdown: recordMarkdown(record.body) });
  } catch (error) {
    fail(
      error?.message === 'delivery-contract:projection-mismatch' ? 'projection' : 'contract',
      error
    );
  }
  return contract;
}

function githubContract(contract) {
  const checked = (kind, logicalId) => contract.lifecycleProjection[kind][logicalId] === true;
  return deepFreeze({
    acceptanceCriteria: contract.acceptanceCriteria.map(({ logicalId, text: declaration }) => ({
      logicalId,
      text: cleanText(declaration),
      declaration,
      checked: checked('acceptanceCriteria', logicalId),
    })),
    verificationCommands: contract.verificationCommands.map(({ logicalId, command }) => ({
      logicalId,
      command,
      checked: checked('verificationCommands', logicalId),
    })),
    definitionOfDone: contract.definitionOfDone.map(({ logicalId, text: declaration }) => ({
      logicalId,
      text: cleanText(declaration),
      declaration,
      checked: checked('definitionOfDone', logicalId),
    })),
    acceptedRecordIds: [...contract.acceptedRecordIds],
  });
}

function assertInput({ repository, issue, issueBody }) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    typeof issueBody !== 'string'
  ) {
    fail('input');
  }
}

export async function resolveContractSource({
  repository,
  issue,
  issueBody,
  graphql,
  readContractRecord,
} = {}) {
  assertInput({ repository, issue, issueBody });
  let directory;
  try {
    directory = parseIssueDirectory({ issueBody });
  } catch (error) {
    fail('directory', error);
  }
  if (directory === null) {
    return deepFreeze({
      sourceKind: 'legacy-body/v1',
      contract: legacyContract(issueBody),
      authority: null,
    });
  }

  const commentNodeId = directory.singletons['delivery-contract'];
  const reader =
    readContractRecord ??
    (typeof graphql === 'function'
      ? async (input) => (await getCommentsByNodeIds({ ...input, ids: [input.commentNodeId] }))[0]
      : null);
  if (typeof reader !== 'function') fail('reader');
  let record;
  try {
    record = await reader({ repository, issue, commentNodeId, graphql });
  } catch (error) {
    fail('unavailable', error);
  }
  const contract = validateRecord(record, { repository, issue, commentNodeId });
  return deepFreeze({
    sourceKind: 'github-records/v1',
    contract: githubContract(contract),
    authority: {
      contractRecordId: contract.recordId,
      contractEpoch: contract.contractEpoch,
      authorityEpoch: contract.authorityEpoch,
      coordinatorGrantId: contract.coordinatorGrantId,
      commentNodeId,
    },
  });
}
