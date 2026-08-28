#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { emitSelfDoc, wantsHelp } from '../lib/self-doc.mjs';
import { gql, projectValuesForIssue, splitRepo } from '../gh/lib/github-projects.mjs';
import { loadConfig } from './config.mjs';
import { getProjectDir } from './paths.mjs';
import {
  resolveApprovedIncidentLedger,
  verifyIncidentLedgerPhase,
  observeIncidentLedgerLive,
  readIssueDeliveryAuthority,
  resolveSingleDeliveredEvidence,
} from './lib/delivery-incident-reconciliation.mjs';
import { REVIEWED_INCIDENT_ISSUES } from './lib/delivery-incident-records.mjs';
import { createProductionRuntime } from './verbs/incident-ledger.mjs';
import { parseBlockedByStrict } from './lib/blocked-marker.mjs';
import { formatBlockedByValue } from './lib/blocked-by-field.mjs';
import { parseSupersededByStrict } from './lib/superseded-marker.mjs';

export function parseVerificationArgs(args = []) {
  const issueIndex = args.indexOf('--issue');
  const phaseIndex = args.indexOf('--phase');
  const allowedLength = phaseIndex < 0 ? 2 : 4;
  const issue = String(args[issueIndex + 1] || '').replace(/^#/, '');
  const phase = phaseIndex < 0 ? 'terminal' : args[phaseIndex + 1];
  if (
    issueIndex !== 0 ||
    args.length !== allowedLength ||
    issue !== '1381' ||
    !['pre-close', 'terminal'].includes(phase) ||
    (phaseIndex >= 0 && phaseIndex !== 2)
  ) {
    throw new TypeError(
      'Usage: verify-delivery-incident-reconciliation --issue 1381 [--phase pre-close|terminal]'
    );
  }
  return Object.freeze({ convergenceIssue: 1381, phase });
}

export function verificationErrorExitCode(error) {
  return error instanceof TypeError &&
    /^Usage: verify-delivery-incident-reconciliation\b/.test(error.message)
    ? 2
    : 1;
}

export async function runVerification(args, deps = {}) {
  const parsed = parseVerificationArgs(args);
  if (typeof deps.loadAuthority !== 'function' || typeof deps.verify !== 'function') {
    throw new Error('delivery-incident:dependencies');
  }
  const authority = await deps.loadAuthority(parsed);
  return deps.verify({ authority, phase: parsed.phase });
}

export async function readSubIssueNumbersStrict(fetchPage, { maximumPages = 1000 } = {}) {
  if (typeof fetchPage !== 'function' || !Number.isSafeInteger(maximumPages) || maximumPages <= 0) {
    throw new Error('delivery-incident:dependencies');
  }
  const numbers = [];
  const seenNumbers = new Set();
  const seenCursors = new Set();
  let after = null;
  for (let page = 0; page < maximumPages; page += 1) {
    const connection = await fetchPage(after);
    if (
      !Array.isArray(connection?.nodes) ||
      connection.nodes.length > 100 ||
      typeof connection?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error('delivery-incident:stale-observation');
    }
    for (const node of connection.nodes) {
      if (!Number.isSafeInteger(node?.number) || node.number <= 0 || seenNumbers.has(node.number)) {
        throw new Error('delivery-incident:stale-observation');
      }
      seenNumbers.add(node.number);
      numbers.push(node.number);
    }
    if (!connection.pageInfo.hasNextPage) return Object.freeze(numbers);
    const cursor = connection.pageInfo.endCursor;
    if (
      connection.nodes.length === 0 ||
      typeof cursor !== 'string' ||
      cursor.length === 0 ||
      seenCursors.has(cursor)
    ) {
      throw new Error('delivery-incident:stale-observation');
    }
    seenCursors.add(cursor);
    after = cursor;
  }
  throw new Error('delivery-incident:stale-observation');
}

function statusMap(cfg) {
  return new Map([
    [cfg.kanbanOptionBacklog, 'Backlog'],
    [cfg.kanbanOptionRefine, 'Refine'],
    [cfg.kanbanOptionReadyForPlan, 'Ready for Planning'],
    [cfg.kanbanOptionPlan, 'Plan'],
    [cfg.kanbanOptionDevelop, 'Develop'],
    [cfg.kanbanOptionTest, 'Test'],
    [cfg.kanbanOptionReview, 'Review'],
    [cfg.kanbanOptionDone, 'Done'],
  ]);
}

async function boardState(cfg, issueNumber) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          projectItems(first: 20) {
            nodes {
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { optionId }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: issueNumber }
  );
  const item = data?.repository?.issue?.projectItems?.nodes?.find(
    (node) => node.project?.id === cfg.projectId
  );
  return statusMap(cfg).get(item?.fieldValueByName?.optionId) ?? null;
}

