#!/usr/bin/env node
// Provision the unscoped `node_modules/ai-task-manager` self-link in a dogfooding
// checkout so the SessionStart/PreCompact/PostCompact hooks and the bash/agent/
// activity PreToolUse guards resolve instead of failing open (#791).
//
// Wired to npm `prepare` (runs on local `npm install`/`npm ci` in a dev checkout,
// NOT on a consumer's registry install) and exposed as `npm run link:self` for
// manual worktree bootstrap: after `git worktree add`, run `npm ci` or
// `npm run link:self`. No-op in consumer installs (see `isDevPackage`). Never throws
// out — a failed `prepare` would abort `npm install`, which is worse than a missing
// dev convenience.
//
// All diagnostics go to **stderr**: `prepare` also fires during `npm pack`/`npm
// publish`, and `npm pack --json` emits its manifest on stdout. A stray stdout line
// here corrupts that JSON (breaks package-boundary + memory-seed-packaged tests), so
// keep stdout clean.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSelfLink } from './lib/ensure-self-link.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('ensure-self-link');
  process.exit(0);
}

try {
  const res = ensureSelfLink({ pkgRoot });
  const messages = {
    linked: `[self-link] created node_modules/ai-task-manager -> ${pkgRoot}`,
    present: '[self-link] node_modules/ai-task-manager already present',
    'not-dev-package': '[self-link] not a dev checkout — skipped',
    'real-entry-present': '[self-link] real node_modules/ai-task-manager present — left as-is',
  };
  console.error(messages[res.reason] ?? `[self-link] ${res.reason}`);
} catch (err) {
  console.warn(`[self-link] skipped: ${err.message}`);
}
