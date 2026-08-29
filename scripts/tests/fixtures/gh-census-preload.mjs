// @story #1410
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

function firstGhOnPath(env) {
  for (const dir of String(env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'gh');
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

function refusal(argv) {
  const stderr = `gh-call-census: shared offline boundary refused ${argv.join(' ')}\n`;
  const error = new Error(`gh exited 86: ${stderr}`);
  error.code = 86;
  error.status = 86;
  error.stdout = '';
  error.stderr = stderr;
  return error;
}

function encodedOutput(value, options) {
  return options?.encoding && options.encoding !== 'buffer' ? value : Buffer.from(value);
}

export function installGhCensusPreload({ env = process.env } = {}) {
  const censusBin = env.AITM_GH_CENSUS_BIN || '';
  const censusLog = censusBin ? path.join(censusBin, 'calls.log') : '';
  const original = {
    execFile: childProcess.execFile,
    execFileSync: childProcess.execFileSync,
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
  };
  const originalPexec = promisify(original.execFile);

  // Only an explicitly declared test double remains authoritative. Merely
  // placing another gh earlier on PATH is not enough: it could be the real
  // binary, so the census must absorb and record it.
  const delegatesToPathDouble = (file) =>
    file === 'gh' &&
    censusBin &&
    env.AITM_GH_TEST_DOUBLE_BIN &&
    path.resolve(path.dirname(firstGhOnPath(env))) === path.resolve(env.AITM_GH_TEST_DOUBLE_BIN);
  const shouldAbsorb = (file) => file === 'gh' && !delegatesToPathDouble(file);
  const record = (argv) => {
    if (censusLog) {
      appendFileSync(censusLog, `${env.AITM_GH_CENSUS_CALLER ?? ''}\t${argv.slice(1).join(' ')}\n`);
    }
  };

  const censusPexec = (file, args = [], options) => {
    if (!shouldAbsorb(file)) return originalPexec(file, args, options);
    const argv = [file, ...args];
    record(argv);
    return Promise.reject(refusal(argv));
  };

  const censusExecFile = (file, args = [], options, callback) => {
    if (!shouldAbsorb(file)) return original.execFile(file, args, options, callback);
    const done = typeof options === 'function' ? options : callback;
    const argv = [file, ...args];
    record(argv);
    const error = refusal(argv);
    queueMicrotask(() => done(error, error.stdout, error.stderr));
    return new EventEmitter();
  };
  censusExecFile[promisify.custom] = censusPexec;

  const censusSpawn = (file, args = [], options) => {
    if (!shouldAbsorb(file)) return original.spawn(file, args, options);
    const argv = [file, ...args];
    record(argv);
    const error = refusal(argv);
    const child = new EventEmitter();
    child.stdout = Readable.from([]);
    child.stderr = Readable.from([error.stderr]);
    child.stdin = { write() {}, end() {} };
    setImmediate(() => child.emit('close', error.code));
    return child;
  };

  const censusExecFileSync = (file, args = [], options) => {
    if (!shouldAbsorb(file)) return original.execFileSync(file, args, options);
    const argv = [file, ...args];
    record(argv);
    throw refusal(argv);
  };

  const censusSpawnSync = (file, args = [], options) => {
    if (!shouldAbsorb(file)) return original.spawnSync(file, args, options);
    const argv = [file, ...args];
    record(argv);
    const error = refusal(argv);
    const stdout = encodedOutput('', options);
    const stderr = encodedOutput(error.stderr, options);
    return {
      pid: 0,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: error.code,
      signal: null,
    };
  };

  Object.assign(childProcess, {
    execFile: censusExecFile,
    execFileSync: censusExecFileSync,
    spawn: censusSpawn,
    spawnSync: censusSpawnSync,
  });
  syncBuiltinESMExports();

  return () => {
    Object.assign(childProcess, original);
    syncBuiltinESMExports();
  };
}

const guardContract = process.argv[1]?.endsWith(
  '/scripts/tests/unit/gh/gh-fail-closed-guard.test.mjs'
);
const censusContract = process.argv[1]?.endsWith(
  '/scripts/tests/integration/gh/gh-call-census.test.mjs'
);
if (process.env.AITM_GH_CENSUS_BIN && !guardContract && !censusContract) {
  installGhCensusPreload();
}
