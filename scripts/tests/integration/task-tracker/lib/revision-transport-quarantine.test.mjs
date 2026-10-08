// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { ghClient, pexec } from '../../../../gh/lib/gh-client.mjs';
import { validateBlocker } from '../../../../task-tracker/lib/action-decision/contract.mjs';
import { withMemoryInterlock } from '../../../../task-tracker/lib/criteria-revision/store.mjs';
import { withRevisionConsumer } from '../../../../task-tracker/lib/criteria-revision/policy.mjs';
import {
  withMemoryTransportQuarantine,
  withMemoryStageEffectQuarantine,
} from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';
import { fixture } from '../../../helpers/criteria-revision-consumers.mjs';

function refused(error) {
  assert.equal(error.code, 'revision-authority-unavailable');
  assert.equal(error.status, 'indeterminate');
  assert.deepEqual(validateBlocker(error.blocker, { status: error.status }), error.blocker);
  return true;
}
for (const transport of ['pexec', 'execFile', 'spawn']) {
  test(`actual shared ${transport} refuses nested and supplied memory capability before native process dispatch`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture('empty', { worktree: s.context.sourceRoot });
      await withMemoryInterlock(backend, context, (capability) =>
        withRevisionConsumer(
          {
            repository: context.repository,
            issue: context.issue,
            activity: 'body-write',
            backend,
            capability,
          },
          async () => {
            await Promise.resolve();
            for (const executable of [
              'gh',
              path.join(s.context.sourceRoot, 'missing', 'gh'),
              'gh.exe',
            ]) {
              assert.throws(() => ghClient[transport](executable, ['version']), refused);
              withMemoryTransportQuarantine(() =>
                assert.throws(() => ghClient[transport](executable, ['version']), refused)
              );
            }
            const result = await pexec(process.execPath, [
              '-e',
              'process.stdout.write(process.argv[1])',
              'native-verifier-process',
            ]);
            assert.equal(
              result.stdout,
              'native-verifier-process',
              'non-GitHub native verifier dispatch remains available'
            );
          }
        )
      );
    } finally {
      s.dispose();
    }
  });
}

test('memory quarantine survives asynchronous work scheduled inside its original lifetime', async () => {
  const s = createSandbox();
  try {
    const { backend, context } = await fixture('empty', { worktree: s.context.sourceRoot });
    let release, late;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await withMemoryInterlock(backend, context, () => {
      late = gate.then(() => assert.throws(() => ghClient.spawn('gh', ['version']), refused));
    });
    release();
    await late;
  } finally {
    s.dispose();
  }
});

test('outside memory scope actual shared native transports keep ordinary offline behavior', async () => {
  const s = createSandbox();
  const oldPath = process.env.PATH,
    oldDouble = process.env.AITM_GH_TEST_DOUBLE_BIN;
  try {
    const bin = path.join(s.context.sourceRoot, 'offline-bin');
    fs.mkdirSync(bin);
    const output = 'ordinary-gh-fixture';
    fs.writeFileSync(
      path.join(bin, 'gh'),
      `#!${process.execPath}
process.stdout.write(${JSON.stringify(output)});
`,
      { mode: 0o755 }
    );
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    process.env.AITM_GH_TEST_DOUBLE_BIN = bin;
    assert.equal((await pexec('gh', ['version'])).stdout, output);
    const result = await new Promise((resolve, reject) =>
      ghClient.execFile('gh', ['version'], (error, stdout) =>
        error ? reject(error) : resolve(stdout)
      )
    );
    assert.equal(result, output);
    const spawned = await new Promise((resolve, reject) => {
      const child = ghClient.spawn('gh', ['version']);
      let text = '';
      child.stdout.on('data', (chunk) => (text += chunk));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(text) : reject(new Error(`exit ${code}`))));
    });
    assert.equal(spawned, output);
  } finally {
    process.env.PATH = oldPath;
    if (oldDouble === undefined) delete process.env.AITM_GH_TEST_DOUBLE_BIN;
    else process.env.AITM_GH_TEST_DOUBLE_BIN = oldDouble;
    s.dispose();
  }
});

