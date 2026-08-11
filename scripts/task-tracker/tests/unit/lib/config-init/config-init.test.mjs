#!/usr/bin/env node
// @story #560
// Characterizes the config-init logic extracted out of the
// scripts/gh/init-project-config.sh bash monolith into test-reachable node
// modules under scripts/task-tracker/lib/config-init/. Each block pins the
// observable behavior the bash previously produced (config merge semantics,
// idempotent template writes, the pure parser transforms) so the extraction is
// provably behavior-preserving.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildUpdates,
  mergeConfig,
  loadExisting,
  preflightConfig,
  serializeConfig,
  writeConfig,
} from '../../../../lib/config-init/config-authoring.mjs';
import {
  TASK_TEMPLATE,
  BUG_TEMPLATE,
  ISSUE_TEMPLATES,
  writeIssueTemplates,
} from '../../../../lib/config-init/issue-templates.mjs';
import {
  CANONICAL_STATUS_PALETTE,
  canonColor,
  projectNumberFromInput,
  normalizeProjectList,
  mergeProjectLists,
} from '../../../../lib/config-init/parsers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/../..';

// ── config authoring / merge ──────────────────────────────────────────────

const FULL_ENV = {
  REPO: 'owner/repo',
  PROJECT_NODE_ID: 'PVT_node',
  KANBAN_FIELD_ID: 'kanbanF',
  OPTION_BACKLOG: 'b',
  OPTION_ASSIGNED: 'as',
  OPTION_REFINE: 'r',
  OPTION_PLAN: 'pl',
  OPTION_DEVELOP: 'd',
  OPTION_TEST: 't',
  OPTION_REVIEW: 'rv',
  OPTION_DONE: 'dn',
  PRIORITY_FIELD_ID: 'prioF',
  OPTION_P0: 'p0',
  OPTION_P1: 'p1',
  OPTION_P2: 'p2',
  OPTION_P3: 'p3',
};

test('buildUpdates always writes the required field-id keys', () => {
  const u = buildUpdates(FULL_ENV);
  assert.equal(u.repo, 'owner/repo');
  assert.equal(u.projectId, 'PVT_node');
  assert.equal(u.kanbanFieldId, 'kanbanF');
  assert.equal(u.kanbanOptionBacklog, 'b');
  assert.equal(u.kanbanOptionAssigned, 'as');
  assert.equal(u.priorityOptionP3, 'p3');
});

test('buildUpdates writes an optional key only when its env value is non-empty', () => {
  const withSize = buildUpdates({ ...FULL_ENV, SIZE_FIELD_ID: 'sizeF' });
  assert.equal(withSize.sizeFieldId, 'sizeF');

  const withoutSize = buildUpdates({ ...FULL_ENV, SIZE_FIELD_ID: '' });
  assert.ok(!('sizeFieldId' in withoutSize), 'empty optional must NOT be written');
});

test('buildUpdates maps FIELD_RANK to both fieldRank and rankFieldId', () => {
  const u = buildUpdates({ ...FULL_ENV, FIELD_RANK: 'rankF' });
  assert.equal(u.fieldRank, 'rankF');
  assert.equal(u.rankFieldId, 'rankF');
});

test('buildUpdates merges a non-empty FIELD_IDS_JSON blob and tolerates garbage', () => {
  const good = buildUpdates({ ...FULL_ENV, FIELD_IDS_JSON: '{"a":"1","b":"2"}' });
  assert.deepEqual(good.fieldIds, { a: '1', b: '2' });

  const empty = buildUpdates({ ...FULL_ENV, FIELD_IDS_JSON: '{}' });
  assert.ok(!('fieldIds' in empty), 'an empty fieldIds object must not be written');

  const garbage = buildUpdates({ ...FULL_ENV, FIELD_IDS_JSON: 'not json' });
  assert.ok(!('fieldIds' in garbage), 'malformed FIELD_IDS_JSON must be ignored, not thrown');
});

test('mergeConfig preserves hand-set keys the bootstrap never touches', () => {
  const existing = { assignee: '@me', customField: 'keep-me', repo: 'stale/repo' };
  const merged = mergeConfig(existing, FULL_ENV);
  assert.equal(merged.assignee, '@me', 'unrelated keys survive');
  assert.equal(merged.customField, 'keep-me');
  assert.equal(merged.repo, 'owner/repo', 'required keys are overwritten');
});

test('mergeConfig rewrites the legacy On Deck option key to Assigned', () => {
  const merged = mergeConfig({ kanbanOptionOnDeck: 'legacy-id' }, FULL_ENV);
  assert.equal(merged.kanbanOptionAssigned, 'as');
  assert.ok(!('kanbanOptionOnDeck' in merged), 'legacy key must be removed on repair');
});

