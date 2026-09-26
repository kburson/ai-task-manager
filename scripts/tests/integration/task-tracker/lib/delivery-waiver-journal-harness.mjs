// @story #1787 #1796
import { mkdtemp, mkdir, rm, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { createDeliveryWaiverJournal } from '../../../../task-tracker/lib/delivery-waiver-journal.mjs';

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b;
    });
    child.stderr.on('data', (b) => {
      err += b;
    });
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    child.on('error', reject);
  });
}

export function gitInput(cwd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b;
    });
    child.stderr.on('data', (b) => {
      err += b;
    });
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    child.on('error', reject);
    child.stdin.end(input);
  });
}

export async function createTwoCloneHarness(issue = 1796) {
  const root = await mkdtemp(
    join(projectScratchDir('test', process.cwd()), 'aitm-waiver-journal-')
  );
  const owner = join(root, 'example');
  await mkdir(owner);
  const bare = join(owner, 'project.git');
  const commentsDir = join(root, 'comments');
  await mkdir(commentsDir);
  await git(root, ['init', '--bare', bare]);
  const a = join(root, 'a');
  const b = join(root, 'b');
  await git(root, ['clone', bare, a]);
  await git(root, ['clone', bare, b]);
  return {
    root,
    bare,
    commentsDir,
    a,
    b,
    hostA: createDeliveryWaiverJournal({
      cwd: a,
      repository: 'example/project',
      issue,
      allowLocalRemote: true,
    }),
    hostB: createDeliveryWaiverJournal({
      cwd: b,
      repository: 'example/project',
      issue,
      allowLocalRemote: true,
    }),
    git,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function runBurnWorker({ cwd, burn }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(import.meta.url),
      '--burn-worker',
      cwd,
      JSON.stringify(burn),
    ]);
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b;
    });
    child.stderr.on('data', (b) => {
      err += b;
    });
    child.on('close', (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err || out))
    );
    child.on('error', reject);
  });
}

export function runBurnCrashWorker({ cwd, burn, crashAt }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(import.meta.url),
      '--burn-worker',
      cwd,
      JSON.stringify(burn),
      crashAt,
    ]);
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b;
    });
    child.stderr.on('data', (b) => {
      err += b;
    });
    child.on('close', (code) => resolve({ code, output: out.trim(), error: err.trim() }));
    child.on('error', reject);
  });
}

if (process.argv[2] === '--burn-worker') {
  const { ensureDeliveryWaiverBurn } =
    await import('../../../../task-tracker/lib/delivery-waiver-consumption.mjs');
  const burn = JSON.parse(process.argv[4]);
  const { verifiedInitialBurn } =
    await import('../../../unit/task-tracker/lib/delivery-waiver-consumption-fixtures.mjs');
  const journal = createDeliveryWaiverJournal({
    cwd: process.argv[3],
    repository: burn.repository,
    issue: burn.issue,
    allowLocalRemote: true,
  });
  const crashAt = process.argv[5];
  const crashJournal = crashAt
    ? {
        read: () => journal.read(),
        async compareAndAppend(input) {
          if (crashAt === 'before-burn-push') process.exit(76);
          const result = await journal.compareAndAppend(input);
          if (crashAt === 'after-burn-push') process.exit(77);
          return result;
        },
      }
    : journal;
  try {
    const result = await ensureDeliveryWaiverBurn({
      candidate: burn,
      journal: crashJournal,
      verifyInitialBurn: verifiedInitialBurn,
    });
    process.stdout.write(JSON.stringify({ burnOid: result.burnOid }));
  } catch (error) {
    process.stderr.write(`${error.category ?? error.message}\n`);
    process.exitCode = 1;
  }
}

export async function listSharedComments(dir) {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(
    names.map(async (name) => JSON.parse(await readFile(join(dir, name), 'utf8')))
  );
}

function sharedComments(dir, crashAt) {
  return {
    list: () => listSharedComments(dir),
    async post(body) {
      if (crashAt === 'before-post') process.exit(72);
      const name = randomUUID();
      const comment = { body, id: `C-${name}`, createdAt: '2026-09-25T00:01:00.000Z' };
      const pending = join(dir, `${name}.pending`);
      await writeFile(pending, JSON.stringify(comment));
      await rename(pending, join(dir, `${name}.json`));
      if (crashAt === 'after-post') process.exit(73);
      return comment;
    },
  };
}

export function runPublicationWorker(options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(import.meta.url),
      '--publication-worker',
      JSON.stringify(options),
    ]);
    let out = '';
    let err = '';
    child.stdout.on('data', (b) => {
      out += b;
    });
    child.stderr.on('data', (b) => {
      err += b;
    });
    child.on('close', (code) => resolve({ code, output: out.trim(), error: err.trim() }));
    child.on('error', reject);
  });
}

if (process.argv[2] === '--publication-worker') {
  const options = JSON.parse(process.argv[3]);
  const { ensureWaiverIntent, publishWaivedReceipt } =
    await import('../../../../task-tracker/lib/delivery-waiver-consumption.mjs');
  const base = createDeliveryWaiverJournal({
    cwd: options.cwd,
    repository: options.repository,
    issue: options.issue,
    allowLocalRemote: true,
  });
  const requestState = options.kind === 'intent' ? 'intent-requesting' : 'receipt-requesting';
  const finalState = options.kind === 'intent' ? 'intent-confirmed' : 'completed';
  const journal = {
    read: () => base.read(),
    async compareAndAppend(input) {
      const state = input.entry.state;
      if (state === requestState && options.crashAt === 'before-request-push') process.exit(70);
      if (state === finalState && options.crashAt === 'before-final-push') process.exit(74);
      const result = await base.compareAndAppend(input);
      if (state === requestState && options.crashAt === 'after-request-push') process.exit(71);
      if (state === finalState && options.crashAt === 'after-final-push') process.exit(75);
      return result;
    },
  };
  const comments = sharedComments(options.commentsDir, options.crashAt);
  try {
    const result =
      options.kind === 'intent'
        ? await ensureWaiverIntent({
            candidate: options.candidate,
            journal,
            comments,
            runId: options.runId,
          })
        : await publishWaivedReceipt({
            burn: options.burn,
            burnOid: options.burnOid,
            receiptBody: options.receiptBody,
            receiptDigest: options.receiptDigest,
            journal,
            comments,
            runId: options.runId,
          });
    process.stdout.write(JSON.stringify({ status: result.status, commentId: result.comment.id }));
  } catch (error) {
    process.stderr.write(`${error.category ?? error.message}:${error.outcome ?? ''}\n`);
    process.exitCode = 1;
  }
}
