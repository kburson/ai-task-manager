// Helpers for stamping the <!-- aitm-skill-version: X.Y.Z --> marker into
// frequently-loaded skill detail files at install time. See issue #85.
//
// Detail files affected (`pkgRelPath` is relative to the package root):
//   - skill/adapters/claude/SKILL.md    (id: adapter)
//   - skill/shared/SKILL.md             (id: shared)
//   - templates/pickup-directive.md     (id: pickup)
//
// The shim instructs the agent to read just the marker, grep its context for
// `aitm-skill-loaded:<id>:<version>`, and skip a full re-read when the
// sentinel is already present. See `claudeStub()` in `bin/cli.mjs`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProvider } from '../../scripts/providers/index.mjs';

export const SKILL_DETAIL_FILES = [
  { id: 'adapter', pkgRelPath: getProvider('claude').skillAdapterPath },
  { id: 'codex-adapter', pkgRelPath: getProvider('codex').skillAdapterPath },
  { id: 'shared', pkgRelPath: 'skill/shared/SKILL.md' },
  { id: 'pickup', pkgRelPath: 'templates/pickup-directive.md' },
];

const MARKER_RE = /^<!-- aitm-skill-version:[^\n]*-->\n/m;

export function stampSkillVersion(absPath, version) {
  if (!existsSync(absPath)) return { changed: false, reason: 'missing' };
  const src = readFileSync(absPath, 'utf8');
  const marker = `<!-- aitm-skill-version: ${version} -->\n`;

  let next;
  if (MARKER_RE.test(src)) {
    next = src.replace(MARKER_RE, marker);
  } else {
    const fm = src.match(/^---\n[\s\S]*?\n---\n/);
    if (fm) {
      next = src.slice(0, fm[0].length) + '\n' + marker + src.slice(fm[0].length);
    } else {
      next = marker + '\n' + src;
    }
  }

  if (next === src) return { changed: false, reason: 'unchanged' };
  writeFileSync(absPath, next, 'utf8');
  return { changed: true, reason: 'stamped' };
}

// In a development checkout, `node_modules/ai-task-manager` is a symlink back
// to the source repo (`PKG_ROOT` resolves to the repo root). Stamping would
// rewrite git-tracked source files on every `npm install`. Detect via the
// presence of a `.git` directory at the package root and skip in that case.
// The `AITM_FORCE_STAMP=1` env var overrides for tests/CI.
export function isDevPackage(pkgRoot) {
  if (process.env.AITM_FORCE_STAMP === '1') return false;
  return existsSync(join(pkgRoot, '.git'));
}

export function stampAllSkillVersions({ pkgRoot, version, logger = () => {} }) {
  if (isDevPackage(pkgRoot)) {
    logger({ kind: 'skipped', reason: 'dev-package' });
    return { skipped: true, results: [] };
  }
  const results = [];
  for (const f of SKILL_DETAIL_FILES) {
    const abs = join(pkgRoot, f.pkgRelPath);
    const r = stampSkillVersion(abs, version);
    results.push({ id: f.id, pkgRelPath: f.pkgRelPath, ...r });
    logger({
      kind: 'stamped',
      id: f.id,
      pkgRelPath: f.pkgRelPath,
      changed: r.changed,
      reason: r.reason,
    });
  }
  return { skipped: false, results };
}