import { postNewAutomatedTestsComment } from '../../../../task-tracker/lib/new-automated-tests-comment.mjs';
// @story #1855
for (const leaf of ['read', 'write'])
  test(`actual new-tests comment default ${leaf} cannot dispatch GitHub from memory authority`, async () => {
    const s = createSandbox(),
      oldPath = process.env.PATH;
    try {
      const { backend, context } = await fixture('baseline', { worktree: s.context.sourceRoot });
      const bin = path.join(s.context.sourceRoot, 'offline-comment-bin');
      fs.mkdirSync(bin);
      const marker = path.join(s.context.sourceRoot, 'unexpected-comment-process');
      fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'dispatched'); process.stdout.write('[]');\n`,
        { mode: 0o755 }
      );
      process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
      const deps = { revisionBackend: backend };
      if (leaf === 'write')
        Object.assign(deps, {
          listComments: async () => [
            {
              id: 'IC_trail',
              body: '### 🔗 Commits\n<!-- aitm-commits shas="' + 'a'.repeat(40) + '" -->',
            },
          ],
          attributingCommits: async () => [],
          showShaTestDiff: async () =>
            "+++ b/test.mjs\n+test('source dependency changes refuse', () => {});\n",
        });
      await assert.rejects(
        postNewAutomatedTestsComment({
          cfg: { repo: context.repository },
          issueNumber: context.issue,
          cwd: s.context.sourceRoot,
          deps,
        }),
        refused
      );
      assert.equal(
        fs.existsSync(marker),
        false,
        'actual native default leaf must refuse before OS dispatch'
      );
    } finally {
      process.env.PATH = oldPath;
      s.dispose();
    }
  });

import {
  findTimingComment,
  readTimingCommentBody,
  readCanonicalTimingSource,
  updateTimingComment,
  postTimingEvent,
  __internals as timingInternals,
} from '../../../../task-tracker/gh-timing-comment.mjs';
for (const reader of ['find', 'legacy', 'canonical', 'update'])
  test(`actual timing ${reader} default refuses memory OS dispatch`, async () => {
    const s = createSandbox(),
      oldPath = process.env.PATH;
    try {
      const { backend, context } = await fixture('empty', { worktree: s.context.sourceRoot });
      const bin = path.join(s.context.sourceRoot, 'offline-timing-bin');
      fs.mkdirSync(bin);
      const marker = path.join(s.context.sourceRoot, 'unexpected-timing-process');
      fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'dispatched'); process.stdout.write(JSON.stringify({comments:[]}));\n`,
        { mode: 0o755 }
      );
      process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
      await withMemoryInterlock(backend, context, async () => {
        if (reader === 'find')
          await assert.rejects(findTimingComment(context.issue, context.repository), refused);
        else if (reader === 'update')
          await assert.rejects(
            updateTimingComment('IC_native', context.repository, 'unchanged fixture bytes'),
            refused
          );
        else {
          const result = await (
            reader === 'legacy' ? readTimingCommentBody : readCanonicalTimingSource
          )({
            issueNumber: context.issue,
            repo: context.repository,
          });
          assert.equal(result.status, 'error');
          refused(result.error);
        }
      });
      assert.equal(
        fs.existsSync(marker),
        false,
        'no native process is dispatched from recognized memory'
      );
      if (reader === 'find') {
        assert.equal(await findTimingComment(context.issue, context.repository), null);
        assert.equal(
          fs.readFileSync(marker, 'utf8'),
          'dispatched',
          'ordinary reader still uses its actual default transport'
        );
      }
    } finally {
      process.env.PATH = oldPath;
      s.dispose();
    }
  });

