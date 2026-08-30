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

function normalizedArgv(file, args) {
  return [file, ...(Array.isArray(args) ? args : [])];
}

function normalizedOptions(args, options) {
  return Array.isArray(args) ? options : args;
}

function effectiveEnv(args, options, fallbackEnv) {
  return normalizedOptions(args, options)?.env ?? fallbackEnv;
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
  const delegatesToPathDouble = (file, args, options) => {
    const callEnv = effectiveEnv(args, options, env);
    return (
      file === 'gh' &&
      censusBin &&
      callEnv.AITM_GH_TEST_DOUBLE_BIN &&
      path.resolve(path.dirname(firstGhOnPath(callEnv))) ===
        path.resolve(callEnv.AITM_GH_TEST_DOUBLE_BIN)
    );
  };
  const shouldAbsorb = (file, args, options) =>
    file === 'gh' && !delegatesToPathDouble(file, args, options);
  const record = (argv) => {
    if (censusLog) {
      appendFileSync(censusLog, `${env.AITM_GH_CENSUS_CALLER ?? ''}\t${argv.slice(1).join(' ')}\n`);
    }
  };

  const censusPexec = (...callArgs) => {
    const [file, args] = callArgs;
    if (!shouldAbsorb(file, args, callArgs[2])) return originalPexec(...callArgs);
    const argv = normalizedArgv(file, args);
    record(argv);
    return Promise.reject(refusal(argv));
  };

  const censusExecFile = (...callArgs) => {
    const [file, args] = callArgs;
    if (!shouldAbsorb(file, args, callArgs[2])) return original.execFile(...callArgs);
    const done = callArgs.findLast((arg) => typeof arg === 'function');
    const argv = normalizedArgv(file, args);
    record(argv);
    const error = refusal(argv);
    const child = new EventEmitter();
    queueMicrotask(() => {
      if (done) done(error, error.stdout, error.stderr);
      else child.emit('error', error);
    });
    return child;
  };
  censusExecFile[promisify.custom] = censusPexec;

  const censusSpawn = (...callArgs) => {
    const [file, args] = callArgs;
    if (!shouldAbsorb(file, args, callArgs[2])) return original.spawn(...callArgs);
    const argv = normalizedArgv(file, args);
    record(argv);
    const error = refusal(argv);
    const child = new EventEmitter();
    child.stdout = Readable.from([]);
    child.stderr = Readable.from([error.stderr]);
    child.stdin = { write() {}, end() {} };
    setImmediate(() => child.emit('close', error.code));
    return child;
  };

  const censusExecFileSync = (...callArgs) => {
    const [file, args] = callArgs;
    if (!shouldAbsorb(file, args, callArgs[2])) return original.execFileSync(...callArgs);
    const argv = normalizedArgv(file, args);
    record(argv);
    throw refusal(argv);
  };

  const censusSpawnSync = (...callArgs) => {
    const [file, args, options] = callArgs;
    if (!shouldAbsorb(file, args, options)) return original.spawnSync(...callArgs);
    const argv = normalizedArgv(file, args);
    const resolvedOptions = normalizedOptions(args, options);
    record(argv);
    const error = refusal(argv);
    const stdout = encodedOutput('', resolvedOptions);
    const stderr = encodedOutput(error.stderr, resolvedOptions);
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