test('mergeConfig fails closed when legacy and canonical option ids conflict', () => {
  assert.throws(
    () =>
      mergeConfig(
        { kanbanOptionOnDeck: 'legacy-id', kanbanOptionAssigned: 'different-id' },
        FULL_ENV
      ),
    /conflicts.*refusing repair/i
  );
});

test('preflightConfig validates existing config without writing', () => {
  let writes = 0;
  assert.throws(
    () =>
      preflightConfig(
        { file: '/proj/.ai-task-manager/task-tracker.json' },
        {
          readFileSync: () =>
            JSON.stringify({
              kanbanOptionOnDeck: 'legacy-id',
              kanbanOptionAssigned: 'different-id',
            }),
          writeFileSync: () => {
            writes += 1;
          },
        }
      ),
    /conflicts.*refusing repair/i
  );
  assert.equal(writes, 0, 'preflight must never write config or project state');
});

test('loadExisting falls back to the legacy .claude/ path then to {}', () => {
  const reads = [];
  const newPath = '/proj/.ai-task-manager/task-tracker.json';
  // New path missing, legacy present.
  const legacyDeps = {
    readFileSync: (f) => {
      reads.push(f);
      if (f.includes('/.ai-task-manager/')) throw new Error('ENOENT');
      return '{"fromLegacy":true}';
    },
  };
  assert.deepEqual(loadExisting(newPath, legacyDeps), { fromLegacy: true });
  assert.ok(
    reads.some((f) => f.includes('/.claude/')),
    'legacy path was attempted'
  );

  // Neither present → {}.
  const noneDeps = {
    readFileSync: () => {
      throw new Error('ENOENT');
    },
  };
  assert.deepEqual(loadExisting(newPath, noneDeps), {});
});

test('serializeConfig matches the bash JSON.stringify(…,null,2)+newline shape', () => {
  const out = serializeConfig({ a: 1 });
  assert.equal(out, '{\n  "a": 1\n}\n');
  assert.ok(out.endsWith('\n'), 'must end with a trailing newline');
});

test('writeConfig loads → merges → writes and returns the merged object', () => {
  let written = null;
  const merged = writeConfig(
    { file: '/proj/.ai-task-manager/task-tracker.json', env: FULL_ENV },
    {
      readFileSync: () => '{"assignee":"@me"}',
      writeFileSync: (f, data) => {
        written = { f, data };
      },
    }
  );
  assert.equal(merged.assignee, '@me');
  assert.equal(merged.repo, 'owner/repo');
  assert.equal(written.f, '/proj/.ai-task-manager/task-tracker.json');
  assert.equal(written.data, serializeConfig(merged));
});

// ── issue templates ─────────────────────────────────────────────────────────

test('issue templates carry the AITM title prefixes and labels', () => {
  assert.ok(TASK_TEMPLATE.includes('title: "[Task] "'));
  assert.ok(TASK_TEMPLATE.includes('labels: []'));
  assert.ok(BUG_TEMPLATE.includes('title: "🐞 [BUG] "'));
  assert.ok(BUG_TEMPLATE.includes('labels: ["bug"]'));
  // Both forms keep the Acceptance Criteria field the workflow depends on.
  assert.ok(TASK_TEMPLATE.includes('id: acceptance-criteria'));
  assert.ok(BUG_TEMPLATE.includes('id: acceptance-criteria'));
});

test('writeIssueTemplates writes task.yml + bug.yml under .github/ISSUE_TEMPLATE', () => {
  const writes = [];
  const dirCalls = [];
  const written = writeIssueTemplates('/proj', {
    mkdirSync: (d, opts) => dirCalls.push({ d, opts }),
    writeFileSync: (f, data) => writes.push({ f, data }),
  });
  assert.equal(dirCalls.length, 1);
  assert.deepEqual(dirCalls[0].opts, { recursive: true });
  assert.ok(dirCalls[0].d.endsWith(path.join('.github', 'ISSUE_TEMPLATE')));
  assert.equal(writes.length, 2);
  assert.ok(writes[0].f.endsWith('task.yml'));
  assert.equal(writes[0].data, TASK_TEMPLATE);
  assert.ok(writes[1].f.endsWith('bug.yml'));
  assert.equal(writes[1].data, BUG_TEMPLATE);
  assert.equal(written.length, 2);
});

test('writeIssueTemplates is idempotent — same bytes on re-run', () => {
  const first = [];
  const second = [];
  writeIssueTemplates('/proj', { mkdirSync: () => {}, writeFileSync: (f, d) => first.push(d) });
  writeIssueTemplates('/proj', { mkdirSync: () => {}, writeFileSync: (f, d) => second.push(d) });
  assert.deepEqual(first, second);
  assert.deepEqual(
    ISSUE_TEMPLATES.map((t) => t.filename),
    ['task.yml', 'bug.yml']
  );
});

