// @story #1857
// Unknown process observation is a blocker; a missing activity sample is never quiescence.
import { execFileSync } from 'node:child_process';
import { readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseRuntimeMigrationInvocation } from './runtime-migration-admission.mjs';

export function parseRuntimeProcessSnapshot(output) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('Empty process observation');
  return output
    .trim()
    .split(String.fromCharCode(10))
    .map((line) => {
      const match = line.trim().match(/^([0-9]+)\s+([0-9]+)\s+(.+)$/);
      if (!match) throw new Error('Unrecognized process observation');
      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(ppid) || ppid < 0)
        throw new Error('Invalid observed process identity');
      return { pid, ppid, executable: match[3], args: [] };
    });
}
function readSnapshot() {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5000,
  });
  const entries = parseRuntimeProcessSnapshot(output);
  for (const entry of entries.filter(nodeProcess)) {
    const args = execFileSync('ps', ['-p', String(entry.pid), '-o', 'args='], {
      encoding: 'utf8',
      timeout: 1000,
    }).trim();
    if (!args) throw new Error('Process changed during argument observation');
    // Ambiguous whitespace can only deny the optional parent-router exemption.
    entry.args = args.split(/\s+/);
  }
  return entries;
}
export function parseRuntimeProcessCwds(output) {
  const result = new Map();
  let pid;
  for (const line of output.split(String.fromCharCode(10)).filter(Boolean)) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid cwd process identity');
    } else if (line.startsWith('n')) {
      if (!pid || result.has(pid) || !path.isAbsolute(line.slice(1)))
        throw new Error('Ambiguous cwd process observation');
      result.set(pid, line.slice(1));
    } else if (line !== 'fcwd') throw new Error('Unsupported cwd observation field');
  }
  return result;
}
function readCwds(entries) {
  if (process.platform !== 'darwin') return null;
  const pids = entries.filter(nodeProcess).map((entry) => entry.pid);
  if (!pids.length) return new Map();
  const output = execFileSync('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseRuntimeProcessCwds(output);
}
function readCwd(pid) {
  if (process.platform === 'linux') return readlinkSync('/proc/' + pid + '/cwd');
  if (process.platform !== 'darwin') throw new Error('Unsupported process cwd observer');
  const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  const names = output.split(String.fromCharCode(10)).filter((line) => line.startsWith('n'));
  if (names.length !== 1) throw new Error('Uncertain process cwd');
  return names[0].slice(1);
}
const nodeProcess = (entry) =>
  /^(?:node|nodejs|bun|deno)(?:[0-9.]*)?$/.test(path.basename(entry.executable || ''));
const fingerprint = (entries) =>
  JSON.stringify(
    entries
      .filter(nodeProcess)
      .map((entry) => [entry.pid, entry.ppid, entry.executable, entry.args])
      .sort((a, b) => a[0] - b[0])
  );
const contains = (root, file) => file === root || file.startsWith(root + path.sep);

export function observeRuntimeProcesses({
  roots,
  currentPid = process.pid,
  parentPid = process.ppid,
  registeredRouter,
  adapters = {},
}) {
  const physical = adapters.physical || realpathSync;
  const snapshot = adapters.readSnapshot || readSnapshot;
  const cwdFor = adapters.readCwd || readCwd;
  const processes = [];
  const unknown = [];
  let first;
  try {
    first = snapshot();
    if (
      !Array.isArray(first) ||
      !first.length ||
      first.some(
        (entry) => !Number.isSafeInteger(entry.pid) || entry.pid <= 0 || !Array.isArray(entry.args)
      )
    )
      throw new Error('Invalid process census');
    const observedCwds = adapters.readCwd ? null : (adapters.readCwds || readCwds)(first);
    for (const entry of first.filter(nodeProcess)) {
      if (entry.pid === currentPid) continue;
      if (entry.pid === parentPid && entry.args.length >= 4) {
        try {
          if (
            physical(entry.args[1]) === physical(registeredRouter) &&
            parseRuntimeMigrationInvocation(entry.args.slice(2))
          )
            continue;
        } catch {
          /* an unknown ancestor is not an admitted router */
        }
      }
      try {
        const observed = observedCwds ? observedCwds.get(entry.pid) : cwdFor(entry.pid);
        if (typeof observed !== 'string') throw new Error('Missing cwd observation');
        const cwd = physical(observed);
        const selected = roots
          .filter((root) => contains(root, cwd))
          .sort((a, b) => b.length - a.length)[0];
        if (selected) processes.push({ pid: entry.pid, projectRoot: selected, observed: 'live' });
      } catch {
        unknown.push({ pid: entry.pid, reason: 'process-cwd-unavailable' });
      }
    }
    if (fingerprint(first) !== fingerprint(snapshot()))
      unknown.push({ reason: 'process-census-changed' });
  } catch {
    unknown.push({ reason: 'process-census-unavailable' });
  }
  return { complete: unknown.length === 0, processes, unknown };
}
