// @story #1496
// Test-only preload: replace transport, never the dispatcher, preflight or verbs.
import childProcess from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  readRecordedExecutionContext,
  rehearsalRefusal,
  registerRecordedTransport,
} from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';
import { openProvider } from './provider.mjs';
import { guardGitInvocation } from './git-boundary.mjs';

export const BOOTSTRAP_FILE = fileURLToPath(import.meta.url);

if (process.execArgv.includes(BOOTSTRAP_FILE)) {
  const context = readRecordedExecutionContext();
  if (!context) throw rehearsalRefusal('context-required');
  const provider = openProvider(context);
  const native = { ...childProcess };
  const deny = () => {
    throw rehearsalRefusal('network-denied');
  };
  for (const object of [http, https]) {
    object.request = deny;
    object.get = deny;
  }
  net.connect = deny;
  net.createConnection = deny;
  net.Socket.prototype.connect = deny;
  tls.connect = deny;
  dgram.createSocket = deny;
  for (const api of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
    for (const key of Object.getOwnPropertyNames(api)) {
      if (/^(?:lookup|resolve|reverse|setServers)/.test(key)) api[key] = deny;
    }
  }
  globalThis.fetch = deny;
  if (globalThis.WebSocket)
    globalThis.WebSocket = class {
      constructor() {
        deny();
      }
    };

  function check(file, args, options = {}) {
    if (options.shell || file !== 'git') throw rehearsalRefusal('unsupported-process');
    if (
      options.env &&
      Object.keys(options.env).some((key) =>
        /^(?:GH_TOKEN|GITHUB_TOKEN|GIT_DIR|GIT_WORK_TREE|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_CONFIG_COUNT|NODE_OPTIONS)$/.test(
          key
        )
      )
    )
      throw rehearsalRefusal('process-environment');
    return { ...guardGitInvocation(context, args, options), env: process.env };
  }

  function gh(args, options = {}) {
    return provider.command(args, {
      ...options,
      operationId: process.env.AITM_REHEARSAL_OPERATION_ID,
      fault: process.env.AITM_REHEARSAL_FAULT,
    });
  }

  function fakeGh(args, options = {}, callback) {
    const proc = new EventEmitter();
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    let input = '';
    proc.stdin.on('data', (chunk) => {
      input += chunk;
    });
    const execute = () => {
      let stdout = '';
      let stderr = '';
      let error;
      try {
        stdout = gh(args, { ...options, input: options.input ?? input });
      } catch (err) {
        error = err;
        stderr = `${err.message}\n`;
        error.code = 1;
      }
      proc.stdout.end(stdout);
      proc.stderr.end(stderr);
      if (callback) callback(error || null, stdout, stderr);
      proc.emit('close', error ? 1 : 0);
    };
    if (args.includes('--body-file') && args.includes('-') && options.input == null)
      proc.stdin.on('finish', execute);
    else queueMicrotask(execute);
    return proc;
  }

  childProcess.execFileSync = (file, args = [], options = {}) => {
    if (file === 'gh') {
      const out = gh(args, options);
      return options.encoding ? out : Buffer.from(out);
    }
    return native.execFileSync(file, args, check(file, args, options));
  };
  childProcess.spawnSync = (file, args = [], options = {}) => {
    if (file === 'gh') {
      try {
        return { status: 0, stdout: gh(args, options), stderr: '' };
      } catch (error) {
        return { status: 1, stdout: '', stderr: error.message, error };
      }
    }
    return native.spawnSync(file, args, check(file, args, options));
  };
  childProcess.execFile = (file, args = [], options = {}, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (file === 'gh') return fakeGh(args, options, callback);
    return native.execFile(file, args, check(file, args, options), callback);
  };
  childProcess.execFile[promisify.custom] = (file, args = [], options = {}) => {
    if (file === 'gh')
      return Promise.resolve().then(() => ({ stdout: gh(args, options), stderr: '' }));
    return promisify(native.execFile)(file, args, check(file, args, options));
  };
  childProcess.spawn = (file, args = [], options = {}) =>
    file === 'gh' ? fakeGh(args, options) : native.spawn(file, args, check(file, args, options));
  for (const key of ['exec', 'execSync', 'fork'])
    childProcess[key] = () => {
      throw rehearsalRefusal('unsupported-process');
    };
  syncBuiltinESMExports();
  registerRecordedTransport(context);
}
