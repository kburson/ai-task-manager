#!/usr/bin/env node
// Epic #114 invariant checks — referenced as evidence for the epic-level
// acceptance criteria that cannot be expressed through the standard DoD
// commands. Exits 0 on success; non-zero with a diagnostic on failure.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const failures = [];

function fail(msg) {
  failures.push(msg);
}

// 1. Cross-adapter parity: both adapter SKILL.md files point at the same
//    shared router, and neither carries a verb-contract fork.
{
  const claude = readFileSync(path.join(repoRoot, 'skill/adapters/claude/SKILL.md'), 'utf8');
  const codex = readFileSync(path.join(repoRoot, 'skill/adapters/codex/SKILL.md'), 'utf8');
  for (const [name, text] of [
    ['claude', claude],
    ['codex', codex],
  ]) {
    if (!text.includes('shared/router.md')) {
      fail(`${name} adapter does not reference shared/router.md`);
    }
  }
}

// 2. docs/DESIGN.md contains the "Skill loading model" section.
{
  const designPath = path.join(repoRoot, 'docs/DESIGN.md');
  if (!existsSync(designPath)) {
    fail('docs/DESIGN.md missing');
  } else {
    const design = readFileSync(designPath, 'utf8');
    if (!/^##\s+Skill loading model\b/m.test(design)) {
      fail('docs/DESIGN.md missing "## Skill loading model" section');
    }
  }
}

// NOTE: a former check #3 asserted a machine-specific `$HOME/.claude/.../memory/
// archive` path — the maintainer's personal Claude auto-memory dir. It could
// never hold on CI or any other checkout and was not a repo invariant. Dropped
// in #743. The canonical, repo-relative integrity check for `docs/ai-memory/`
// is `scripts/inspect/ai-memory-parity.mjs --mode index` (CI wiring: #744).

if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`x ${f}\n`);
  process.exit(1);
}

process.stdout.write('epic #114 invariants: ok\n');
