// @story #1692
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { INSTALL_MANIFEST_PATH } from './install-contract.mjs';

export function writeInstallManifest(targetDir, manifest, deps = {}) {
  const mkdir = deps.mkdirSync || mkdirSync;
  const write = deps.writeFileSync || writeFileSync;
  const rename = deps.renameSync || renameSync;
  const remove = deps.rmSync || rmSync;
  const pid = deps.pid ?? process.pid;
  const destination = join(targetDir, INSTALL_MANIFEST_PATH);
  const temporary = `${destination}.${pid}.tmp`;
  mkdir(dirname(destination), { recursive: true });
  try {
    write(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    rename(temporary, destination);
  } catch (error) {
    remove(temporary, { force: true });
    throw error;
  }
}
