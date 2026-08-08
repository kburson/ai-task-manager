import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { promisify } from 'node:util';

import { gql } from '../../gh/lib/github-projects.mjs';
import { parseAcceptanceCriteria } from '../lib/acceptance-criteria.mjs';
import {
  appendCapsule,
  isCapsuleRecordType,
  validateCapsuleChain,
} from '../lib/github-records/capsule-chain.mjs';
import { canonicalRecordJson } from '../lib/github-records/canonical-json.mjs';
import { resolveContractSource } from '../lib/github-records/contract-source.mjs';
import { renderContractProjectionRecord } from '../lib/github-records/contract-write.mjs';
import {
  createDraftContract,
  sealContract,
  validateDeliveryContract,
} from '../lib/github-records/delivery-contract.mjs';
import {
  createIssueComment,
  getCommentsByNodeIds,
  listIssueCommentsSince,
  readBackComment,
  updateIssueComment,
} from '../lib/github-records/github-comment-store.mjs';
import {
  parseIssueDirectory,
  renderIssueDirectory,
} from '../lib/github-records/issue-directory.mjs';
import {
  createAitmRecordEnvelope,
  createRecordId,
} from '../lib/github-records/record-envelope.mjs';
import {
  initializeIssueDirectory,
  repairIssueDirectory,
} from '../lib/github-records/singleton-initializer.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { parseVerificationCommands } from '../lib/verification-commands.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

