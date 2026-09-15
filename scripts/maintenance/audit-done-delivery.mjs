#!/usr/bin/env node
// @story #1633
// Read-only, fail-closed audit of AITM Done records against frozen trunk evidence.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readDeliveredCloseTransactions } from '../task-tracker/lib/close-convergence.mjs';
import { parseEntryMarkers } from '../task-tracker/lib/stage-entry-grammar.mjs';

const SHA_RE = /^[0-9a-f]{40}$/;
const KIND_RE = /<!--\s*aitm-issue-kind\s+kind="([^"]+)"\s*-->/g;
const WORKTREE_RE = /<!--\s*aitm-worktree-location\s+[^>]*\bbranch="([^"]+)"[^>]*-->/g;
const DELIVERY_RECEIPT_RE = /^<!--\s*aitm-delivery-receipt\s+(\{[^\r\n]+\})\s*-->/;
const NO_COMMIT_RE = /^<!--\s*aitm-no-commit-delivery\s+(\{[^\r\n]+\})\s*-->/;
const RECOVERY_RE =
  /<!--\s*aitm-delivery-audit-recovery\s+audit="1633"\s+issue="([1-9][0-9]*)"\s*-->/g;
const SUPERSEDED_RE = /<!--\s*aitm-superseded-by\s+refs="#[1-9][0-9]*(?:,#[1-9][0-9]*)*"[^>]*-->/g;
const ISSUE_RESIDENT_KINDS = new Set(['audit', 'research', 'spike']);
const CLASSIFICATIONS = new Set([
  'verified',
  'false-Done',
  'indeterminate',
  'main-thread-exception',
  'explicitly-local-only',
  'terminal-disposition-exception',
]);

function allMatches(text, pattern) {
  pattern.lastIndex = 0;
  return [...String(text || '').matchAll(pattern)];
}

function lastCapture(text, pattern, fallback = null) {
  const matches = allMatches(text, pattern);
  return matches.length === 0 ? fallback : matches.at(-1)[1];
}

