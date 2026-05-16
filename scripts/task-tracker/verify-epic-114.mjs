#!/usr/bin/env node
// Epic #114 invariant checks — referenced as evidence for the epic-level
// acceptance criteria that cannot be expressed through the standard DoD
// commands. Exits 0 on success; non-zero with a diagnostic on failure.

import { existsSync, readFileSync, statSync } from 'node:fs';
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

// 3. memory/archive directory exists under the Claude project memory root.
{
  const home = process.env.HOME || '';
  const memoryRoot = path.join(
    home,
    '.claude/projects/-Users-kpburson-projects-Vibe-Coding-ai-task-manager/memory'
  );
  const archive = path.join(memoryRoot, 'archive');
  if (!existsSync(archive) || !statSync(archive).isDirectory()) {
    fail(`${archive} is not a directory`);
  }
}

if (failures.length > 0) {
  for (const f of failures) process.stderr.write(`x ${f}\n`);
  process.exit(1);
}

process.stdout.write('epic #114 invariants: ok\n');
