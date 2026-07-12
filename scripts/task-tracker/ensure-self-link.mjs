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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSelfLink } from './lib/ensure-self-link.mjs';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  const res = ensureSelfLink({ pkgRoot });
  const messages = {
    linked: `[self-link] created node_modules/ai-task-manager -> ${pkgRoot}`,
    present: '[self-link] node_modules/ai-task-manager already present',
    'not-dev-package': '[self-link] not a dev checkout — skipped',
    'real-entry-present': '[self-link] real node_modules/ai-task-manager present — left as-is',
  };
  console.log(messages[res.reason] ?? `[self-link] ${res.reason}`);
} catch (err) {
  console.warn(`[self-link] skipped: ${err.message}`);
}