function canonicalInstant(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function issueUrl(repository, number) {
  return `https://github.com/${repository}/issues/${number}`;
}

function pullUrl(repository, number) {
  return `https://github.com/${repository}/pull/${number}`;
}

function commitUrl(repository, sha) {
  return `https://github.com/${repository}/commit/${sha}`;
}

function escapeCell(value) {
  return String(value ?? 'not-recorded')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function normalizeIssue(raw) {
  return {
    number: Number(raw.number),
    title: String(raw.title || ''),
    state: String(raw.state || '').toLowerCase(),
    htmlUrl: raw.htmlUrl || raw.html_url || null,
    body: String(raw.body || ''),
    comments: Array.isArray(raw.comments) ? raw.comments : [],
  };
}

export function selectDoneIssues(issues, { since, snapshot } = {}) {
  const lower = canonicalInstant(since);
  const upper = canonicalInstant(snapshot);
  if (!lower || !upper || lower > upper || !Array.isArray(issues)) {
    throw new TypeError('done-delivery-audit:invalid-window');
  }
  const byNumber = new Map();
  for (const source of issues) {
    const issue = normalizeIssue(source);
    if (!Number.isSafeInteger(issue.number) || issue.number <= 0 || byNumber.has(issue.number)) {
      continue;
    }
    const markers = parseEntryMarkers(issue.body).filter(({ state }) => state === 'done');
    if (markers.length === 0) continue;
    const instants = markers.map(({ ts }) => canonicalInstant(ts)).filter(Boolean);
    if (instants.length === 0) continue;
    const doneAt = instants.sort().at(-1);
    if (doneAt < lower || doneAt > upper) continue;
    byNumber.set(issue.number, { ...issue, doneAt, doneMarkerCount: markers.length });
  }
  return [...byNumber.values()].sort(
    (left, right) => left.doneAt.localeCompare(right.doneAt) || left.number - right.number
  );
}

function parseJsonMarkers(comments, pattern) {
  const valid = [];
  let malformed = false;
  for (const comment of comments || []) {
    const match = String(comment?.body || '').match(pattern);
    if (!match) continue;
    try {
      valid.push({
        record: JSON.parse(match[1]),
        createdAt: canonicalInstant(comment.createdAt || comment.created_at) || '',
        id: String(comment.id || ''),
      });
    } catch {
      malformed = true;
    }
  }
  valid.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return { records: valid, malformed };
}

function validReceipt(record, { issueNumber, acceptedSha, trunkRef }) {
  return (
    record?.result === 'delivered' &&
    ['aitm.delivery-receipt/v1', 'aitm.delivery-receipt/v2'].includes(record.schema) &&
    record.issueNumber === issueNumber &&
    record.expectedHeadSha === acceptedSha &&
    record.baseRef === trunkRef &&
    SHA_RE.test(record.mergeCommitSha || '') &&
    Number.isSafeInteger(record.prNumber) &&
    record.prNumber > 0 &&
    ['merge', 'squash', 'rebase'].includes(record.mergeMethod)
  );
}

function validNoCommit(record, { issueNumber, acceptedSha, kind, repository }) {
  return (
    record?.schema === 'aitm.no-commit-delivery/v1' &&
    record.result === 'delivered' &&
    record.issueNumber === issueNumber &&
    record.issueKind === kind &&
    record.repository === repository &&
    record.acceptedSha === acceptedSha &&
    ISSUE_RESIDENT_KINDS.has(kind)
  );
}

function normalizePullRequest(pr) {
  return {
    number: Number(pr.number),
    state: String(pr.state || '').toLowerCase(),
    mergedAt: pr.mergedAt || pr.merged_at || null,
    baseRef: pr.baseRef || pr.base?.ref || null,
    headRef: pr.headRef || pr.head?.ref || null,
    headSha: pr.headSha || pr.head?.sha || null,
    mergeCommitSha: pr.mergeCommitSha || pr.merge_commit_sha || null,
    mergeMethod: pr.mergeMethod || null,
    url: pr.html_url || pr.url || null,
  };
}

function mergedToTrunk(pr, trunkRef) {
  return Boolean(pr.mergedAt) && pr.state === 'closed' && pr.baseRef === trunkRef;
}

function recoveriesFromIssues(issues) {
  const recoveries = new Map();
  for (const source of issues || []) {
    const issue = normalizeIssue(source);
    for (const match of allMatches(issue.body, RECOVERY_RE)) {
      const affected = Number(match[1]);
      if (!recoveries.has(affected)) recoveries.set(affected, []);
      recoveries.get(affected).push(issue.number);
    }
  }
  return new Map(
    [...recoveries].map(([affected, numbers]) => [
      affected,
      numbers.length === 1 ? numbers[0] : numbers,
    ])
  );
}

async function classifyIssue(issue, context) {
  const { repository, trunkRef, trunkSha, ports, recoveries } = context;
  let acceptedShas = [];
  let malformedClose = false;
  try {
    acceptedShas = readDeliveredCloseTransactions(issue.body).map(
      (transaction) => transaction.acceptedSha
    );
  } catch {
    malformedClose = true;
  }
  const acceptedSha = acceptedShas.length === 1 ? acceptedShas[0] : null;
  const kind = lastCapture(issue.body, KIND_RE, 'code');
  const sourceBranch = lastCapture(issue.body, WORKTREE_RE);
  const receiptProjection = parseJsonMarkers(issue.comments, DELIVERY_RECEIPT_RE);
  const noCommitProjection = parseJsonMarkers(issue.comments, NO_COMMIT_RE);
  const notes = [];
  const superseded = allMatches(issue.body, SUPERSEDED_RE);
  if (issue.doneMarkerCount !== 1) notes.push(`done-marker-count:${issue.doneMarkerCount}`);
  if (acceptedShas.length !== 1) notes.push(`accepted-sha-count:${acceptedShas.length}`);
  if (malformedClose) notes.push('malformed-delivered-close');
  if (receiptProjection.malformed) notes.push('malformed-delivery-receipt');
  if (noCommitProjection.malformed) notes.push('malformed-no-commit-record');

  const base = {
    number: issue.number,
    title: issue.title,
    issueUrl: issue.htmlUrl || issueUrl(repository, issue.number),
    doneAt: issue.doneAt,
    kind,
    acceptedSha,
    sourceBranch,
    prNumber: null,
    prUrl: null,
    targetBranch: null,
    mergeMethod: null,
    mergeSha: null,
    trunkEvidence: 'none',
    evidenceBasis: null,
    classification: 'indeterminate',
    recoveryIssue: recoveries.get(issue.number) ?? null,
    notes,
  };

  const isUnclaimedTerminalDisposition =
    superseded.length === 1 &&
    issue.doneMarkerCount === 1 &&
    acceptedShas.length === 0 &&
    !malformedClose &&
    receiptProjection.records.length === 0 &&
    noCommitProjection.records.length === 0 &&
    !receiptProjection.malformed &&
    !noCommitProjection.malformed;
  if (isUnclaimedTerminalDisposition) {
    const replacement = Number(superseded[0][0].match(/refs="#([1-9][0-9]*)"/)?.[1]);
    return {
      ...base,
      evidenceBasis: `superseded-by:#${replacement}`,
      classification: 'terminal-disposition-exception',
      recoveryIssue: replacement,
    };
  }

  const isOnTrunk = async (sha) =>
    SHA_RE.test(sha || '') && (await ports.isAncestor(sha, trunkSha)) === true;
  const acceptedExists = acceptedSha ? await ports.commitExists(acceptedSha) : false;
  const acceptedOnTrunk = acceptedSha ? await isOnTrunk(acceptedSha) : false;

  const validReceipts = receiptProjection.records.filter(({ record }) =>
    validReceipt(record, { issueNumber: issue.number, acceptedSha, trunkRef })
  );
  if (validReceipts.length > 1) notes.push('multiple-correlated-delivery-receipts');
  if (validReceipts.length === 1) {
    const receipt = validReceipts[0].record;
    const pulls = (await ports.listAssociatedPullRequests(receipt.mergeCommitSha)).map(
      normalizePullRequest
    );
    const pr = pulls.find(
      (candidate) =>
        candidate.number === receipt.prNumber &&
        mergedToTrunk(candidate, trunkRef) &&
        candidate.headSha === acceptedSha &&
        candidate.mergeCommitSha === receipt.mergeCommitSha
    );
    if (pr && (await isOnTrunk(receipt.mergeCommitSha))) {
      return {
        ...base,
        prNumber: pr.number,
        prUrl: pr.url || pullUrl(repository, pr.number),
        targetBranch: pr.baseRef,
        mergeMethod: receipt.mergeMethod,
        mergeSha: receipt.mergeCommitSha,
        trunkEvidence: `landed:${receipt.mergeCommitSha}`,
        evidenceBasis: 'delivery-receipt-and-live-pr',
        classification: 'verified',
      };
    }
    notes.push('delivery-receipt-live-correlation-failed');
  }

  const attributed = await ports.findAttributedTrunkCommits(issue.number, trunkSha);
  for (const commit of attributed || []) {
    if (!SHA_RE.test(commit?.sha || '') || !(await isOnTrunk(commit.sha))) continue;
    const pulls = (await ports.listAssociatedPullRequests(commit.sha)).map(normalizePullRequest);
    const pr = pulls.find((candidate) => mergedToTrunk(candidate, trunkRef));
    if (!pr && sourceBranch === trunkRef) {
      return {
        ...base,
        targetBranch: trunkRef,
        mergeSha: commit.sha,
        trunkEvidence: `landed:${commit.sha}`,
        evidenceBasis: 'main-thread-attribution',
        classification: 'main-thread-exception',
      };
    }
    if (!pr) continue;
    const method = pr.mergeMethod || (await ports.inferMergeMethod?.(commit.sha, pr)) || 'unknown';
    return {
      ...base,
      prNumber: pr.number,
      prUrl: pr.url || pullUrl(repository, pr.number),
      targetBranch: pr.baseRef,
      mergeMethod: method,
      mergeSha: commit.sha,
      trunkEvidence: `landed:${commit.sha}`,
      evidenceBasis: pr.headSha === acceptedSha ? 'reconstructed-trunk-pr' : 'attributed-root-pr',
      classification: 'verified',
    };
  }

  if (acceptedOnTrunk) {
    return {
      ...base,
      targetBranch: trunkRef,
      mergeSha: acceptedSha,
      trunkEvidence: `ancestor:${acceptedSha}`,
      evidenceBasis: sourceBranch === trunkRef ? 'main-thread-ancestry' : 'accepted-sha-ancestry',
      classification: sourceBranch === trunkRef ? 'main-thread-exception' : 'verified',
    };
  }

  const validNoCommitRecords = noCommitProjection.records.filter(({ record }) =>
    validNoCommit(record, { issueNumber: issue.number, acceptedSha, kind, repository })
  );
  if (validNoCommitRecords.length === 1 && validReceipts.length === 0) {
    return {
      ...base,
      evidenceBasis: 'issue-resident-delivery-record',
      trunkEvidence: 'not-applicable',
      classification: 'explicitly-local-only',
    };
  }
  const ambiguousLocalOnlyClaim =
    ISSUE_RESIDENT_KINDS.has(kind) &&
    (noCommitProjection.malformed || noCommitProjection.records.length > 0);

  if (
    acceptedSha &&
    acceptedExists &&
    !receiptProjection.malformed &&
    validReceipts.length === 0 &&
    !ambiguousLocalOnlyClaim
  ) {
    return {
      ...base,
      evidenceBasis:
        kind === 'epic' ? 'epic-history-absent-from-trunk' : 'history-absent-from-trunk',
      classification: 'false-Done',
    };
  }
  return base;
}

export async function auditDoneDelivery({
  issues,
  since,
  snapshot,
  repository,
  trunkRef,
  trunkSha,
  recoveries = recoveriesFromIssues(issues),
  ports,
} = {}) {
  if (!repository || !trunkRef || !SHA_RE.test(trunkSha || '') || !ports) {
    throw new TypeError('done-delivery-audit:invalid-input');
  }
  const selected = selectDoneIssues(issues, { since, snapshot });
  const rows = [];
  for (const issue of selected) {
    rows.push(await classifyIssue(issue, { repository, trunkRef, trunkSha, recoveries, ports }));
  }
  const counts = Object.fromEntries([...CLASSIFICATIONS].map((name) => [name, 0]));
  for (const row of rows) counts[row.classification] += 1;
  const inventoryHash = createHash('sha256')
    .update(rows.map((row) => `${row.number}@${row.doneAt}`).join('\n'))
    .digest('hex');
  return { repository, since, snapshot, trunkRef, trunkSha, inventoryHash, rows, counts };
}

export function renderDoneDeliveryReport(result, { requireRecoveries = false } = {}) {
  const missing = result.rows.filter(
    (row) =>
      ['false-Done', 'indeterminate'].includes(row.classification) &&
      !Number.isSafeInteger(row.recoveryIssue)
  );
  if (requireRecoveries && missing.length > 0) {
    throw new Error(
      `done-delivery-audit:missing-recovery issues=${missing.map((row) => row.number).join(',')}`
    );
  }
  const lines = [
    '# Done Delivery Survey — 14 Day Window',
    '',
    `- Repository: \`${result.repository}\``,
    `- Since: \`${result.since}\``,
    `- Snapshot: \`${result.snapshot}\``,
    `- Trunk ref: \`${result.trunkRef}\``,
    `- Frozen trunk SHA: \`${result.trunkSha}\``,
    `- Inventory count: ${result.rows.length}`,
    `- Inventory SHA-256: \`${result.inventoryHash}\``,
    '',
    '## Summary',
    '',
    '<!-- prettier-ignore -->',
    '| Classification | Count |',
    '|---|---:|',
    ...[...CLASSIFICATIONS].map((name) => `| ${name} | ${result.counts[name]} |`),
    '',
    '## Inventory',
    '',
    '<!-- cspell:disable -->',
    '<!-- prettier-ignore -->',
    '| Issue | Done (UTC) | Accepted SHA | Source branch | PR | Target | Method | Merge SHA | Trunk evidence | Classification | Recovery | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of result.rows) {
    const issue = `[#${row.number}](${row.issueUrl}) ${escapeCell(row.title)}`;
    const accepted = row.acceptedSha ? `\`${row.acceptedSha}\`` : 'not-recorded';
    const pr = row.prNumber
      ? `[#${row.prNumber}](${row.prUrl || pullUrl(result.repository, row.prNumber)})`
      : 'none';
    const merge = row.mergeSha
      ? `[\`${row.mergeSha}\`](${commitUrl(result.repository, row.mergeSha)})`
      : 'none';
    const recovery = Number.isSafeInteger(row.recoveryIssue)
      ? `[#${row.recoveryIssue}](${issueUrl(result.repository, row.recoveryIssue)})`
      : ['false-Done', 'indeterminate'].includes(row.classification)
        ? 'MISSING'
        : 'n/a';
    lines.push(
      `| ${issue} | ${row.doneAt} | ${accepted} | \`${escapeCell(row.sourceBranch)}\` | ${pr} | \`${escapeCell(row.targetBranch)}\` | ${escapeCell(row.mergeMethod)} | ${merge} | ${escapeCell(row.trunkEvidence)} | **${row.classification}** | ${recovery} | ${escapeCell([row.evidenceBasis, ...row.notes].filter(Boolean).join('; '))} |`
    );
  }
  lines.push(
    '',
    '<!-- cspell:enable -->',
    '',
    '## Method',
    '',
    'The inventory is selected from exact `aitm-entered-done` body markers in the frozen interval. Delivery is proven by accepted-SHA ancestry or by a merged trunk PR correlated to a reachable, issue-attributed landed commit. Missing or contradictory authority fails closed. Root epic no-commit records are not trunk delivery evidence.',
    '',
    'The command is read-only: it does not fetch, edit issues, move project state, or alter Git history.',
    ''
  );
  return lines.join('\n');
}

export function parseReportMetadata(markdown) {
  const value = String(markdown || '');
  const read = (label, pattern = '[^`\\n]+') => {
    const match = value.match(new RegExp('^- ' + label + ': `(' + pattern + ')`$', 'm'));
    return match?.[1] ?? null;
  };
  const count = value.match(/^- Inventory count: ([0-9]+)$/m);
  return {
    repository: read('Repository'),
    since: read('Since'),
    snapshot: read('Snapshot'),
    trunkRef: read('Trunk ref'),
    trunkSha: read('Frozen trunk SHA', '[0-9a-f]{40}'),
    inventoryCount: count ? Number(count[1]) : null,
  };
}

export function verifyDoneDeliveryReport(expected, actual) {
  if (String(expected) !== String(actual)) {
    throw new Error('done-delivery-audit:report does not match fresh evidence snapshot');
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    stdio: ['ignore', 'pipe', options.quiet ? 'ignore' : 'pipe'],
  });
}

function git(args, options = {}) {
  return run('git', args, options).trim();
}

function gh(args) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const output = run('gh', args);
      if (output.trim().length > 0) return output;
      lastError = new Error('empty GitHub response');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function ghJson(args) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return JSON.parse(gh(args));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function flattenPages(value) {
  return Array.isArray(value) ? value.flatMap((page) => (Array.isArray(page) ? page : [page])) : [];
}

function repositoryFromOrigin() {
  const remote = git(['remote', 'get-url', 'origin']);
  const match = remote.match(/(?:github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error('done-delivery-audit:cannot-resolve-repository');
  return match[1];
}

function localMidnight(date, timeZone = 'America/Chicago') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return canonicalInstant(date);
  const [year, month, day] = date.split('-').map(Number);
  let instant = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value])
    );
    const observed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    instant += Date.UTC(year, month - 1, day) - observed;
  }
  return new Date(instant).toISOString();
}

