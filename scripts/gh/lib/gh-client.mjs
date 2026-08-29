import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const defaultPexec = promisify(execFile);

// One late-resolving process seam for GitHub CLI traffic. Tests may replace
// `ghClient.pexec`; production keeps the exact promisified execFile binding.
export const ghClient = { execFile, spawn, pexec: defaultPexec };

export function pexec(...args) {
  return ghClient.pexec(...args);
}