function adoptionError(category) {
  return new TypeError(`adopt-github-records:${category}`);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function legacyDod(issueBody) {
  const lines = String(issueBody).split('\n');
  const heading = lines.findIndex((line) => /^##\s+Definition of Done\s*$/.test(line));
  if (heading === -1) return [];
  const items = [];
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    const match = /^- \[([ x])\]\s+(.+)$/.exec(lines[index]);
    if (!match) continue;
    const marker = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i.exec(match[2]);
    items.push({
      logicalId: marker ? `dod-${marker[1].toLowerCase()}` : `dod-${items.length + 1}`,
      text: cleanText(match[2]),
      declaration: match[2],
      checked: match[1] === 'x',
    });
  }
  return items;
}

function legacyContract(issueBody) {
  return {
    acceptanceCriteria: (parseAcceptanceCriteria(issueBody) ?? []).map((item, index) => ({
      logicalId: `ac-${index + 1}`,
      text: cleanText(item.label),
      declaration: item.label,
      checked: item.checked,
    })),
    verificationCommands: parseVerificationCommands(issueBody).map((item, index) => ({
      logicalId: `vc-${item.id ?? index + 1}`,
      command: item.command,
      checked: item.checked,
    })),
    definitionOfDone: legacyDod(issueBody),
    acceptedRecordIds: [],
  };
}

function definitions(source) {
  return {
    acceptanceCriteria: source.acceptanceCriteria.map(({ logicalId, text }) => ({
      logicalId,
      text,
    })),
    verificationCommands: source.verificationCommands.map(({ logicalId, command }) => ({
      logicalId,
      command,
    })),
    definitionOfDone: source.definitionOfDone.map(({ logicalId, text }) => ({ logicalId, text })),
  };
}

function lifecycleProjection(source) {
  return {
    acceptanceCriteria: Object.fromEntries(
      source.acceptanceCriteria.map(({ logicalId, checked }) => [logicalId, checked])
    ),
    verificationCommands: Object.fromEntries(
      source.verificationCommands.map(({ logicalId, checked }) => [logicalId, checked])
    ),
    definitionOfDone: Object.fromEntries(
      source.definitionOfDone.map(({ logicalId, checked }) => [logicalId, checked])
    ),
  };
}

function projectedContract(contract) {
  const checked = (kind, logicalId) => contract.lifecycleProjection?.[kind]?.[logicalId] === true;
  return {
    acceptanceCriteria: (contract.acceptanceCriteria ?? []).map(({ logicalId, text }) => ({
      logicalId,
      text: cleanText(text),
      declaration: text,
      checked: checked('acceptanceCriteria', logicalId),
    })),
    verificationCommands: (contract.verificationCommands ?? []).map(({ logicalId, command }) => ({
      logicalId,
      command,
      checked: checked('verificationCommands', logicalId),
    })),
    definitionOfDone: (contract.definitionOfDone ?? []).map(({ logicalId, text }) => ({
      logicalId,
      text: cleanText(text),
      declaration: text,
      checked: checked('definitionOfDone', logicalId),
    })),
    acceptedRecordIds: [...(contract.acceptedRecordIds ?? [])],
  };
}

function parityDomain(contract) {
  return {
    acceptanceCriteria: contract.acceptanceCriteria.map(({ logicalId, text, checked }) => ({
      logicalId,
      text,
      checked,
    })),
    verificationCommands: contract.verificationCommands.map(({ logicalId, command, checked }) => ({
      logicalId,
      command,
      checked,
    })),
    definitionOfDone: contract.definitionOfDone.map(({ logicalId, text, checked }) => ({
      logicalId,
      text,
      checked,
    })),
    acceptedRecordIds: [...contract.acceptedRecordIds],
  };
}

export function buildAdoptionParity({ legacyBody, contract } = {}) {
  if (typeof legacyBody !== 'string' || contract === null || typeof contract !== 'object') {
    throw adoptionError('input');
  }
  const source = legacyContract(legacyBody);
  const projected = projectedContract(contract);
  const sourceDomain = parityDomain(source);
  const projectedDomain = parityDomain(projected);
  const definitionHash = `sha256:${createHash('sha256')
    .update(canonicalRecordJson(sourceDomain))
    .digest('hex')}`;
  return Object.freeze({
    exact: isDeepStrictEqual(sourceDomain, projectedDomain),
    definitionHash,
    counts: Object.freeze({
      acceptanceCriteria: source.acceptanceCriteria.length,
      definitionOfDone: source.definitionOfDone.length,
      verificationCommands: source.verificationCommands.length,
    }),
    projectedContract: Object.freeze(projected),
  });
}

function draftFromLegacy({ source, contractRecordId, authority }) {
  const defs = definitions(source);
  return createDraftContract({
    ...defs,
    recordId: contractRecordId,
    authorityEpoch: authority.epoch,
    coordinatorGrantId: authority.grantId,
    lifecycleProjection: lifecycleProjection(source),
    acceptedRecordIds: [],
  });
}

function requireDeps(deps, names) {
  for (const name of names) {
    if (typeof deps?.[name] !== 'function') throw adoptionError('deps');
  }
}

async function rollback(input) {
  requireDeps(input.deps, ['inspectAdoption', 'removeDirectoryProjection']);
  const inspection = await input.deps.inspectAdoption(input);
  if (!inspection?.adopted) throw adoptionError('not-adopted');
  if (inspection.divergent) throw adoptionError('divergent');
  await input.deps.removeDirectoryProjection(input);
  return Object.freeze({ status: 'rolled-back' });
}

async function repair(input) {
  requireDeps(input.deps, ['repairIssueDirectory']);
  const result = await input.deps.repairIssueDirectory({
    repository: input.repository,
    issue: input.issueNumber,
    issueNodeId: input.issueNodeId,
    actor: input.authority?.actor,
  });
  return Object.freeze({ status: result.repaired ? 'repaired' : 'clean', ...result });
}

export function adoptionSnapshotDivergent({ directory, records, capsules } = {}) {
  const singletonIds = directory?.singletons;
  if (
    singletonIds === null ||
    typeof singletonIds !== 'object' ||
    !Array.isArray(records) ||
    records.length !== 4 ||
    !Array.isArray(capsules) ||
    capsules.length !== 1
  ) {
    return true;
  }
  const byId = new Map(records.map((record) => [record?.commentNodeId, record]));
  if (byId.size !== 4) return true;
  const contract = byId.get(singletonIds['delivery-contract'])?.envelope?.payload;
  if (
    contract?.schema !== 'aitm.delivery-contract/v1' ||
    contract.revision !== 1 ||
    contract.contractEpoch !== 1 ||
    contract.status !== 'sealed' ||
    !Array.isArray(contract.acceptedRecordIds) ||
    contract.acceptedRecordIds.length !== 0
  ) {
    return true;
  }
  for (const kind of ['coordination', 'evidence-projection', 'timing']) {
    const payload = byId.get(singletonIds[kind])?.envelope?.payload;
    if (
      payload?.schema !== 'aitm.singleton/v1' ||
      payload.kind !== kind ||
      typeof payload.logicalId !== 'string' ||
      !hasExactlyKeys(payload, ['kind', 'logicalId', 'schema'])
    ) {
      return true;
    }
  }
  const seal = capsules[0]?.envelope;
  return seal?.recordType !== 'contract-sealed' || !isDeepStrictEqual(seal.payload, contract);
}

export async function adoptIssueRecords(input = {}) {
  const {
    repository,
    issueNumber,
    issueBody,
    issueNodeId,
    authority,
    contractRecordId,
    deps = {},
  } = input;
  if (
    typeof repository !== 'string' ||
    !Number.isInteger(issueNumber) ||
    issueNumber <= 0 ||
    typeof issueBody !== 'string'
  ) {
    throw adoptionError('input');
  }
  const action = input.action ?? (input.dryRun === false ? 'apply' : 'audit');
  if (action === 'rollback') return rollback({ ...input, deps });
  if (action === 'repair') return repair({ ...input, deps });
  if (!['audit', 'apply'].includes(action)) throw adoptionError('action');

  const source = await resolveContractSource({ repository, issue: issueNumber, issueBody });
  if (source.sourceKind !== 'legacy-body/v1') {
    return Object.freeze({ status: 'already-adopted', source });
  }
  if (
    typeof issueNodeId !== 'string' ||
    typeof authority?.actor !== 'string' ||
    !Number.isSafeInteger(authority?.epoch) ||
    typeof authority?.grantId !== 'string' ||
    typeof contractRecordId !== 'string'
  ) {
    throw adoptionError('authority');
  }
  const auditDraft = draftFromLegacy({ source: source.contract, contractRecordId, authority });
  const auditContract = sealContract({
    contract: auditDraft,
    authorityEpoch: authority.epoch,
    coordinatorGrantId: authority.grantId,
  }).contract;
  const audited = input.parityOverride ? input.parityOverride(auditContract) : auditContract;
  const parity = buildAdoptionParity({ legacyBody: issueBody, contract: audited });
  if (!parity.exact) throw adoptionError('parity');
  if (action === 'audit') return Object.freeze({ status: 'dry-run', parity });

  requireDeps(deps, [
    'prepareIssueSingletons',
    'appendContractSeal',
    'updateContractProjection',
    'publishIssueDirectory',
    'readBackAdoption',
  ]);
  const initialized = await deps.prepareIssueSingletons({
    repository,
    issue: issueNumber,
    issueNodeId,
    actor: authority.actor,
  });
  const commentNodeId = initialized?.directory?.singletons?.['delivery-contract'];
  if (typeof commentNodeId !== 'string') throw adoptionError('directory');
  const contractSingleton = initialized.singletons?.find(
    (record) => record?.commentNodeId === commentNodeId
  );
  if (typeof contractSingleton?.envelope?.recordId !== 'string') {
    throw adoptionError('directory');
  }
  const liveDraft = draftFromLegacy({
    source: source.contract,
    contractRecordId: contractSingleton.envelope.recordId,
    authority,
  });
  const liveContract = sealContract({
    contract: liveDraft,
    authorityEpoch: authority.epoch,
    coordinatorGrantId: authority.grantId,
  }).contract;
  const proposed = input.parityOverride ? input.parityOverride(liveContract) : liveContract;
  const liveParity = buildAdoptionParity({ legacyBody: issueBody, contract: proposed });
  if (!liveParity.exact) throw adoptionError('parity');
  validateDeliveryContract(proposed);
  const seal = await deps.appendContractSeal({
    repository,
    issue: issueNumber,
    contract: proposed,
    authority,
  });
  await deps.updateContractProjection({
    repository,
    issue: issueNumber,
    commentNodeId,
    contract: proposed,
    authority,
  });
  const published = await deps.publishIssueDirectory({
    repository,
    issue: issueNumber,
    issueNodeId,
    actor: authority.actor,
  });
  if (!isDeepStrictEqual(published?.directory, initialized.directory)) {
    throw adoptionError('directory-readback');
  }
  const readBack = await deps.readBackAdoption({ repository, issue: issueNumber, commentNodeId });
  if (readBack?.sourceKind !== 'github-records/v1') throw adoptionError('readback');
  const readBackParity = buildAdoptionParity({
    legacyBody: issueBody,
    contract: readBack.contract,
  });
  if (!readBackParity.exact) throw adoptionError('readback-parity');
  return Object.freeze({
    status: 'adopted',
    parity: readBackParity,
    sealRecordId: seal.recordId,
    directory: initialized.directory,
  });
}

export function parseAdoptionArgs(argv = []) {
  const args = [...argv];
  const issueArg = args.find((arg) => /^#?\d+$/.test(String(arg)));
  if (!issueArg) throw adoptionError('issue');
  const actionFlags = args.filter((arg) => ['--apply', '--rollback', '--repair'].includes(arg));
  if (actionFlags.length > 1) throw adoptionError('mode');
  const valueFlags = new Set(['--grant-id', '--authority-epoch', '--actor']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!String(arg).startsWith('--') || actionFlags.includes(arg)) continue;
    if (!valueFlags.has(arg) || args[index + 1] === undefined) throw adoptionError('unknown');
    index += 1;
  }
  const value = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const action = actionFlags[0] === '--apply' ? 'apply' : (actionFlags[0]?.slice(2) ?? 'audit');
  const parsed = { action, issueNumber: Number(String(issueArg).replace(/^#/, '')) };
  const grantId = value('--grant-id');
  const authorityEpoch = value('--authority-epoch');
  const actor = value('--actor');
  if (grantId !== undefined) parsed.grantId = grantId;
  if (authorityEpoch !== undefined) parsed.authorityEpoch = Number(authorityEpoch);
  if (actor !== undefined) parsed.actor = actor;
  return parsed;
}

function defaultGraphql({ query, variables }) {
  return gql(query, variables).then((data) => ({ data }));
}

async function issueSnapshot(issueNumber, repository) {
  const [owner, name] = repository.split('/');
  const data = await gql(
    `query AdoptionIssue($owner: String!, $name: String!, $issue: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $issue) { id body } }
    }`,
    { owner, name, issue: issueNumber }
  );
  const issue = data?.repository?.issue;
  if (typeof issue?.id !== 'string' || typeof issue?.body !== 'string') {
    throw adoptionError('issue-read');
  }
  return { issueNodeId: issue.id, issueBody: issue.body };
}

async function createCommentRest({ repository, issue, body }) {
  const { stdout } = await pexec(
    'gh',
    [
      'api',
      `repos/${repository}/issues/${issue}/comments`,
      '--method',
      'POST',
      '-f',
      `body=${body}`,
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout);
}

function productionDeps({ repository, issueNumber, authority }) {
  const graphql = defaultGraphql;
  const readBody = async () => (await issueSnapshot(issueNumber, repository)).issueBody;
  const listRecords = () =>
    listIssueCommentsSince({
      repository,
      issue: issueNumber,
      since: '1970-01-01T00:00:00.000Z',
      graphql,
    });
  const createComment = (input) =>
    createIssueComment({
      ...input,
      graphql,
      rest: { createIssueComment: createCommentRest },
    });
  const initializerDeps = {
    graphql,
    readIssueBody: readBody,
    async writeIssueBody({ expectedBody, body }) {
      await mutateIssueBody({
        issueNumber,
        repo: repository,
        mutate(base) {
          if (base !== expectedBody) throw adoptionError('body-race');
          return body;
        },
      });
    },
    listIssueComments: listRecords,
    createIssueComment: createComment,
  };
  const capsuleRecords = async () =>
    (await listRecords()).filter((record) => isCapsuleRecordType(record.envelope.recordType));
  return {
    async prepareIssueSingletons(input) {
      return initializeIssueDirectory({
        ...input,
        deps: initializerDeps,
        publishDirectory: false,
      });
    },
    async appendContractSeal({ contract }) {
      const records = await capsuleRecords();
      validateCapsuleChain({ records, repository, issue: issueNumber });
      const predecessors = new Set(
        records.map(({ envelope }) => envelope.predecessor).filter(Boolean)
      );
      const head = records.find(({ envelope }) => !predecessors.has(envelope.recordId));
      if (
        records.length === 1 &&
        head?.envelope.recordType === 'contract-sealed' &&
        isDeepStrictEqual(head.envelope.payload, contract)
      ) {
        return { recordId: head.envelope.recordId };
      }
      if (records.length > 0) throw adoptionError('divergent');
      const envelope = createAitmRecordEnvelope({
        repository,
        issue: issueNumber,
        recordType: 'contract-sealed',
        payload: contract,
        actor: authority.actor,
        epoch: authority.epoch,
        grantId: authority.grantId,
        predecessor: head?.envelope.recordId ?? null,
      });
      const appended = await appendCapsule({
        repository,
        issue: issueNumber,
        expectedHeadRecordId: head?.envelope.recordId ?? null,
        candidate: { envelope, visibleMarkdown: 'AITM Delivery Contract sealed.\n' },
        deps: {
          listIssueComments: capsuleRecords,
          createIssueComment: createComment,
          readBackComment: (input) => readBackComment({ ...input, graphql }),
        },
      });
      return { recordId: appended.record.envelope.recordId };
    },
    async updateContractProjection({ commentNodeId, contract }) {
      const body = renderContractProjectionRecord({
        repository,
        issue: issueNumber,
        contract,
        actor: authority.actor,
      });
      await updateIssueComment({
        commentNodeId,
        repository,
        issue: issueNumber,
        body,
        graphql,
      });
    },
    async readBackAdoption() {
      return resolveContractSource({
        repository,
        issue: issueNumber,
        issueBody: await readBody(),
        graphql,
      });
    },
    async publishIssueDirectory(input) {
      return repairIssueDirectory({ ...input, deps: initializerDeps });
    },
    async inspectAdoption() {
      const directory = parseIssueDirectory({ issueBody: await readBody() });
      if (directory === null) return { adopted: false, divergent: false };
      const capsules = await capsuleRecords();
      const records = await getCommentsByNodeIds({
        ids: Object.values(directory.singletons),
        repository,
        issue: issueNumber,
        graphql,
      });
      return {
        adopted: true,
        divergent: adoptionSnapshotDivergent({ directory, records, capsules }),
      };
    },
    async removeDirectoryProjection() {
      await mutateIssueBody({
        issueNumber,
        repo: repository,
        mutate(base) {
          const directory = parseIssueDirectory({ issueBody: base });
          if (directory === null) throw adoptionError('not-adopted');
          return base.replace(renderIssueDirectory(directory), '').replace(/\n{3,}/g, '\n\n');
        },
      });
    },
    async repairIssueDirectory(input) {
      return repairIssueDirectory({ ...input, deps: initializerDeps });
    },
  };
}

export async function verbAdoptGithubRecords(ctx) {
  const parsed = parseAdoptionArgs(ctx.rest);
  const snapshot = await issueSnapshot(parsed.issueNumber, ctx.cfg.repo);
  if (
    parsed.action === 'apply' &&
    (typeof parsed.grantId !== 'string' ||
      !Number.isSafeInteger(parsed.authorityEpoch) ||
      typeof parsed.actor !== 'string')
  ) {
    throw adoptionError('mutation-authority-required');
  }
  const authority =
    parsed.action === 'apply'
      ? { actor: parsed.actor, epoch: parsed.authorityEpoch, grantId: parsed.grantId }
      : {
          actor: parsed.actor ?? 'aitm/adoption-repair',
          epoch: 1,
          grantId: '00000000000000000000000000',
        };
  const result = await adoptIssueRecords({
    repository: ctx.cfg.repo,
    issueNumber: parsed.issueNumber,
    issueBody: snapshot.issueBody,
    issueNodeId: snapshot.issueNodeId,
    authority,
    contractRecordId: createRecordId(),
    action: parsed.action,
    deps: productionDeps({
      repository: ctx.cfg.repo,
      issueNumber: parsed.issueNumber,
      authority,
    }),
  });
  console.log(`adopt-github-records: ${result.status}`);
  if (result.parity) console.log(`definition-hash: ${result.parity.definitionHash}`);
}
