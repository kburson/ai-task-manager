// @story #1500
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import { buildRuntimeCapability } from './runtime-capabilities.mjs';
import { canonical, fail, hash } from './value.mjs';

function read(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
function write(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function createRecordedEvidenceRuntime({ fixturePath, context }) {
  if (!fixturePath || context?.providerMode !== 'recorded') return null;
  const state = () => read(fixturePath);
  const persist = (value) => write(fixturePath, value);
  const capability = () => {
    const data = state();
    return (
      data.capability ||
      buildRuntimeCapability({
        authorityHostId: context.authorityHostId,
        providerMode: 'recorded',
        toolDigest: hash({ root: context.toolRoot }),
        commandCatalogDigest: hash(data.entries),
        entries: data.entries,
      })
    );
  };
  return {
    repositoryId: context.repositoryId,
    authorityHostId: context.authorityHostId,
    context,
    ports: {
      readIssue: async () => structuredClone(state().issue),
      readSourceFacts: async () => structuredClone(state().source),
      readRuntimeCapability: async () => capability(),
      listResidentEntries: async () => [...state().entries],
      withAuthorityLock: async (_claim, callback) => callback(),
      appendImportRecords: async (records) => {
        const data = state();
        data.importRecords = structuredClone(records);
        persist(data);
        return records;
      },
      readImportRecords: async () => structuredClone(state().importRecords || []),
      writeProjection: async (marker) => {
        const data = state();
        data.issue.body = `${data.issue.body}\n${marker}`;
        data.writes ||= [];
        data.writes.push({ kind: 'projection', marker });
        persist(data);
      },
      reopenIssue: async (event) => {
        const data = state();
        data.issue.state = 'OPEN';
        data.issue.stateReason = 'REOPENED';
        data.writes ||= [];
        data.writes.push({ kind: 'reopen', event });
        persist(data);
      },
    },
  };
}

function encodedImport(record) {
  return `<!-- aitm-legacy-import-v2 data="${Buffer.from(canonical(record)).toString('base64url')}" -->`;
}
function decodedImport(body) {
  const data = /^<!-- aitm-legacy-import-v2 data="([A-Za-z0-9_-]+)" -->$/.exec(body || '')?.[1];
  return data ? JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) : null;
}

export function createLiveEvidenceRuntime({ context, cfg }) {
  if (context?.providerMode !== 'live') return null;
  const entries = ['approve', 'close', 'deliver', 'evidence', 'reopen', 'review', 'test', 'verify'];
  const capability = buildRuntimeCapability({
    authorityHostId: context.authorityHostId,
    providerMode: 'live',
    toolDigest: hash(
      execFileSync('git', ['-C', context.toolRoot, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim()
    ),
    commandCatalogDigest: hash(entries),
    entries,
  });
  const readIssue = async ({ issueNumber }) => {
    const { stdout } = await pexec('gh', [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      cfg.repo,
      '--json',
      'number,body,state,stateReason,comments',
    ]);
    const issue = JSON.parse(stdout);
    return {
      number: issue.number,
      repositoryId: context.repositoryId,
      state: issue.state,
      stateReason: issue.stateReason,
      body: issue.body,
      comments: (issue.comments || []).map((comment) => ({
        id: String(comment.id),
        body: comment.body,
      })),
    };
  };
  const ports = {
    readIssue,
    readSourceFacts: async () => {
      const git = (args) =>
        execFileSync('git', ['-C', context.sourceRoot, ...args], { encoding: 'utf8' }).trim();
      return {
        sourceSha: git(['rev-parse', 'HEAD']),
        treeOid: git(['rev-parse', 'HEAD^{tree}']),
        manifestDigest: hash(git(['ls-tree', '-r', 'HEAD'])),
      };
    },
    readRuntimeCapability: async () => capability,
    listResidentEntries: async () => entries,
    withAuthorityLock: async ({ issueNumber }, callback) => {
      const dir = path.join(context.authorityRoot, '.ai-task-manager', 'evidence-v2');
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `enroll-${issueNumber}.lock`);
      let handle;
      try {
        handle = openSync(file, 'wx');
        writeFileSync(
          handle,
          canonical({ pid: process.pid, authorityHostId: context.authorityHostId })
        );
      } catch {
        fail('enrollment-lock-held');
      }
      try {
        return await callback();
      } finally {
        closeSync(handle);
        unlinkSync(file);
      }
    },
    appendImportRecords: async (records) => {
      const current = await readIssue({ issueNumber: context.issueNumber });
      const existing = current.comments
        .map((comment) => decodedImport(comment.body))
        .filter(Boolean);
      for (const record of records) {
        const prior = existing.find(
          (item) => item.operationId === record.operationId && item.sequence === record.sequence
        );
        if (prior) {
          if (canonical(prior) !== canonical(record)) fail('import-operation-conflict');
          continue;
        }
        await pexec('gh', [
          'issue',
          'comment',
          String(context.issueNumber),
          '-R',
          cfg.repo,
          '--body',
          encodedImport(record),
        ]);
      }
      return records;
    },
    readImportRecords: async ({ operationId } = {}) => {
      const current = await readIssue({ issueNumber: context.issueNumber });
      return current.comments
        .map((comment) => decodedImport(comment.body))
        .filter((record) => record && (!operationId || record.operationId === operationId));
    },
    writeProjection: async (marker) =>
      mutateIssueBody({
        issueNumber: context.issueNumber,
        repo: cfg.repo,
        mutate: (body) => {
          if (/<!--\s*aitm-evidence-v2\b/.test(body)) fail('migration-already-enrolled');
          return `${body.trimEnd()}\n\n${marker}\n`;
        },
      }),
    reopenIssue: async () =>
      pexec('gh', ['issue', 'reopen', String(context.issueNumber), '-R', cfg.repo]),
  };
  return {
    repositoryId: context.repositoryId,
    authorityHostId: context.authorityHostId,
    context,
    ports,
  };
}

export function createEvidenceRuntime(input) {
  return createRecordedEvidenceRuntime(input) || createLiveEvidenceRuntime(input);
}
