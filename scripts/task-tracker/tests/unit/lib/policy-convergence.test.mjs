// @story #1012 #1025 #1026
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditPolicyAuthorities,
  POLICY_AUTHORITY_CATEGORIES,
} from '../../../lib/policy-authority-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const PRODUCTION_ROOTS = ['bin', 'scripts'];
const REMOVED_FACADES = [
  'scripts/task-tracker/state-machine.mjs',
  'scripts/task-tracker/lib/timing-event-map.mjs',
  'scripts/task-tracker/command-manifest.mjs',
];

function walk(relativeDir) {
  return readdirSync(path.join(ROOT, relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    return entry.isDirectory() ? walk(relativePath) : [relativePath];
  });
}

function productionModules() {
  return PRODUCTION_ROOTS.flatMap(walk)
    .filter((file) => /\.(?:mjs|js)$/.test(file))
    .filter((file) => !file.includes('/tests/') && !file.endsWith('.test.mjs'));
}

function importSpecifiers(file) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  return [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('scheduled compatibility facades are deleted after a zero-consumer migration', () => {
  const modules = PRODUCTION_ROOTS.flatMap(walk).filter((file) => /\.(?:mjs|js)$/.test(file));
  for (const facade of REMOVED_FACADES) {
    assert.equal(existsSync(path.join(ROOT, facade)), false, `${facade} still exists`);
    const basename = path.posix.basename(facade);
    const consumers = modules.filter((file) =>
      importSpecifiers(file).some((specifier) => specifier.endsWith(`/${basename}`))
    );
    assert.deepEqual(consumers, [], `${facade} consumers`);
  }
});

test('approved policy packages are the sole production authority owners', () => {
  const sources = Object.fromEntries(
    productionModules().map((file) => [file, readFileSync(path.join(ROOT, file), 'utf8')])
  );
  assert.deepEqual(auditPolicyAuthorities(sources), []);
});

test('every authority detector rejects a representative duplicate fixture', () => {
  const fixtures = {
    'fixtures/duplicate-states.mjs': `
      const COMPLETE_STATES = [
        'backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review', 'done'
      ];
    `,
    'fixtures/duplicate-edges.mjs': `
      const BACKWARD_CHAIN = {
        test: ['develop'],
        review: ['develop', 'test', 'plan'],
        done: ['plan'],
      };
    `,
    'fixtures/duplicate-actions.mjs': `
      const ACTION_POLICIES = {
        test: { allowedStates: ['develop', 'test', 'review'] },
        close: { allowedStates: ['review'] },
      };
    `,
    'fixtures/duplicate-events.mjs': `
      const TIMING_EVENT_CATALOG = [
        { event: 'develop:started', phase: 'enter' },
        { event: 'test:passed', phase: 'complete' },
      ];
    `,
    'fixtures/duplicate-cli.mjs': `
      const COMMAND_ROUTES = [
        { verb: 'start', dispatch: 'verbs/start.mjs' },
        { verb: 'review', dispatch: 'verbs/review.mjs' },
      ];
    `,
  };

  const findings = auditPolicyAuthorities(fixtures);
  assert.deepEqual(
    findings.map(({ category, file }) => ({ category, file })),
    [
      { category: 'state-identity', file: 'fixtures/duplicate-states.mjs' },
      { category: 'directional-edges', file: 'fixtures/duplicate-edges.mjs' },
      { category: 'action-eligibility', file: 'fixtures/duplicate-actions.mjs' },
      { category: 'timing-events', file: 'fixtures/duplicate-events.mjs' },
      { category: 'cli-metadata', file: 'fixtures/duplicate-cli.mjs' },
    ]
  );
  assert.deepEqual(
    findings.map(({ category }) => category),
    POLICY_AUTHORITY_CATEGORIES
  );
});

test('alternate keyed, catalog, and lowercase representations cannot evade the audit', () => {
  const fixtures = {
    'fixtures/lowercase-keyed-states.mjs': `
      const states = {
        backlog: true,
        'ready-for-plan': true,
        refine: true,
        plan: true,
        develop: true,
        test: true,
        review: true,
        done: true,
      };
    `,
    'fixtures/lowercase-keyed-edges.mjs': `
      const edges = {
        test: ['develop'],
        review: ['develop', 'test'],
      };
    `,
    'fixtures/lowercase-action-home.mjs': `
      const verbHomeState = {
        promote: ['backlog', 'refine', 'plan'],
        demote: ['test', 'review'],
        close: 'review',
      };
    `,
    'fixtures/lowercase-event-catalog.mjs': `
      const timingEvents = ['paused', 'resume', 'start', 'stop'];
    `,
    'fixtures/lowercase-command-dispatch.mjs': `
      const commands = {
        start: 'verbs/start.mjs',
        review: 'verbs/review.mjs',
      };
    `,
  };

  assert.deepEqual(
    auditPolicyAuthorities(fixtures).map(({ category, file }) => ({ category, file })),
    [
      { category: 'state-identity', file: 'fixtures/lowercase-keyed-states.mjs' },
      { category: 'directional-edges', file: 'fixtures/lowercase-keyed-edges.mjs' },
      { category: 'action-eligibility', file: 'fixtures/lowercase-action-home.mjs' },
      { category: 'timing-events', file: 'fixtures/lowercase-event-catalog.mjs' },
      { category: 'cli-metadata', file: 'fixtures/lowercase-command-dispatch.mjs' },
    ]
  );
});

test('regex declarations are non-data and do not hide following authorities', () => {
  const fixtures = {
    'fixtures/regex-only.mjs': `
      const statePattern =
        /'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/;
      const commandPattern =
        /{verb:'start',dispatch:'inline'},{verb:'review',dispatch:'inline'}/;
    `,
    'fixtures/block-comment-regex.mjs': `
      const statePattern = /* legacy state matcher */
        /'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/;
    `,
    'fixtures/line-comment-regex.mjs': `
      const statePattern = // legacy state matcher
        /'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/;
    `,
    'fixtures/grouped-regex.mjs': `
      const statePattern =
        (((/'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/)));
    `,
    'fixtures/nested-regexes.mjs': `
      const patterns = [
        /'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/,
        { cli: /{verb:'start',dispatch:'inline'},{verb:'review',dispatch:'inline'}/ },
        enabled ? /'develop','test','review'/ : /'backlog', 'refine', 'ready-for-plan'/,
      ];
    `,
    'fixtures/comment-only.mjs': `
      const values = [
        /* 'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done' */
        // {verb:'start',dispatch:'inline'},{verb:'review',dispatch:'inline'}
      ];
    `,
    'fixtures/template-example-only.mjs': `
      const documentation =
        \`'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'\`;
    `,
    'fixtures/template-states.mjs': `
      const states = [
        \`backlog\`, \`refine\`, \`ready-for-plan\`, \`plan\`,
        \`develop\`, \`test\`, \`review\`, \`done\`,
      ];
    `,
    'fixtures/interpolated-template-then-data.mjs': `
      const documentation =
        \`'backlog', 'refine', 'ready-for-plan','plan',\${suffix},'develop','test','review','done'\`;
      const commands = {
        start: 'verbs/start.mjs',
        review: 'verbs/review.mjs',
      };
    `,
    'fixtures/nested-template-then-data.mjs': [
      "const documentation = `example ${`'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'`}`;",
      "const commands = { start: 'verbs/start.mjs', review: 'verbs/review.mjs' };",
    ].join('\n'),
    'fixtures/real-state-keys-around-regex.mjs': `
      const patterns = {
        backlog: /backlog/,
        'ready-for-plan': /ready-for-plan/,
        refine: /refine/,
        plan: /plan/,
        develop: /develop/,
        test: /test/,
        review: /review/,
        done: /done/,
      };
    `,
    'fixtures/division-before-real-states.mjs': `
      const states = [
        total / count,
        'backlog', 'refine', 'ready-for-plan', 'plan', 'develop', 'test', 'review', 'done',
      ];
    `,
    'fixtures/regex-then-data.mjs': `
      const ignoredPattern = /* non-data */
        ((/'backlog', 'refine', 'ready-for-plan','plan','develop','test','review','done'/));
      const commands = {
        start: 'verbs/start.mjs',
        review: 'verbs/review.mjs',
      };
    `,
  };

  assert.deepEqual(
    auditPolicyAuthorities(fixtures).map(({ category, file, declaration }) => ({
      category,
      file,
      declaration,
    })),
    [
      {
        category: 'state-identity',
        file: 'fixtures/template-states.mjs',
        declaration: 'states',
      },
      {
        category: 'state-identity',
        file: 'fixtures/real-state-keys-around-regex.mjs',
        declaration: 'patterns',
      },
      {
        category: 'state-identity',
        file: 'fixtures/division-before-real-states.mjs',
        declaration: 'states',
      },
      {
        category: 'cli-metadata',
        file: 'fixtures/interpolated-template-then-data.mjs',
        declaration: 'commands',
      },
      {
        category: 'cli-metadata',
        file: 'fixtures/nested-template-then-data.mjs',
        declaration: 'commands',
      },
      {
        category: 'cli-metadata',
        file: 'fixtures/regex-then-data.mjs',
        declaration: 'commands',
      },
    ]
  );
});

test('the convergence report records every C1 disposition and the #1006 handoff', () => {
  const reportPath = path.join(
    ROOT,
    'docs/superpowers/specs/2026-07-28-state-engine-policy-convergence.md'
  );
  assert.equal(existsSync(reportPath), true);
  const report = readFileSync(reportPath, 'utf8');
  for (const heading of [
    'Final Authority Owners',
    'Consumer Migration',
    'Zero-Consumer Facade Scan',
    'Allowed Subset Policies',
    '#1006 Audit Inputs',
  ]) {
    assert.match(report, new RegExp(`## ${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
  }

  const register = readFileSync(
    path.join(ROOT, 'docs/superpowers/specs/2026-07-27-state-engine-bug-bash-evidence.md'),
    'utf8'
  );
  const rows = [...register.matchAll(/^\| #(\d+)\s+\| `([^`]+)`\s+\| ([^|]+)\| ([^|]+)\|$/gm)];
  assert.ok(rows.length > 0, 'expected C1 disposition rows');
  for (const [, issue, disposition, target, owner] of rows) {
    assert.ok(disposition.trim(), `#${issue} disposition`);
    assert.ok(target.trim(), `#${issue} target`);
    assert.ok(owner.trim(), `#${issue} owner`);
  }
  assert.match(report, /2026-07-27-state-engine-bug-bash-evidence\.md/);
});