function expectedDisposition(outcome) {
  if (outcome === 'incorporated') return 'Incorporated';
  if (outcome === 'retain-superseded') return 'Replaced';
  return 'Delivered';
}

export async function productionVerification(parsed, deps = {}) {
  const projectDir = deps.projectDir || getProjectDir();
  const cfg = deps.cfg || loadConfig();
  const readProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const ctx = {
    cfg,
    projectDir,
    getIssueBoardState: (issueNumber) => boardState(cfg, issueNumber),
  };
  const runtime = deps.runtime || createProductionRuntime(ctx);
  const recordIssues = REVIEWED_INCIDENT_ISSUES.filter(
    (issue) => issue !== parsed.convergenceIssue
  );
  const [convergenceRecords, ownerRecords, issueRecordSets] = await Promise.all([
    runtime.listConvergenceRecords(),
    runtime.listOwnerRecords(),
    Promise.all(recordIssues.map((issue) => runtime.listIssueRecords(issue))),
  ]);
  const incidentTypes = new Set([
    'delivery-incident-ledger',
    'delivery-incident-ledger-approval-grant',
    'delivery-incident-ledger-approval',
    'delivery-incident-ledger-owner',
    'delivery-incident-incorporated',
  ]);
  const records = [...convergenceRecords, ...ownerRecords, ...issueRecordSets.flat()].filter(
    (record) => incidentTypes.has(record.envelope.recordType)
  );
  const resolveAuthority = deps.resolveApprovedIncidentLedger || resolveApprovedIncidentLedger;
  const authority = resolveAuthority({
    records,
    repository: cfg.repo,
    convergenceIssue: parsed.convergenceIssue,
    incidentIssue: 939,
  });
  const verifiedTrunkSha = await runtime.liveObservationDeps.readTrunkSha();
  const observeRows = async ({ phase }) => {
    const live = [];
    for (const row of authority.ledgerPayload.rows) {
      const [issue, state, values] = await Promise.all([
        runtime.liveObservationDeps.fetchIssue(row.issueNumber),
        runtime.liveObservationDeps.fetchBoardState(row.issueNumber),
        readProjectValues({
          cfg,
          fieldDefs: [{ key: 'disposition', type: 'single_select' }],
          issueNumber: row.issueNumber,
        }),
      ]);
      const disposition = values.disposition || '';
      const terminalMatches =
        String(issue.state).toUpperCase() === 'CLOSED' &&
        state === 'Done' &&
        disposition === expectedDisposition(row.intendedOutcome);
      const incorporatedIssues = new Set(
        authority.projection.approvedLedgerIncorporated.map(
          ({ envelope }) => envelope.payload.issueNumber
        )
      );
      let outcomeEvidenceMatches = false;
      if (row.intendedOutcome === 'incorporated') {
        outcomeEvidenceMatches = incorporatedIssues.has(row.issueNumber);
      } else if (row.intendedOutcome === 'retain-superseded') {
        try {
          parseSupersededByStrict(issue.body || '');
          outcomeEvidenceMatches =
            row.observedGitHubState === 'CLOSED' && row.observedBoardState === 'Done';
        } catch {
          outcomeEvidenceMatches = false;
        }
      } else if (row.intendedOutcome === 'convergence-owner') {
        outcomeEvidenceMatches = true;
      } else if (row.intendedOutcome === 'recover-then-close') {
        outcomeEvidenceMatches = row.intentUrl !== null && row.receiptUrl === null;
      } else {
        outcomeEvidenceMatches = row.intentUrl !== null && row.receiptUrl !== null;
      }
      live.push({
        issueNumber: row.issueNumber,
        observationMatches: true,
        terminalMatches,
        outcomeEvidenceMatches,
        evidence: [`state=${issue.state}`, `status=${state}`, `disposition=${disposition}`],
      });
    }
    if (phase === 'pre-close') {
      await (deps.observeIncidentLedgerLive || observeIncidentLedgerLive)(
        authority.ledgerPayload,
        runtime.liveObservationDeps
      );
    } else {
      await (deps.observeIncidentLedgerLive || observeIncidentLedgerLive)(
        {
          ...authority.ledgerPayload,
          baselineTrunkSha: verifiedTrunkSha,
          rows: authority.ledgerPayload.rows
            .filter((row) => row.issueNumber !== authority.convergenceIssue)
            .map((row) => {
              const observation = live.find((item) => item.issueNumber === row.issueNumber);
              return {
                ...row,
                observedGitHubState: observation.evidence[0].slice('state='.length).toUpperCase(),
                observedBoardState: observation.evidence[1].slice('status='.length),
              };
            }),
        },
        runtime.liveObservationDeps,
        { phase: 'terminal' }
      );
    }
    return live;
  };
  const verifyPreCloseTopology = async () => {
    let parentNumber;
    if (deps.readParentIssue) {
      parentNumber = await deps.readParentIssue(authority.convergenceIssue);
    } else {
      const { owner, repoName } = splitRepo(cfg.repo);
      const parentData = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) { parent { number } }
          }
        }`,
        { owner, repo: repoName, issue: authority.convergenceIssue }
      );
      parentNumber = parentData?.repository?.issue?.parent?.number ?? null;
    }
    if (parentNumber !== null) return false;
    let incidentChildren;
    if (deps.readSubIssueNumbers) {
      incidentChildren = await deps.readSubIssueNumbers(authority.incidentIssue);
    } else {
      const { owner, repoName } = splitRepo(cfg.repo);
      incidentChildren = await readSubIssueNumbersStrict(async (after) => {
        const data = await gql(
          `query($owner: String!, $repo: String!, $issue: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
              issue(number: $issue) {
                subIssues(first: 100, after: $after) {
                  nodes { number }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`,
          { owner, repo: repoName, issue: authority.incidentIssue, after }
        );
        return data?.repository?.issue?.subIssues;
      });
    }
    if (!Array.isArray(incidentChildren) || incidentChildren.includes(authority.convergenceIssue)) {
      return false;
    }
    const blockerChain = [
      [1403, 1381],
      [1397, 1403],
      [1395, 1397],
      [1393, 1395],
      [1392, 1393],
      [1390, 1392],
      [1389, 1390],
      [1388, 1389],
    ];
    for (const [issueNumber, blocker] of blockerChain) {
      const [issue, values] = await Promise.all([
        runtime.liveObservationDeps.fetchIssue(issueNumber),
        readProjectValues({
          cfg,
          fieldDefs: [{ key: 'blockedBy', type: 'text' }],
          issueNumber,
        }),
      ]);
      const labels = (issue.labels || []).map((label) => label.name);
      if (
        JSON.stringify(parseBlockedByStrict(issue.body || '')) !== JSON.stringify([blocker]) ||
        values.blockedBy !== formatBlockedByValue([blocker]) ||
        !labels.includes('BLOCKED')
      ) {
        return false;
      }
    }
    return true;
  };
  const verifyTerminalAuthority = async () => {
    const expectedIncorporated = authority.ledgerPayload.rows
      .filter(({ intendedOutcome }) => intendedOutcome === 'incorporated')
      .map(({ issueNumber }) => issueNumber)
      .sort((a, b) => a - b);
    const actualIncorporated = authority.projection.approvedLedgerIncorporated
      .map(({ envelope }) => envelope.payload.issueNumber)
      .sort((a, b) => a - b);
    if (JSON.stringify(actualIncorporated) !== JSON.stringify(expectedIncorporated)) return false;
    const [comments, issue] = await Promise.all([
      runtime.liveObservationDeps.listComments(authority.convergenceIssue),
      runtime.liveObservationDeps.fetchIssue(authority.convergenceIssue),
    ]);
    let delivery;
    try {
      delivery = (deps.resolveSingleDeliveredEvidence || resolveSingleDeliveredEvidence)({
        comments,
        repository: authority.repository,
        issueNumber: authority.convergenceIssue,
      });
    } catch {
      return false;
    }
    const issueAuthority = (deps.readIssueDeliveryAuthority || readIssueDeliveryAuthority)(
      issue.body || '',
      { expectedIssue: authority.convergenceIssue }
    );
    const pullRequest = await runtime.liveObservationDeps.fetchPullRequest(delivery.prNumber);
    return (
      issueAuthority.acceptedSha === delivery.expectedHeadSha &&
      issueAuthority.approvalSha === delivery.expectedHeadSha &&
      issueAuthority.approvalMode !== null &&
      pullRequest?.number === delivery.prNumber &&
      pullRequest?.headRefOid === delivery.expectedHeadSha &&
      pullRequest?.mergeCommitSha === delivery.mergeCommitSha &&
      (await runtime.liveObservationDeps.isOnTrunk(delivery.mergeCommitSha))
    );
  };
  const verify = deps.verifyIncidentLedgerPhase || verifyIncidentLedgerPhase;
  return verify({
    authority,
    phase: parsed.phase,
    verifiedTrunkSha,
    deps: { observeRows, verifyPreCloseTopology, verifyTerminalAuthority },
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  try {
    if (wantsHelp(process.argv.slice(2))) {
      emitSelfDoc('verify-delivery-incident-reconciliation');
      process.exitCode = 0;
    } else {
      const parsed = parseVerificationArgs(process.argv.slice(2));
      const result = await productionVerification(parsed);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = verificationErrorExitCode(error);
  }
}