// ── pure parsers ─────────────────────────────────────────────────────────────

test('canonColor returns the palette color or empty for unknown', () => {
  assert.equal(canonColor('Backlog'), 'GRAY');
  assert.equal(canonColor('Done'), 'PURPLE');
  assert.equal(canonColor('Develop'), 'GREEN');
  assert.equal(canonColor('Nonexistent'), '');
  assert.equal(CANONICAL_STATUS_PALETTE.length, 8, 'eight canonical board states');
});

test('projectNumberFromInput parses all three input shapes (and rejects junk)', () => {
  assert.equal(projectNumberFromInput('https://github.com/users/alice/projects/7'), 'alice:7');
  assert.equal(projectNumberFromInput('https://github.com/orgs/acme/projects/12'), 'acme:12');
  assert.equal(projectNumberFromInput('alice/7'), 'alice:7');
  assert.equal(projectNumberFromInput('alice:7'), 'alice:7');
  assert.equal(projectNumberFromInput('42', 'bob'), 'bob:42');
  assert.equal(projectNumberFromInput('not-a-project'), '');
  assert.equal(projectNumberFromInput(''), '');
  assert.equal(projectNumberFromInput(null), '');
});

test('normalizeProjectList handles array, repo-nodes, and user/org-nodes shapes', () => {
  // Direct array shape.
  assert.deepEqual(normalizeProjectList([{ id: 'a', title: 'A', number: 1 }], true), [
    { id: 'a', title: 'A', number: 1, linked: true },
  ]);
  // repository.projectsV2.nodes shape.
  const repoPayload = {
    data: { repository: { projectsV2: { nodes: [{ id: 'b', title: 'B', number: 2 }] } } },
  };
  assert.deepEqual(normalizeProjectList(repoPayload, false), [
    { id: 'b', title: 'B', number: 2, linked: false },
  ]);
  // user + organization fallback shape (concatenated).
  const userOrgPayload = {
    data: {
      user: { projectsV2: { nodes: [{ id: 'c', title: 'C', number: 3 }] } },
      organization: { projectsV2: { nodes: [{ id: 'd', title: 'D', number: 4 }] } },
    },
  };
  assert.deepEqual(normalizeProjectList(userOrgPayload, true), [
    { id: 'c', title: 'C', number: 3, linked: true },
    { id: 'd', title: 'D', number: 4, linked: true },
  ]);
  // Nodes missing id/title/number are dropped.
  assert.deepEqual(normalizeProjectList([{ id: 'x', number: 9 }], true), []);
});

test('mergeProjectLists dedups by id (linked OR) and sorts linked-first then number', () => {
  const linked = [{ id: 'a', title: 'A', number: 5, linked: true }];
  const owner = [
    { id: 'a', title: 'A', number: 5, linked: false }, // dup → stays linked
    { id: 'b', title: 'B', number: 2, linked: false },
    { id: 'c', title: 'C', number: 9, linked: false },
  ];
  const merged = mergeProjectLists(linked, owner);
  assert.equal(merged.length, 3, 'dedup collapses the shared id');
  assert.equal(merged[0].id, 'a', 'linked sorts first');
  assert.equal(merged[0].linked, true, 'linked flag is OR-ed across duplicates');
  // Remaining (non-linked) sorted by ascending number: b(2) before c(9).
  assert.deepEqual(
    merged.slice(1).map((p) => p.id),
    ['b', 'c']
  );
});

// ── extraction guard: the bash shim must delegate, not re-implement ──────────

test('init-project-config.sh delegates config + template writes to config-init.mjs', () => {
  const sh = readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'gh', 'init-project-config.sh'),
    'utf8'
  );
  // The shim points CONFIG_INIT_CLI at config-init.mjs and drives it by subcommand.
  assert.ok(
    /CONFIG_INIT_CLI=.*config-init\.mjs/.test(sh),
    'CONFIG_INIT_CLI must resolve to config-init.mjs'
  );
  assert.ok(
    /"\$CONFIG_INIT_CLI"\s+write-config/.test(sh),
    'config write must delegate to config-init.mjs write-config'
  );
  assert.ok(
    /"\$CONFIG_INIT_CLI"\s+write-templates/.test(sh),
    'template write must delegate to config-init.mjs write-templates'
  );
  // The dismantled inline node -e config merge must be gone.
  assert.ok(
    !/Only write IDs when we got them/.test(sh),
    'the inline node -e config-merge block must be removed from the bash'
  );
  // The template heredocs must no longer be inlined in the bash.
  assert.ok(
    !/cat > "\$TEMPLATE_DIR\/task\.yml"/.test(sh),
    'the task.yml heredoc must be removed from the bash'
  );
});
