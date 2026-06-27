import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Compare-before-write writer (#574, EPIC #571).
//
// Reads the on-disk bytes and skips the write entirely — no `writeFileSync`, no
// mtime touch — when they already equal `content`. Returns `{ written }`.
//
// Why this matters for tracked config: once a file is tracked in git, any code
// path that rewrites byte-identical content dirties the working tree, and a
// dirty tree disables the content-addressed verifier cache wholesale. The
// field-config emit (`project-fields.json` / `project-field-events.json`) is now
// tracked, so every writer that touches it must route through here to stay
// idempotent at the filesystem level.
//
// `content` is written as UTF-8. The parent directory is created if absent.
export function writeIfChanged(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  if (existsSync(filePath) && readFileSync(filePath, 'utf8') === content) {
    return { written: false };
  }
  writeFileSync(filePath, content, 'utf8');
  return { written: true };
}
