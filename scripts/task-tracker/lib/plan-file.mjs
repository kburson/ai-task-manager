// plan-file.mjs — read/write utilities for discovery plan files (#414).
//
// Plan files live at docs/plans/YYYYMMDD-<slug>.md. They are the persistent
// artifact of a /task discover session and feed /task new when the caller is
// not in discover state (or when /task new auto-promotes from discover).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PLAN_FILE_TEMPLATE = `# <title>

## Scope
<what is being built and why; what is out of scope>

## Context
<background, constraints, key decisions made during discovery>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Plan Metadata
- Priority: <P0|P1|P2|P3>
- Size: <XS|S|M|L|XL>
- Estimate: <N hours>
- Labels: <label1>, <label2>
`;

export function planDatePrefix(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function titleToSlug(title) {
  return (
    String(title || 'plan')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'plan'
  );
}

export function planFileName(title, now = new Date()) {
  return `${planDatePrefix(now)}-${titleToSlug(title)}.md`;
}

// Extract the H1 title from a plan file body. Returns null when absent.
export function extractTitle(content) {
  const m = String(content || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// Validate plan file content: requires at minimum an H1 title and ## Scope.
// Returns { ok: true } or { ok: false, reason: string }.
export function validatePlanContent(content) {
  const str = String(content || '');
  if (!extractTitle(str)) {
    return { ok: false, reason: 'plan file must begin with an H1 title line: `# <title>`' };
  }
  if (!/^## Scope\s*$/m.test(str)) {
    return { ok: false, reason: 'plan file must contain a `## Scope` section' };
  }
  return { ok: true };
}

// Save content to docs/plans/YYYYMMDD-slug.md. Creates the directory if needed.
// Handles filename collisions by appending -2, -3, etc.
// Returns the absolute path of the written file.
export function savePlanFile({ title, content, projectDir, now = new Date() }) {
  const plansDir = path.join(projectDir, 'docs', 'plans');
  mkdirSync(plansDir, { recursive: true });

  const base = planFileName(title, now);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);

  let candidate = path.join(plansDir, base);
  let suffix = 2;
  while (existsSync(candidate)) {
    candidate = path.join(plansDir, `${stem}-${suffix}${ext}`);
    suffix += 1;
  }

  writeFileSync(candidate, content, 'utf8');
  return candidate;
}

// Load and parse a plan file. Returns { title, content }.
// Throws when the file does not exist.
export function loadPlanFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const title = extractTitle(content) || path.basename(filePath, '.md');
  return { title, content };
}
