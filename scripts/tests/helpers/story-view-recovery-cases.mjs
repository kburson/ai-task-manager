// @story #2049
// Original-finding residual cases; registered only by the exact views root.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { test, fixture, identity, context } from './story-timing-candidate-fixture.mjs';
import { fixture as bodyFixture } from '../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import * as views from '../../task-tracker/lib/story-cache/views.mjs';
import { canonicalRecordJson as json } from '../../task-tracker/lib/github-records/canonical-json.mjs';
const hash = (v) => createHash('sha256').update(v).digest('hex');
function copy(record) {
  return {
    manifest: structuredClone(record.manifest),
    generation: structuredClone(record.generation),
    payloads: new Map(record.payloads),
  };
}
function rewrite(record, key, raw, reference) {
  const ref = record.generation.working[key];
  ref.capabilityRef = reference;
  ref.digest = hash(raw);
  record.payloads.set(ref.payloadPath, raw);
  const payload = json(record.generation);
  record.manifest.payloadDigest = hash(payload);
  record.payloads.set(record.manifest.payloadPath, payload);
}
function nativeReadinessDeps(readStoryGeneration) {
  return {
    readIssueBody: async () => bodyFixture().body,
    readStoryGeneration,
    fetchAssignmentSnapshot: async () => ({ state: 'develop', assignees: ['tester'] }),
    readCurrentUser: async () => 'tester',
    readWorktreeIdentity: () => ({ worktreePath: '/controlled' }),
    resolveProjectDir: () => '/controlled',
    readOccupancy: () => ({}),
    findMainWorktreePath: () => '/controlled',
    currentSessionId: () => 'controlled',
    loadMigrationJournal: () => null,
    decomposition: {
      subject: {
        repository: 'owner/repo',
        issue: 2057,
        projectId: 'P_test',
        projectItemId: 'PI_test',
      },
      runtime: {
        collect: async () => {
          throw new Error('controlled read unavailable');
        },
      },
    },
  };
}
export function registerStoryViewRecoveryCases() {
  test('missing optional cache does not require a Git remote or registry inspection', async (t) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { spawnSync } = await import('node:child_process');
    fs.mkdirSync(path.join(t.unitRoot, '.git'));
    const args = {
      projectRoot: t.unitRoot,
      repository: 'owner/repo',
      issue: 2057,
      projectId: 'P_test',
    };
    const moduleUrl = new URL('../../task-tracker/lib/story-cache/views.mjs', import.meta.url).href;
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          'import {readLocalStoryView} from ' +
            JSON.stringify(moduleUrl) +
            ';console.log(JSON.stringify(readLocalStoryView(' +
            JSON.stringify(args) +
            ')))',
        ],
        { encoding: 'utf8' }
      );
    const missing = run();
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout.trim(), 'null');
    assert.equal(fs.existsSync(path.join(t.unitRoot, '.tmp', 'gh')), false);
    fs.mkdirSync(path.join(t.unitRoot, '.tmp', 'gh'), { recursive: true });
    assert.notEqual(run().status, 0);
  });
  for (const kind of [
    'tmp-file',
    'tmp-dangling',
    'tmp-symlink',
    'cache-dangling',
    'cache-file',
    'unreadable',
  ])
    test('optional cache discovery refuses unavailable path: ' + kind, async (t) => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { spawnSync } = await import('node:child_process');
      const tmp = path.join(t.unitRoot, '.tmp');
      const cache = path.join(tmp, 'gh');
      if (kind === 'tmp-file') fs.writeFileSync(tmp, 'not a directory');
      else if (kind === 'tmp-dangling') fs.symlinkSync(path.join(t.unitRoot, 'absent'), tmp);
      else if (kind === 'tmp-symlink') {
        const target = path.join(t.unitRoot, 'other');
        fs.mkdirSync(target);
        fs.symlinkSync(target, tmp);
      } else {
        fs.mkdirSync(tmp);
        if (kind === 'cache-dangling') fs.symlinkSync(path.join(t.unitRoot, 'absent'), cache);
        else if (kind === 'cache-file') fs.writeFileSync(cache, 'not a directory');
      }
      const moduleUrl = new URL('../../task-tracker/lib/story-cache/views.mjs', import.meta.url)
        .href;
      const args = {
        projectRoot: t.unitRoot,
        repository: 'owner/repo',
        issue: 2057,
        projectId: 'P_test',
      };
      const fault =
        kind === 'unreadable'
          ? 'import fs from "node:fs";const original=fs.lstatSync;fs.lstatSync=(p,...args)=>{if(p===' +
            JSON.stringify(cache) +
            '){const e=new Error("denied");e.code="EACCES";throw e;}return original(p,...args)};'
          : '';
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          fault +
            'import {readLocalStoryView} from ' +
            JSON.stringify(moduleUrl) +
            ';console.log(JSON.stringify(readLocalStoryView(' +
            JSON.stringify(args) +
            ')))',
        ],
        { encoding: 'utf8' }
      );
      assert.notEqual(result.status, 0, result.stdout);
    });
  for (const variant of [
    'missing-marker',
    'different-mode',
    'forecast-mismatch',
    'forecast-ambiguous',
    'duplicate-approval',
  ])
    test('working v2 must match its native stored marker bytes: ' + variant, async (t) => {
      const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
      const { readCandidatePlanApprovalMarker, removeCandidatePlanApprovalMarker } =
        await import('../../task-tracker/lib/plan-approved-guard.mjs');
      const f = await nativePlanFixture(t, { mode: 'human' });
      const record = copy(await f.store.readGeneration());
      const key = 'issue:I_test';
      const ref = record.generation.working[key];
      const value = JSON.parse(String(record.payloads.get(ref.payloadPath)));
      const marker = readCandidatePlanApprovalMarker(value.body);
      if (variant === 'missing-marker') value.body = removeCandidatePlanApprovalMarker(value.body);
      else if (variant === 'different-mode')
        value.body = value.body.replace(marker, marker.replace('mode="human"', 'mode="full-auto"'));
      else if (variant === 'duplicate-approval') value.body += '\n' + marker;
      else {
        value.body +=
          '\n<!-- aitm-estimation-forecast-ready record-id="01J00000000000000000000001" -->';
        if (variant === 'forecast-ambiguous')
          value.body +=
            '\n<!-- aitm-estimation-forecast-ready record-id="01J00000000000000000000002" -->';
      }
      rewrite(record, key, json(value), ref.capabilityRef);
      assert.throws(() => views.storyView({ generation: record, authority: 'working' }));
    });
  const validItem = { id: 'PI_test', project: { id: 'P_test' } };
  for (const [name, nodes] of [
    ['null-row', [null]],
    ['empty-item', [{ id: '', project: { id: 'P_test' } }]],
    ['unknown-project', [validItem, { id: 'hidden', project: null }]],
    ['invalid-project', [validItem, { id: 'hidden', project: { id: '' } }]],
  ])
    test('optional incomplete membership preserves the actual target body: ' + name, async () => {
      let reads = 0;
      const observed = await views.readPublishedStoryObservation({
        repository: 'owner/repo',
        issue: 2057,
        projectId: 'P_test',
        transport: async () => {
          reads++;
          return {
            repository: {
              issue: {
                id: 'I_test',
                number: 2057,
                repository: { nameWithOwner: 'owner/repo' },
                body: 'fresh valid target body',
                projectItems: { nodes, pageInfo: { hasNextPage: false } },
              },
            },
          };
        },
      });
      assert.equal(observed.body, 'fresh valid target body');
      assert.equal(observed.identity, null);
      assert.equal(reads, 1);
    });
  test('actual completion body reader retains published entry when optional membership is malformed', async (t) => {
    const { completedTimingAuthority } = await import('./story-timing-authority-fixture.mjs');
    const { defaultProbeCompletion } =
      await import('../../task-tracker/lib/move-state/move-state-core.mjs');
    const f = await completedTimingAuthority(t);
    const r = f.generation;
    const body = String(
      r.payloads.get(r.generation.baseSnapshot.resources['issue:I_test'].payloadPath)
    );
    let reads = 0;
    const result = await defaultProbeCompletion({
      issueArg: '2057',
      stateArg: 'develop',
      cfg: { repo: 'owner/repo', projectId: 'P_test' },
      SKIP_NETWORK: false,
      resolveLiveStateName: async () => 'develop',
      _fetchTimingBody: async () => '',
      _publishedStoryTransport: async () => {
        reads++;
        return {
          repository: {
            issue: {
              id: 'I_test',
              number: 2057,
              repository: { nameWithOwner: 'owner/repo' },
              body,
              projectItems: { nodes: [null], pageInfo: { hasNextPage: false } },
            },
          },
        };
      },
    });
    assert.equal(reads, 1);
    assert.equal(result.sentinelState, 'develop');
    assert.equal(result.entryMarkerPresent, true);
    assert.equal(result.exitRowPresent, false);
  });

  test('independent requested facts cannot be overwritten by a complete retained identity', async (t) => {
    const f = await fixture(t);
    const generation = await f.store.readGeneration();
    assert.throws(
      () =>
        views.storyViewDiagnostic({
          generation,
          identity,
          repository: 'different/repo',
          issue: 700,
          host: 'else.example',
          projectId: 'OTHER',
        }),
      new RegExp('identity')
    );
    assert.throws(
      () =>
        views.readLocalStoryView({
          projectRoot: f.root,
          repository: 'owner/repo',
          issue: 2057,
          projectId: 'OTHER',
        }),
      new RegExp('identity')
    );
  });
  for (const actionId of ['promote', 'deliver'])
    test(
      'real Explain does not disclose a retained subject over contradictory ' +
        actionId +
        ' config',
      async (t) => {
        const { evaluateExplanation } = await import('../../task-tracker/verbs/explain.mjs');
        const f = await fixture(t);
        const record = await f.store.readGeneration();
        const other = actionId === 'promote';
        const result = await evaluateExplanation({
          issue: other ? 700 : 2057,
          actionId,
          projectRoot: f.root,
          storyIdentity: identity,
          readStoryGeneration: async () => record,
          deliveryDeps: {},
          deps: {
            loadConfig: () => ({
              repo: other ? 'different/repo' : 'owner/repo',
              projectId: 'OTHER',
            }),
            loadSessionState: () => ({}),
            readIssueObservation: async () => {
              throw new Error('unavailable');
            },
          },
        });
        assert.notEqual(result.decision.status, 'ready');
        assert.equal(result.diagnosticMessages[0].text, 'story-view:local-observation-unavailable');
      }
    );
  test('fresh target observation rejects a different returned repository in one request', async () => {
    let calls = 0;
    await assert.rejects(
      views.readPublishedStoryObservation({
        repository: 'wanted/repo',
        issue: 3,
        projectId: 'P',
        transport: async () => {
          calls++;
          return {
            repository: {
              issue: {
                id: 'I',
                number: 3,
                body: 'other body',
                repository: { nameWithOwner: 'actual/repo' },
                projectItems: {
                  nodes: [{ id: 'ITEM', project: { id: 'P' } }],
                  pageInfo: { hasNextPage: false },
                },
              },
            },
          };
        },
      }),
      new RegExp('published-identity')
    );
    assert.equal(calls, 1);
  });
  test('actual Test readiness compares exact published bytes without CLI newline drift', async (t) => {
    const { evaluateTestReadiness } =
      await import('../../task-tracker/lib/action-decision/test.mjs');
    const { ghClient } = await import('../../gh/lib/gh-client.mjs');
    const previousExec = ghClient.pexec;
    const previousSpawn = ghClient.spawn;
    const body =
      '<!-- aitm-last-known-state state="develop" ts="2026-11-02T07:51:05Z" -->\n' +
      bodyFixture().body;
    let reads = 0;
    ghClient.pexec = async (_command, args) => {
      if (args?.[0] !== 'issue' || args?.[1] !== 'view')
        throw new Error('controlled downstream read unavailable');
      return { stdout: body + '\n' };
    };
    ghClient.spawn = () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      let input = '';
      child.stdin.on('data', (chunk) => {
        input += chunk;
      });
      child.stdin.on('finish', () =>
        queueMicrotask(() => {
          if (!input.includes('projectItems(first:50){nodes{id project{id}}')) {
            child.stderr.end('controlled downstream read unavailable');
            child.emit('close', 1);
            return;
          }
          reads++;
          child.stdout.end(
            JSON.stringify({
              data: {
                repository: {
                  issue: {
                    id: 'I_test',
                    number: 2057,
                    body,
                    repository: { nameWithOwner: 'owner/repo' },
                  },
                },
              },
            })
          );
          child.emit('close', 0);
        })
      );
      return child;
    };
    try {
      const result = await evaluateTestReadiness({
        issue: 2057,
        cfg: { repo: 'owner/repo', projectId: 'P_test' },
        projectDir: t.unitRoot,
        body,
        head: 'a'.repeat(40),
        deps: {
          readHead: async () => 'a'.repeat(40),
          fetchBoard: async () => ({ state: 'develop' }),
          resolveBoundDir: () => t.unitRoot,
          readWorktreeIdentity: () => ({ worktreePath: t.unitRoot }),
          readSessionState: () => ({ active: 2057 }),
          resolveLifecycleEvidence: async () => {
            throw new Error('controlled evidence unavailable');
          },
        },
      });
      assert.equal(reads, 1);
      assert.equal(
        result.blockers.some((b) => b.code === 'state-unavailable'),
        false
      );
    } finally {
      ghClient.pexec = previousExec;
      ghClient.spawn = previousSpawn;
    }
  });
  test('native Test command and independent preflight preserve exact published body bytes', async (t) => {
    const { evaluateTestReadiness } =
      await import('../../task-tracker/lib/action-decision/test.mjs');
    const { runTestWithEntryInterlock } = await import('../../task-tracker/verbs/test.mjs');
    const { ghClient } = await import('../../gh/lib/gh-client.mjs');
    const previousExec = ghClient.pexec;
    const previousSpawn = ghClient.spawn;
    const body =
      '<!-- aitm-last-known-state state="develop" ts="2026-11-02T07:51:05Z" -->\n' +
      bodyFixture().body;
    let reads = 0;
    ghClient.pexec = async (_command, args) => {
      if (args?.[0] !== 'issue' || args?.[1] !== 'view')
        throw new Error('controlled downstream read unavailable');
      return { stdout: body + '\n' };
    };
    ghClient.spawn = () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      let input = '';
      child.stdin.on('data', (chunk) => {
        input += chunk;
      });
      child.stdin.on('finish', () =>
        queueMicrotask(() => {
          if (!input.includes('projectItems(first:50){nodes{id project{id}}')) {
            child.stderr.end('controlled downstream read unavailable');
            child.emit('close', 1);
            return;
          }
          reads++;
          child.stdout.end(
            JSON.stringify({
              data: {
                repository: {
                  issue: {
                    id: 'I_test',
                    number: 2057,
                    body,
                    repository: { nameWithOwner: 'owner/repo' },
                  },
                },
              },
            })
          );
          child.emit('close', 0);
        })
      );
      return child;
    };
    try {
      let entry;
      const result = await runTestWithEntryInterlock({
        cfg: { repo: 'owner/repo', projectId: 'P_test' },
        issueNumber: 2057,
        projectDir: t.unitRoot,
        deps: {
          acquireIssueLock: async (_key, run) => run(),
          getHeadSha: async () => 'a'.repeat(40),
          entryPreflight: async (input) => {
            entry = input;
            return evaluateTestReadiness({
              issue: 2057,
              cfg: { repo: 'owner/repo', projectId: 'P_test' },
              projectDir: t.unitRoot,
              body: input.body,
              head: 'a'.repeat(40),
              deps: {
                readHead: async () => 'a'.repeat(40),
                fetchBoard: async () => ({ state: 'develop' }),
                resolveBoundDir: () => t.unitRoot,
                readWorktreeIdentity: () => ({ worktreePath: t.unitRoot }),
                readSessionState: () => ({ active: 2057 }),
                resolveLifecycleEvidence: async () => {
                  throw new Error('controlled evidence unavailable');
                },
              },
            });
          },
        },
      });
      assert.equal(entry.body, body);
      assert.equal(result.status, 'entry-preflight-refused');
      assert.equal(reads, 2);
      assert.equal(
        result.readiness.blockers.some((b) => b.code === 'state-unavailable'),
        false
      );
    } finally {
      ghClient.pexec = previousExec;
      ghClient.spawn = previousSpawn;
    }
  });
  test('default fresh transport selects the declared host at the physical spawn boundary', async () => {
    const { ghClient } = await import('../../gh/lib/gh-client.mjs');
    const previous = ghClient.spawn;
    let calls = 0,
      selected;
    ghClient.spawn = (_command, _args, options) => {
      calls++;
      selected = options.env?.GH_HOST;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      child.stdin.resume();
      child.stdin.on('finish', () =>
        queueMicrotask(() => {
          const issue = {
            id: 'I_test',
            number: 2057,
            body: 'enterprise body',
            repository: { nameWithOwner: 'owner/repo' },
            projectItems: {
              nodes: [{ id: 'PI_test', project: { id: 'P_test' } }],
              pageInfo: { hasNextPage: false },
            },
          };
          child.stdout.end(JSON.stringify({ data: { repository: { issue } } }));
          child.emit('close', 0);
        })
      );
      return child;
    };
    try {
      const observed = await views.readPublishedStoryObservation({
        repository: 'owner/repo',
        issue: 2057,
        projectId: 'P_test',
        host: 'enterprise.example',
      });
      assert.equal(selected, 'enterprise.example');
      assert.equal(calls, 1);
      assert.equal(observed.subject.host, selected);
    } finally {
      ghClient.spawn = previous;
    }
  });
  for (const kind of ['raw', 'v1', 'malformed-v2'])
    test(
      'working view refuses native-invalid retained ' + kind + ' approval representation',
      async (t) => {
        const f = await fixture(t);
        const record = copy(await f.store.readGeneration());
        const key = 'issue:I_test';
        const approval = { identity };
        const reference = 'plan-approved:' + hash(json(approval));
        const raw =
          kind === 'raw'
            ? 'private ordinary markdown'
            : json({
                schema: 'aitm.story-issue-update/' + (kind === 'v1' ? 'v1' : 'v2'),
                body: 'private candidate',
                title: 'Title',
                ...(kind === 'malformed-v2' ? { nativeApproval: approval } : {}),
              });
        rewrite(record, key, raw, reference);
        assert.throws(() => views.storyView({ generation: record, authority: 'working' }));
      }
    );
  for (const missing of [null, undefined])
    test(
      'real session optional ' +
        String(missing) +
        ' cache preserves fresh readiness and one body read',
      async () => {
        const { evaluateSessionReadiness } =
          await import('../../task-tracker/lib/action-decision/session.mjs');
        let reads = 0;
        const deps = nativeReadinessDeps(async () => missing);
        deps.readIssueBody = async () => {
          reads++;
          return bodyFixture().body;
        };
        const result = await evaluateSessionReadiness({
          actionId: 'bind',
          issue: 2057,
          stateBefore: { active: null, paused: false },
          config: {
            repo: 'owner/repo',
            projectId: 'P_test',
            preferences: { gateAssigneeMatch: true },
          },
          projectDir: '/controlled',
          invokingDir: '/controlled',
          deps,
        });
        assert.equal(result.status, 'ready', JSON.stringify(result));
        assert.equal(reads, 1);
      }
    );
  test('real shallow hook treats a null cache as absent and keeps its one-read admission', async (t) => {
    const { collectHookDecompositionSnapshot } =
      await import('../../task-tracker/lib/decomposition-hook-authority.mjs');
    const { makeTrafficFixture } = await import('../fixtures/refinement-traffic-cases.mjs');
    const sourceRoot = process.cwd();
    const f = await fixture(t);
    const traffic = await makeTrafficFixture({
      sourceRoot,
      fixtureId: 'empty-leaf',
      projectDir: f.root,
    });
    try {
      const result = await collectHookDecompositionSnapshot({
        issue: 2073,
        cfg: traffic.cfg,
        projectDir: f.root,
        deps: { graphql: traffic.provider.graphql, readStoryGeneration: async () => null },
      });
      assert.equal(result.signals.source, 'fresh-combined-snapshot');
      assert.equal(traffic.provider.ledger.length, 1);
      traffic.provider.assertNoEscapes();
    } finally {
      traffic.close();
    }
  });
  test('entirely unattempted prepared intent advertises and executes the actual release path', async (t) => {
    const { nativePlanFixture } = await import('./native-plan-transition-fixture.mjs');
    const { trunk } = await import('./plan-transition-candidate-fixture.mjs');
    const { releaseUnattemptedTransition } =
      await import('../../task-tracker/lib/story-cache/transition-batch.mjs');
    const trunkState = { value: trunk };
    const f = await nativePlanFixture(t, { trunkState });
    trunkState.value = '2'.repeat(40);
    await assert.rejects(f.run(), new RegExp('trunk-drift'));
    const generation = await f.store.readGeneration();
    assert.equal(generation.generation.batch.status, 'prepared');
    assert.equal(f.calls.length, 0);
    const advice = views.storyView({ generation, authority: 'published' }).publication.recovery;
    assert.equal(advice.operation, 'releaseUnattemptedTransition');
    assert.equal(advice.batchId, generation.generation.batch.batchId);
    const released = await context(f.root, () =>
      releaseUnattemptedTransition({ store: f.store, claim: f.claim, batchId: advice.batchId })
    );
    assert.equal(released.generation.batch, null);
    assert.deepEqual(released.generation.working, generation.generation.working);
    trunkState.value = trunk;
    assert.equal((await f.run()).status, 'complete');
  });
}
