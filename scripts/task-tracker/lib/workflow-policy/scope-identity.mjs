import { createHash } from 'node:crypto';

const INCLUDED_SECTIONS = Object.freeze(['User Story', 'Scope', 'Acceptance Criteria']);

function rootSection(body, heading) {
  const lines = String(body || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function canonicalSection(value) {
  return String(value)
    .replace(/^-\s+\[[xX ]\]/gm, '- [ ]')
    .replace(/<!--\s*aitm-(?:execution-proof|dod-evidence|ac-evidence)[\s\S]*?-->/gi, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function scopeProjection({ repository, issue, body } = {}) {
  const normalizedRepository = String(repository || '')
    .trim()
    .toLowerCase();
  const normalizedIssue = Number(issue);
  if (!/^[^/\s]+\/[^/\s]+$/.test(normalizedRepository)) {
    throw new TypeError('workflow-policy:scope-repository');
  }
  if (!Number.isSafeInteger(normalizedIssue) || normalizedIssue <= 0) {
    throw new TypeError('workflow-policy:scope-issue');
  }
  const sections = Object.fromEntries(
    INCLUDED_SECTIONS.map((heading) => [heading, canonicalSection(rootSection(body, heading))])
  );
  if (Object.values(sections).some((section) => !section)) {
    throw new TypeError('workflow-policy:scope-sections');
  }
  return Object.freeze({ repository: normalizedRepository, issue: normalizedIssue, sections });
}

export function computeScopeIdentity(input) {
  const projection = scopeProjection(input);
  const digest = createHash('sha256').update(JSON.stringify(projection)).digest('hex');
  return `sha256:${digest}`;
}