function parseArgs(argv) {
  const args = { since: null, snapshot: null, verifyReport: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--since') args.since = argv[++index];
    else if (token === '--snapshot') args.snapshot = argv[++index];
    else if (token === '--verify-report') args.verifyReport = argv[++index];
    else if (token === '--output') args.output = argv[++index];
    else throw new Error(`done-delivery-audit:unknown-argument ${token}`);
  }
  if (!args.since && !args.verifyReport) throw new Error('done-delivery-audit:--since-required');
  return args;
}

function runtimePorts() {
  return {
    async commitExists(sha) {
      try {
        git(['cat-file', '-e', `${sha}^{commit}`], { quiet: true });
        return true;
      } catch {
        return false;
      }
    },
    async isAncestor(sha, trunkSha) {
      try {
        git(['merge-base', '--is-ancestor', sha, trunkSha], { quiet: true });
        return true;
      } catch {
        return false;
      }
    },
    async findAttributedTrunkCommits(number, trunkSha) {
      const output = git([
        'log',
        trunkSha,
        '--extended-regexp',
        '--regexp-ignore-case',
        `--grep=(^|[^0-9])#${number}([^0-9]|$)`,
        '--format=%H%x1f%s%x1f%b%x1e',
      ]);
      return output
        ? output
            .split('\x1e')
            .map((record) => record.trim())
            .filter(Boolean)
            .map((record) => {
              const [sha, subject, body = ''] = record.split('\x1f');
              return { sha, subject, body };
            })
            .filter(({ subject, body }) => {
              const text = `${subject}\n${body}`;
              return (
                text.includes(`[#${number}]`) ||
                new RegExp(
                  `(?:delivers?|completed children|attribution:)[^\\n]*#${number}(?![0-9])`,
                  'i'
                ).test(text)
              );
            })
        : [];
    },
    async listAssociatedPullRequests(sha) {
      return ghJson(['api', `repos/${runtimeRepository}/commits/${sha}/pulls`]).map(
        normalizePullRequest
      );
    },
    async inferMergeMethod(sha, pr) {
      const parents = git(['show', '-s', '--format=%P', sha]).split(/\s+/).filter(Boolean);
      if (parents.length === 2) return 'merge';
      if (parents.length === 1 && sha !== pr.headSha) return 'squash';
      if (sha === pr.headSha) return 'rebase';
      return 'unknown';
    },
  };
}

