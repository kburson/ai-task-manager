import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const nodePexec = promisify(nodeExecFile);

function externalCallSite() {
  return (
    new Error().stack
      ?.split('\n')
      .slice(1)
      .map((line) => line.trim())
      .find((line) => !line.includes('/gh-client.mjs:') && !line.includes('node:internal')) ||
    'unknown call site'
  );
}

function realGhRefusal(file, args) {
  if (file !== 'gh' || process.env.TT_SKIP_NETWORK !== '1' || resolvesToDeclaredOfflineDouble()) {
    return null;
  }
  const argv = [file, ...(Array.isArray(args) ? args : [])];
  return new Error(
    [
      'gh-client: refused the real gh binary while TT_SKIP_NETWORK=1.',
      `Call site: ${externalCallSite()}`,
      `Argument vector: ${JSON.stringify(argv)}`,
      'Install the offline double with installStubGh() or replace the relevant ghClient property.',
    ].join('\n')
  );
}

function resolvesToDeclaredOfflineDouble() {
  const declaredBin = process.env.AITM_GH_TEST_DOUBLE_BIN;
  if (!declaredBin) return false;
  for (const directory of String(process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, 'gh');
    if (!existsSync(candidate)) continue;
    return path.resolve(directory) === path.resolve(declaredBin);
  }
  return false;
}

function defaultPexec(...args) {
  const refusal = realGhRefusal(args[0], args[1]);
  if (refusal) return Promise.reject(refusal);
  return nodePexec(...args);
}

function defaultExecFile(...args) {
  const refusal = realGhRefusal(args[0], args[1]);
  if (refusal) throw refusal;
  return nodeExecFile(...args);
}

defaultExecFile[promisify.custom] = (...args) => defaultPexec(...args);

function defaultSpawn(...args) {
  const refusal = realGhRefusal(args[0], args[1]);
  if (refusal) throw refusal;
  return nodeSpawn(...args);
}

// One late-resolving process seam for GitHub CLI traffic. Tests may replace
// `ghClient.pexec`; production keeps the same child-process calls while the
// real defaults fail closed under the repository's test-network signal.
export const ghClient = { execFile: defaultExecFile, spawn: defaultSpawn, pexec: defaultPexec };

export function pexec(...args) {
  return ghClient.pexec(...args);
}
