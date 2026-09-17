// @story #1654
// Test-only preload. It must be installed before any characterized production import.
import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { PassThrough, Readable } from 'node:stream';
import tls from 'node:tls';
import { promisify } from 'node:util';

import { legacyTransportError, openLegacyTransport } from './guidance-legacy-transport.mjs';

const configPath = process.env.AITM_GUIDANCE_LEGACY_TRANSPORT_CONFIG;

function encoded(value, options) {
  return options?.encoding && options.encoding !== 'buffer' ? value : Buffer.from(value);
}

function normalizeArgs(args) {
  return Array.isArray(args) ? args.map(String) : [];
}

function normalizeFileCall(file, args, options, callback) {
  if (!Array.isArray(args))
    return { file: String(file), args: [], options: args ?? {}, callback: options };
  if (typeof options === 'function')
    return { file: String(file), args: normalizeArgs(args), options: {}, callback: options };
  return { file: String(file), args: normalizeArgs(args), options: options ?? {}, callback };
}

function fakeChild(response = {}) {
  const child = new EventEmitter();
  child.pid = 0;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => {
    child.stdout.end(response.stdout ?? '');
    child.stderr.end(response.stderr ?? '');
    child.emit('close', response.code ?? 0, null);
  });
  return child;
}

function fakeRequest(response, callback) {
  const request = new EventEmitter();
  request.write = () => true;
  request.setHeader = () => {};
  request.getHeader = () => undefined;
  request.abort = () => request.emit('abort');
  request.destroy = (error) => {
    if (error) request.emit('error', error);
  };
  request.end = () => {
    const body = Readable.from([response.stdout ?? response.body ?? '']);
    body.statusCode = response.statusCode ?? 200;
    body.headers = response.headers ?? {};
    queueMicrotask(() => {
      callback?.(body);
      request.emit('response', body);
    });
    return request;
  };
  return request;
}

function install() {
  if (!configPath) return;
  const transport = openLegacyTransport(configPath);
  const native = {
    execFile: childProcess.execFile,
    exec: childProcess.exec,
    execFileSync: childProcess.execFileSync,
    execSync: childProcess.execSync,
    spawn: childProcess.spawn,
    spawnSync: childProcess.spawnSync,
  };
  const nativePexecFile = promisify(native.execFile);

  function execFile(file, args = [], options = {}, callback) {
    const call = normalizeFileCall(file, args, options, callback);
    const { response } = transport.dispatch({ lane: 'execFile', file: call.file, args: call.args });
    if (response.delegate)
      return native.execFile(call.file, call.args, call.options, call.callback);
    const child = fakeChild(response);
    const error = response.error ? legacyTransportError(response.error, response) : null;
    queueMicrotask(() => call.callback?.(error, response.stdout ?? '', response.stderr ?? ''));
    return child;
  }

  execFile[promisify.custom] = (file, args = [], options = {}) => {
    const call = normalizeFileCall(file, args, options);
    let child;
    let promise;
    try {
      const { response } = transport.dispatch({
        lane: 'execFile',
        file: call.file,
        args: call.args,
      });
      if (response.delegate) {
        promise = nativePexecFile(file, args, options);
        child = promise.child;
      } else {
        child = fakeChild(response);
        promise = response.error
          ? Promise.reject(legacyTransportError(response.error, response))
          : Promise.resolve({ stdout: response.stdout ?? '', stderr: response.stderr ?? '' });
      }
    } catch (error) {
      child = fakeChild({ stderr: error.stderr, code: error.code });
      promise = Promise.reject(error);
    }
    promise.child = child;
    return promise;
  };

  function exec(command, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const { response } = transport.dispatch({ lane: 'exec', command: String(command) });
    const child = fakeChild(response);
    const error = response.error ? legacyTransportError(response.error, response) : null;
    queueMicrotask(() => callback?.(error, response.stdout ?? '', response.stderr ?? ''));
    return child;
  }

  exec[promisify.custom] = (command) => {
    let child;
    let promise;
    try {
      const { response } = transport.dispatch({ lane: 'exec', command: String(command) });
      child = fakeChild(response);
      promise = response.error
        ? Promise.reject(legacyTransportError(response.error, response))
        : Promise.resolve({ stdout: response.stdout ?? '', stderr: response.stderr ?? '' });
    } catch (error) {
      child = fakeChild({ stderr: error.stderr, code: error.code });
      promise = Promise.reject(error);
    }
    promise.child = child;
    return promise;
  };

  function execFileSync(file, args = [], options = {}) {
    const call = normalizeFileCall(file, args, options);
    const { response } = transport.dispatch({
      lane: 'execFileSync',
      file: call.file,
      args: call.args,
    });
    if (response.error) throw legacyTransportError(response.error, response);
    return encoded(response.stdout ?? '', call.options);
  }

  function execSync(command, options = {}) {
    const { response } = transport.dispatch({ lane: 'execSync', command: String(command) });
    if (response.error) throw legacyTransportError(response.error, response);
    return encoded(response.stdout ?? '', options);
  }

  function spawn(file, args = [], options = {}) {
    const call = normalizeFileCall(file, args, options);
    const { response } = transport.dispatch({ lane: 'spawn', file: call.file, args: call.args });
    if (response.delegate) return native.spawn(file, args, options);
    return fakeChild(response);
  }

  function spawnSync(file, args = [], options = {}) {
    const call = normalizeFileCall(file, args, options);
    const { response } = transport.dispatch({
      lane: 'spawnSync',
      file: call.file,
      args: call.args,
    });
    const stdout = encoded(response.stdout ?? '', call.options);
    const stderr = encoded(response.stderr ?? '', call.options);
    return {
      pid: 0,
      output: [null, stdout, stderr],
      stdout,
      stderr,
      status: response.code ?? 0,
      signal: null,
    };
  }

  Object.assign(childProcess, { execFile, exec, execFileSync, execSync, spawn, spawnSync });
  syncBuiltinESMExports();

  for (const protocol of [http, https]) {
    protocol.request = (input, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      const url = input instanceof URL ? input.href : String(input);
      const { response } = transport.dispatch({ lane: protocol === http ? 'http' : 'https', url });
      return fakeRequest(response, callback);
    };
    protocol.get = (input, options, callback) => protocol.request(input, options, callback).end();
  }

  const denyUndeclaredNetwork =
    (lane) =>
    (...args) =>
      transport.dispatch({ lane, target: String(args[0] ?? '') });
  net.connect = denyUndeclaredNetwork('net');
  net.createConnection = net.connect;
  tls.connect = denyUndeclaredNetwork('tls');
  dgram.createSocket = denyUndeclaredNetwork('dgram');
  for (const resolver of [dns, dns.promises]) {
    for (const key of Object.keys(resolver)) {
      if (/^(?:lookup|resolve|reverse)/.test(key)) resolver[key] = denyUndeclaredNetwork('dns');
    }
  }
  globalThis.fetch = denyUndeclaredNetwork('fetch');
}

install();