let runtimeRepository = null;

async function runtimeMain(argv) {
  const args = parseArgs(argv);
  const expected = args.verifyReport ? readFileSync(args.verifyReport, 'utf8') : null;
  const metadata = expected ? parseReportMetadata(expected) : null;
  runtimeRepository = metadata?.repository || repositoryFromOrigin();
  const since = metadata?.since || localMidnight(args.since);
  const snapshot =
    metadata?.snapshot || canonicalInstant(args.snapshot || new Date().toISOString());
  const trunkRef = metadata?.trunkRef || 'trunk';
  const trunkSha =
    metadata?.trunkSha ||
    ghJson(['api', `repos/${runtimeRepository}/git/ref/heads/${trunkRef}`]).object.sha;
  if (!since || !snapshot || !SHA_RE.test(trunkSha || '')) {
    throw new Error('done-delivery-audit:invalid-runtime-metadata');
  }
  let pages;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    pages = ghJson([
      'api',
      '--paginate',
      '--slurp',
      '-X',
      'GET',
      `repos/${runtimeRepository}/issues`,
      '-f',
      'state=all',
      '-f',
      `since=${since}`,
      '-f',
      'per_page=100',
    ]);
    if (flattenPages(pages).length > 0) break;
  }
  if (flattenPages(pages).length === 0) {
    throw new Error('done-delivery-audit:empty-issue-inventory-response');
  }
  const issues = flattenPages(pages)
    .filter((issue) => issue.pull_request === undefined)
    .map(normalizeIssue);
  const selected = selectDoneIssues(issues, { since, snapshot });
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  for (const selectedIssue of selected) {
    const comments = flattenPages(
      ghJson([
        'api',
        '--paginate',
        '--slurp',
        `repos/${runtimeRepository}/issues/${selectedIssue.number}/comments?per_page=100`,
      ])
    ).map((comment) => ({
      id: String(comment.id),
      createdAt: canonicalInstant(comment.created_at),
      body: String(comment.body || ''),
    }));
    byNumber.get(selectedIssue.number).comments = comments;
  }
  const result = await auditDoneDelivery({
    issues: [...byNumber.values()],
    since,
    snapshot,
    repository: runtimeRepository,
    trunkRef,
    trunkSha,
    ports: runtimePorts(),
  });
  const rendered = renderDoneDeliveryReport(result, { requireRecoveries: Boolean(expected) });
  if (expected) {
    verifyDoneDeliveryReport(expected, rendered);
    console.log(
      `Verified ${result.rows.length} Done records through ${snapshot} against ${trunkSha}.`
    );
  } else {
    if (args.output) {
      writeFileSync(args.output, rendered);
      console.log(`Wrote ${result.rows.length} Done records to ${args.output}.`);
    } else {
      process.stdout.write(rendered);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runtimeMain(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
