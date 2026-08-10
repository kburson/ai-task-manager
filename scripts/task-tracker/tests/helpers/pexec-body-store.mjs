import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Stateful GitHub CLI response used by verb fixtures whose production body
// writer now honors the injected pexec seam. Returns null for non-gh commands
// so each fixture can retain its verifier and git behavior.
export function pexecGithubBodyStore({ bin, args = [], options = {}, fallbackBody = '' } = {}) {
  if (bin !== 'gh') return null;
  const storeFile = process.env.AITM_FAKE_BODY_FILE;
  const readBody = () =>
    storeFile && existsSync(storeFile) ? readFileSync(storeFile, 'utf8') : fallbackBody;

  if (args[0] === 'issue' && args[1] === 'view') {
    return { stdout: readBody(), stderr: '' };
  }
  if (args[0] === 'issue' && args[1] === 'edit' && args.includes('--body-file')) {
    if (typeof options.input !== 'string') {
      throw new TypeError('pexec body-store edit requires options.input');
    }
    if (storeFile) writeFileSync(storeFile, options.input, 'utf8');
    return { stdout: '', stderr: '' };
  }
  return { stdout: '', stderr: '' };
}
