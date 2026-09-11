// @story #1579
// Plan-approval policy for repository-linked implementation plans. Historical
// plans are never scanned as a corpus; only the plan linked by the active issue
// body is inspected at its approval boundary.

import { readFileSync } from 'node:fs';

import { linkedPlanReference, resolvePlanPath } from './decomposition-policy.mjs';

const LINE_RULES = Object.freeze([
  Object.freeze({
    rule: 'governed-plan-raw-issue-body-write',
    pattern: /\bgh\s+issue\s+edit\b.*(?:--body-file(?:=|\s)|--body(?:=|\s))/i,
  }),
  Object.freeze({
    rule: 'governed-plan-internal-mutator-call',
    pattern: /\bmutateIssueBody\s*\(/,
  }),
  Object.freeze({
    rule: 'governed-plan-one-off-mutator',
    pattern: /\bnode\b[^\r\n]*\.(?:scratch|tmp)\/gh\/[^\s`'"]+\.mjs\b/i,
  }),
]);

const SCRATCH_DRIFT_RE = /\.tmp\/(?:gh|plan)\//gi;

function excerpt(line) {
  const value = String(line).trim();
  return value.length <= 240 ? value : `${value.slice(0, 237)}...`;
}

function violation(rule, line, source) {
  return Object.freeze({ rule, line, excerpt: excerpt(source) });
}

export function validateGovernedPlanContent(content = '') {
  const violations = [];
  for (const [index, line] of String(content).split(/\r?\n/).entries()) {
    for (const { rule, pattern } of LINE_RULES) {
      if (pattern.test(line)) violations.push(violation(rule, index + 1, line));
    }
    for (const _match of line.matchAll(SCRATCH_DRIFT_RE)) {
      violations.push(violation('governed-plan-scratch-drift', index + 1, line));
    }
  }
  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

export function validateGovernedLinkedPlan({ body = '', projectDir, deps = {} } = {}) {
  if (!projectDir) throw new TypeError('governed-plan-policy: projectDir is required');
  const findReference = deps.linkedPlanReference || linkedPlanReference;
  const reference = findReference(body);
  if (!reference) {
    return Object.freeze({ ok: true, status: 'not-applicable', violations: [] });
  }

  const resolve = deps.resolvePlanPath || resolvePlanPath;
  const resolved = resolve({ projectDir, body });
  if (!resolved?.path) {
    return Object.freeze({
      ok: false,
      status: 'invalid',
      planPath: reference.path,
      violations: Object.freeze([
        Object.freeze({
          rule: 'governed-plan-unreadable',
          line: null,
          excerpt: resolved?.diagnostic || 'linked plan path could not be resolved',
        }),
      ]),
    });
  }

  const readFile = deps.readFile || ((file) => readFileSync(file, 'utf8'));
  let content;
  try {
    content = readFile(resolved.path);
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 'invalid',
      planPath: reference.path,
      violations: Object.freeze([
        Object.freeze({
          rule: 'governed-plan-unreadable',
          line: null,
          excerpt: error?.message || String(error),
        }),
      ]),
    });
  }

  const result = validateGovernedPlanContent(content);
  return Object.freeze({
    ...result,
    status: result.ok ? 'valid' : 'invalid',
    planPath: reference.path,
  });
}

export function formatGovernedPlanPolicyRefusal(result = {}) {
  const planPath = result.planPath || 'linked-plan';
  return (result.violations || [])
    .map(({ rule, line, excerpt: detail }) => {
      const location = line == null ? planPath : `${planPath}:${line}`;
      return `  ${rule}: ${location}: ${detail}`;
    })
    .join('\n');
}
