// Durable exactly-once recovery for ensure-wave-parent issue creation.
//
// A pending intent is written before `gh issue create`. If the process loses
// the response, the next process must prove the result by exact issue number
// or by a complete repository issue listing. Indexed search is never evidence
// that an unknown create did not happen.

import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { GH_API_TIMEOUT_MS } from '../../task-tracker/lib/process-timeouts.mjs';
import { isGovernedAuthorityError } from '../../task-tracker/lib/work-lease/governed-effect.mjs';
import { gql, splitRepo } from './github-projects.mjs';

export function createWaveRequestDigest(request) {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}

export function waveCreateJournalPath(projectDir, repo, waveIdValue) {
  const key = createHash('sha256').update(`${repo}\0${waveIdValue}`).digest('hex');
  return path.join(projectDir, '.db', 'aitm', 'wave-parent-create-intents', `${key}.json`);
}

function validateIntent(intent, { waveIdValue, requestDigest }) {
  if (
    !intent ||
    intent.version !== 1 ||
    intent.waveIdValue !== waveIdValue ||
    intent.requestDigest !== requestDigest ||
    (![null, undefined].includes(intent.issueNumber) &&
      (!Number.isInteger(intent.issueNumber) || intent.issueNumber <= 0))
  ) {
    throw new Error('ensure-wave-parent: durable create intent does not match this wave request');
  }
  return intent;
}

export function readWaveCreateIntent(filePath, expected) {
  if (!existsSync(filePath)) return null;
  let intent;
  try {
    intent = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`ensure-wave-parent: durable create intent is unreadable: ${error.message}`);
  }
  return validateIntent(intent, expected);
}

function writeJsonFile(filePath, value, { exclusive = false } = {}) {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  try {
    if (exclusive) linkSync(temporary, filePath);
    else renameSync(temporary, filePath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function createWaveCreateIntent(filePath, expected) {
  const intent = {
    version: 1,
    waveIdValue: expected.waveIdValue,
    requestDigest: expected.requestDigest,
    issueNumber: null,
  };
  try {
    writeJsonFile(filePath, intent, { exclusive: true });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    throw new Error('ensure-wave-parent: another create attempt already owns this wave intent');
  }
  return intent;
}

export function persistWaveCreateReceipt(filePath, intent, issueNumber) {
  const normalized = Number(issueNumber);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error('ensure-wave-parent: create receipt issue number is invalid');
  }
  writeJsonFile(filePath, { ...intent, issueNumber: normalized });
}

export function clearWaveCreateJournal(filePath) {
  rmSync(filePath, { force: true });
}

function exactWaveMarkerCount(body, waveIdValue) {
  const marker = `<!-- wave-id: ${waveIdValue} -->`;
  return String(body || '')
    .split('\n')
    .filter((line) => line === marker).length;
}

export function assertExactWaveMarker(body, waveIdValue, issueNumber) {
  if (exactWaveMarkerCount(body, waveIdValue) !== 1) {
    throw new Error(
      `ensure-wave-parent: recovered #${issueNumber} does not carry one exact wave marker`
    );
  }
}

export async function fetchWaveParentBody({
  repo,
  issueNumber,
  env,
  execFile = execFileSync,
}) {
  let stdout;
  try {
    stdout = execFile(
      'gh',
      ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body'],
      { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS, env }
    );
  } catch (error) {
    if (isGovernedAuthorityError(error)) throw error;
    throw new Error(`ensure-wave-parent: failed to verify recovered #${issueNumber}: ${error.message}`);
  }
  try {
    return JSON.parse(stdout).body;
  } catch (error) {
    throw new Error(
      `ensure-wave-parent: malformed body response for recovered #${issueNumber}: ${error.message}`
    );
  }
}

export async function findAuthoritativeParentByWaveId({
  repo,
  waveIdValue,
  runGql = gql,
  env,
}) {
  const { owner, repoName } = splitRepo(repo);
  const matches = [];
  let after = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const data = await runGql(
      `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){issues(first:100,after:$after,states:OPEN){nodes{number body}pageInfo{hasNextPage endCursor}}}}`,
      { owner, name: repoName, after },
      { env }
    );
    const connection = data?.repository?.issues;
    if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo) {
      throw new Error('ensure-wave-parent: malformed authoritative issue listing');
    }
    for (const issue of connection.nodes) {
      if (exactWaveMarkerCount(issue?.body, waveIdValue) === 1) {
        const issueNumber = Number(issue.number);
        if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
          throw new Error('ensure-wave-parent: authoritative issue listing has invalid issue number');
        }
        matches.push(issueNumber);
      }
    }
    hasNextPage = connection.pageInfo.hasNextPage === true;
    if (!hasNextPage) break;
    after = connection.pageInfo.endCursor;
    if (!after) {
      throw new Error('ensure-wave-parent: authoritative issue listing omitted its next cursor');
    }
  }
  if (matches.length > 1) {
    throw new Error(`ensure-wave-parent: duplicate authoritative parents for wave ${waveIdValue}`);
  }
  return matches[0] || null;
}
