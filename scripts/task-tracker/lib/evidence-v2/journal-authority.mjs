// @story #1497
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  rmdirSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, canonical, fail, uuidValue } from './value.mjs';
import { assertSyntheticContext } from './protocol.mjs';
function guardFile(file) {
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('authority-path');
  }
}
export function loadJson(file, fallback = null) {
  guardFile(file);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}
export function atomicJson(file, value) {
  guardFile(file);
  const pending = `${file}.${randomUUID()}.pending`;
  try {
    writeFileSync(pending, canonical(value), { flag: 'wx', mode: 0o600 });
    renameSync(pending, file);
  } finally {
    if (existsSync(pending)) unlinkSync(pending);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
async function withFileLock(file, hostId, callback) {
  const content = canonical({ pid: process.pid, hostId, nonce: randomUUID() });
  const deadline = Date.now() + 10000;
  for (;;) {
    if (Date.now() > deadline) fail('authority-locked');
    try {
      writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holder = loadJson(file);
    if (!holder) continue;
    if (holder?.hostId !== hostId) fail('authority-host-mismatch');
    if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) fail('lock-damaged');
    if (!alive(holder.pid)) {
      const claim = `${file}.reclaim`;
      let owned = false;
      try {
        mkdirSync(claim);
        owned = true;
        const current = loadJson(file);
        if (current && canonical(current) === canonical(holder) && !alive(current.pid))
          unlinkSync(file);
      } catch (error) {
        if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error;
      } finally {
        if (owned) rmdirSync(claim);
      }
      if (!owned) await new Promise((r) => setTimeout(r, 20));
      continue;
    }
    if (Date.now() > deadline) fail('authority-locked');
    await new Promise((r) => setTimeout(r, 20));
  }
  try {
    return await callback();
  } finally {
    if (existsSync(file) && readFileSync(file, 'utf8') === content) unlinkSync(file);
  }
}
export async function withJournalAuthority({ record, authority }, callback) {
  const context = assertSyntheticContext(
    authority?.context,
    record.repositoryId,
    record.issueNumber
  );
  uuidValue(authority.hostId, 'authority-host');
  if (path.dirname(context.gitCommonDir) !== context.authorityRoot) fail('authority-root-mismatch');
  if (record.recordType === 'cycle-opened' && record.payload.authorityHostId !== authority.hostId)
    fail('authority-host-mismatch');
  let root = context.authorityRoot;
  for (const segment of ['.ai-task-manager', 'evidence-v2', hash(record.repositoryId).slice(7)]) {
    root = path.join(root, segment);
    if (existsSync(root)) {
      const stat = lstatSync(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('authority-path');
    } else mkdirSync(root);
  }
  return withFileLock(path.join(root, 'authority.lock'), authority.hostId, async () => {
    const hostFile = path.join(root, 'host.json');
    const host = loadJson(hostFile);
    if (host && host.hostId !== authority.hostId) fail('authority-host-mismatch');
    if (!host)
      atomicJson(hostFile, { hostId: authority.hostId, repositoryId: record.repositoryId });
    const dir = path.join(root, String(record.issueNumber));
    if (existsSync(dir)) {
      const stat = lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('authority-path');
    } else mkdirSync(dir);
    return callback({ dir, context });
  });
}