// Add-denial stage scope alone must protect the default leaves; a separate
// transport quarantine would mask fallback from an unselected native branch.
for (const leaf of ['update', 'create', 'post-default'])
  test(`stage-only timing ${leaf} refuses before fallback transport`, async () => {
    const s = createSandbox(),
      oldPath = process.env.PATH;
    try {
      const bin = path.join(s.context.sourceRoot, 'offline-stage-timing-bin');
      fs.mkdirSync(bin);
      const marker = path.join(s.context.sourceRoot, 'unexpected-stage-timing-process');
      fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'dispatched'); process.stdout.write('fixture-response');\n`,
        { mode: 0o755 }
      );
      process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
      let caught;
      try {
        await withMemoryStageEffectQuarantine(() =>
          leaf === 'update'
            ? updateTimingComment('IC_native', 'example/criteria', 'unchanged fixture bytes')
            : leaf === 'create'
              ? timingInternals.createTimingComment(
                  124,
                  'example/criteria',
                  'new fixture timing bytes'
                )
              : postTimingEvent({
                  issueNumber: 124,
                  repo: 'example/criteria',
                  row: 'untrusted original row',
                })
        );
      } catch (error) {
        caught = error;
      }
      assert.equal(
        fs.existsSync(marker),
        false,
        'stage-only denial must stop the actual default gh process'
      );
      assert.ok(caught, 'missing original native invocation must refuse');
      refused(caught);
      if (leaf !== 'post-default') {
        if (leaf === 'update')
          await updateTimingComment('IC_native', 'example/criteria', 'ordinary fixture bytes');
        else
          assert.equal(
            await timingInternals.createTimingComment(
              124,
              'example/criteria',
              'ordinary fixture bytes'
            ),
            'fixture-response'
          );
        assert.equal(
          fs.readFileSync(marker, 'utf8'),
          'dispatched',
          'outside-scope default transport stays ordinary'
        );
      }
    } finally {
      process.env.PATH = oldPath;
      s.dispose();
    }
  });

import {
  stampEntryMarkers,
  postStampFailureAudit,
} from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { versionedWriteBody } from '../../../../task-tracker/lib/versioned-issue-write.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
for (const route of ['entry', 'failure-audit', 'versioned'])
  test(`stage-only body ${route} refuses before public callbacks`, async () => {
    const s = createSandbox();
    try {
      const { backend, context } = await fixture('empty', { worktree: s.context.sourceRoot });
      const calls = [];
      let remote = backend.observation.body.bytes;
      const invoke = () =>
        route === 'entry'
          ? stampEntryMarkers({
              issueArg: context.issue,
              stateArg: 'test',
              resolvedFromState: 'develop',
              transitionId: 'ordinary-fixture',
              cfg: { repo: context.repository },
              _mutateBody: async (input) => {
                calls.push('mutate');
                input.mutate(remote);
              },
              gh: async () => {
                calls.push('gh');
              },
            })
          : route === 'failure-audit'
            ? postStampFailureAudit({
                issueNumber: context.issue,
                repo: context.repository,
                stage: 'test',
                error: 'fixture failure',
                postComment: async () => {
                  calls.push('comment');
                },
              })
            : versionedWriteBody({
                issueNumber: context.issue,
                repo: context.repository,
                mutate: (body) => {
                  calls.push('mutate');
                  return body + '\nOrdinary fixture note.\n';
                },
                deps: {
                  revisionBackend: backend,
                  fetchBody: async () => {
                    calls.push('fetch');
                    return remote;
                  },
                  pushBody: async (_repo, _issue, body) => {
                    calls.push('push');
                    remote = body;
                  },
                },
              });
      await invoke();
      assert.ok(
        calls.length > 0,
        'ordinary callback route is reachable without the stage-only denial'
      );
      calls.length = 0;
      let caught, result;
      try {
        result = await withMemoryStageEffectQuarantine(invoke);
      } catch (error) {
        caught = error;
      }
      assert.deepEqual(calls, [], 'stage-only scope must refuse before caller callbacks');
      if (route === 'failure-audit') assert.equal(result.mode, 'error');
      else {
        assert.ok(caught);
        refused(caught);
      }
    } finally {
      s.dispose();
    }
  });

for (const route of ['mutate', 'versioned'])
  test(`stage-only body ${route} refuses input getters before observation`, async () => {
    const calls = [];
    const input = Object.defineProperties(
      {},
      {
        issueNumber: {
          enumerable: true,
          get() {
            calls.push('issue');
            return 124;
          },
        },
        repo: {
          enumerable: true,
          get() {
            calls.push('repo');
            return 'example/criteria';
          },
        },
        mutate: {
          enumerable: true,
          get() {
            calls.push('mutate');
            return (body) => body;
          },
        },
        deps: {
          enumerable: true,
          get() {
            calls.push('deps');
            return {};
          },
        },
      }
    );
    let caught;
    try {
      await withMemoryStageEffectQuarantine(() =>
        route === 'mutate' ? mutateIssueBody(input) : versionedWriteBody(input)
      );
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    refused(caught);
    assert.deepEqual(calls, []);
  });
