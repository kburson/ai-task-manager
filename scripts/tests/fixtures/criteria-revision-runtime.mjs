// @story #1852
import path from 'node:path';
import { makeLegacyRevisionFixture } from './criteria-revision.mjs';

export function memoryRuntime() {
  const files = new Map(),
    dirs = new Set(['/', '/config', '/git', '/git/common']);
  const normalize = (p) => path.resolve(p);
  const error = (code) => Object.assign(new Error(code), { code });
  const fs = {
    mkdirSync(p, options = {}) {
      p = normalize(p);
      if (dirs.has(p)) {
        if (!options.recursive) throw error('EEXIST');
        return;
      }
      if (options.recursive) fs.mkdirSync(path.dirname(p), options);
      else if (!dirs.has(path.dirname(p))) throw error('ENOENT');
      dirs.add(p);
    },
    readFileSync(p) {
      p = normalize(p);
      if (!files.has(p)) throw error('ENOENT');
      return files.get(p);
    },
    writeFileSync(p, value, options = {}) {
      p = normalize(p);
      if (options.flag === 'wx' && files.has(p)) throw error('EEXIST');
      if (!dirs.has(path.dirname(p))) throw error('ENOENT');
      files.set(p, String(value));
    },
    renameSync(a, b) {
      a = normalize(a);
      b = normalize(b);
      if (!files.has(a)) throw error('ENOENT');
      files.set(b, files.get(a));
      files.delete(a);
    },
    unlinkSync(p) {
      if (!files.delete(normalize(p))) throw error('ENOENT');
    },
    rmdirSync(p) {
      p = normalize(p);
      if ([...files.keys(), ...dirs].some((x) => x.startsWith(p + '/'))) throw error('ENOTEMPTY');
      if (!dirs.delete(p)) throw error('ENOENT');
    },
    realpathSync: normalize,
    readdirSync(p) {
      const prefix = normalize(p) + '/';
      return [
        ...new Set(
          [...files.keys(), ...dirs]
            .filter((x) => x.startsWith(prefix))
            .map((x) => x.slice(prefix.length).split('/')[0])
        ),
      ];
    },
  };
  let serial = 0;
  const identity = {
    repository: 'owner/repo',
    commonDirectory: '/git/common',
    hostId: 'host-one',
    bootId: 'boot-one',
  };
  const ports = {
    fs,
    configRoot: '/config',
    inspect: () => ({ ...identity }),
    pid: 101,
    nonce: () => `nonce-${++serial}`,
    liveness: () => 'alive',
    observePending: () => false,
  };
  const context = {
    repository: 'owner/repo',
    issues: [1852],
    executor: {
      adapter: 'codex-session/v1',
      sessionId: 'session-one',
      worktree: '/work/a',
      branch: 'topic',
    },
  };
  return { ports, context, identity, files, dirs };
}
export function authorityResult(context, domain) {
  const observation = makeLegacyRevisionFixture().observation;
  Object.assign(observation, {
    repository: context.repository,
    issue: context.issues[0],
    writerDomain: { hostId: domain.hostId, commonDirectory: domain.commonDirectory },
    executor: context.executor,
  });
  return {
    observation,
    authority: {
      complete: true,
      pending: false,
      chain: 'empty',
      head: null,
      baselineAllowed: true,
      contractDigest: 'sha256:' + 'a'.repeat(64),
      planApproval: null,
    },
  };
}
