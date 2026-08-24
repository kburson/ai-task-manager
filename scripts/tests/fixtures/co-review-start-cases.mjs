// @story #1269 #1272

import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { assertArchiveDestinationAbsent } from '../../review/lib/archive.mjs';
import {
  START_DEFAULTS,
  deriveHostArchiveDir,
  deriveRuntimeDir,
  resolveStartOptions,
  startProtocol,
} from '../../review/lib/start.mjs';
import { COMMANDS, renderHelp } from '../../review/lib/help.mjs';
import {
  memoryProtocol,
  memoryRepositoryFixture,
  readEvents,
  runCliDirect,
  temporaryRoot,
} from './co-review-fixture.mjs';

function startDependencies(api, extra = {}) {
  return {
    initialize: api.initializeProtocol,
    status: api.statusProtocol,
    ...extra,
  };
}

test('start defaults and derived runtime directories are stable and unique by creation id', () => {
  assert.deepEqual(START_DEFAULTS, {
    maxReviewTurns: 10,
    waitCycles: 20,
    waitIntervalSeconds: 60,
  });
  assert.equal(
    deriveRuntimeDir('docs/Architecture Review.md', 'creation-1'),
    '.tmp/co-review/architecture-review-creation-1'
  );
  assert.notEqual(
    deriveRuntimeDir('docs/design.md', 'creation-1'),
    deriveRuntimeDir('docs/design.md', 'creation-2')
  );
  assert.equal(deriveHostArchiveDir('1272', 'spec'), 'docs/superpowers/reviews/1272/spec');
  assert.equal(deriveHostArchiveDir(1272, 'plan'), 'docs/superpowers/reviews/1272/plan');
});

test('start option resolution validates roles and numeric bounds before mutation', () => {
  const base = { artifact: 'docs/artifact.md', owner: 'author', reviewer: 'reviewer' };
  assert.deepEqual(resolveStartOptions(base, { creationId: () => 'fixed' }), {
    ...base,
    dir: '.tmp/co-review/artifact-fixed',
    ...START_DEFAULTS,
  });
  assert.deepEqual(
    resolveStartOptions(
      { ...base, issue: '1272', artifactKind: 'spec' },
      {
        creationId: () => 'fixed',
      }
    ),
    {
      ...base,
      issue: 1272,
      artifactKind: 'spec',
      archiveDir: 'docs/superpowers/reviews/1272/spec',
      dir: '.tmp/co-review/artifact-fixed',
      ...START_DEFAULTS,
    }
  );
  for (const options of [
    { ...base, reviewer: 'author' },
    { ...base, maxReviewTurns: 0 },
    { ...base, waitCycles: 0 },
    { ...base, waitIntervalSeconds: 0 },
    { ...base, waitIntervalSeconds: 61 },
    { ...base, waitCycles: 1.5 },
    { ...base, issue: '1272' },
    { ...base, artifactKind: 'spec' },
    { ...base, issue: '0', artifactKind: 'spec' },
    { ...base, issue: '01272', artifactKind: 'spec' },
    { ...base, issue: '1272', artifactKind: 'design' },
  ]) {
    assert.throws(() => resolveStartOptions(options), /co-review:start-/);
  }
});

test('guided startup never infers host context from spec- or plan-looking filenames', () => {
  for (const artifact of [
    'docs/2026-08-18-payment-spec.md',
    'docs/superpowers/plans/2026-08-18-payment-plan.md',
  ]) {
    const resolved = resolveStartOptions(
      { artifact, owner: 'author', reviewer: 'reviewer' },
      { creationId: () => 'fixed' }
    );
    assert.equal(resolved.issue, undefined);
    assert.equal(resolved.artifactKind, undefined);
    assert.equal(resolved.archiveDir, undefined);
  }
});

test('review evidence documentation declares one current generated filename grammar', () => {
  const documentation = readFileSync(path.resolve('docs/superpowers/reviews/README.md'), 'utf8');
  assert.match(documentation, /artifact-<artifact-basename>/);
  assert.match(documentation, /<artifact-stem>-r<pair-round>-owner-<owner-slug>-response\.md/);
  assert.match(documentation, /<artifact-stem>-r<pair-round>-reviewer-<reviewer-slug>-review\.md/);
  assert.doesNotMatch(documentation, /<date>-<slug>-owner-response-r<round>-<actor>\.md/);
  assert.doesNotMatch(documentation, /<date>-<slug>-acceptance-r<round>-<actor>\.md/);
});

test('guided host context configures deterministic spec and plan archives and handoffs', async () => {
  for (const artifactKind of ['spec', 'plan']) {
    const fixture = memoryRepositoryFixture();
    const api = await memoryProtocol(fixture.repository);
    const dir = `.tmp/${artifactKind}-host-start`;
    const options = {
      cwd: fixture.root,
      artifact: fixture.artifact,
      owner: 'author-agent',
      reviewer: 'reviewer-agent',
      dir,
      issue: '1272',
      artifactKind,
    };
    const result = startProtocol(options, startDependencies(api));
    const archiveDir = `docs/superpowers/reviews/1272/${artifactKind}`;
    assert.equal(result.state.initialization.archiveDir, archiveDir);
    assert.deepEqual(result.manifest.hostArchive, {
      issue: 1272,
      artifactKind,
      archiveDir,
    });
    for (const handoffPath of [result.authorHandoff.absolute, result.reviewerHandoff.absolute]) {
      const handoff = readFileSync(handoffPath, 'utf8');
      assert.match(handoff, new RegExp(`Artifact kind: .*${artifactKind}`));
      assert.match(handoff, new RegExp(archiveDir));
      assert.match(
        handoff,
        new RegExp(`finalize --dir ${path.resolve(fixture.root, dir)} --archive-dir ${archiveDir}`)
      );
    }

    const statePath = path.join(fixture.root, dir, 'state.json');
    const eventsPath = path.join(fixture.root, dir, 'events.jsonl');
    const state = readFileSync(statePath, 'utf8');
    const eventBytes = readFileSync(eventsPath, 'utf8');
    const events = readEvents(fixture.root, dir);
    const archive = path.join(fixture.root, archiveDir);
    mkdirSync(path.dirname(archive), { recursive: true });
    symlinkSync(path.join(fixture.root, 'docs'), archive);
    const exact = startProtocol(options, startDependencies(api));
    assert.deepEqual(exact.manifest, result.manifest);
    assert.deepEqual(exact.state, result.state);
    assert.equal(readFileSync(statePath, 'utf8'), state);
    assert.equal(readFileSync(eventsPath, 'utf8'), eventBytes);
    assert.throws(
      () =>
        startProtocol(
          { ...options, artifactKind: artifactKind === 'spec' ? 'plan' : 'spec' },
          startDependencies(api)
        ),
      /co-review:already-initialized/
    );
    assert.deepEqual(readEvents(fixture.root, dir), events);
  }
});

test('guided start refuses every occupied configured archive leaf before protocol creation', async () => {
  for (const occupied of ['empty-directory', 'non-empty-directory', 'file', 'symlink']) {
    const fixture = memoryRepositoryFixture();
    const api = await memoryProtocol(fixture.repository);
    const archive = path.join(fixture.root, 'docs/superpowers/reviews/1272/spec');
    mkdirSync(path.dirname(archive), { recursive: true });
    if (occupied === 'empty-directory') mkdirSync(archive);
    if (occupied === 'non-empty-directory') {
      mkdirSync(archive);
      writeFileSync(path.join(archive, 'README.md'), '# prior archive\n');
    }
    if (occupied === 'file') writeFileSync(archive, 'occupied\n');
    if (occupied === 'symlink') symlinkSync(path.join(fixture.root, 'docs'), archive);

    const dir = `.tmp/occupied-${occupied}`;
    assert.throws(
      () =>
        startProtocol(
          {
            cwd: fixture.root,
            artifact: fixture.artifact,
            owner: 'author-agent',
            reviewer: 'reviewer-agent',
            dir,
            issue: '1272',
            artifactKind: 'spec',
          },
          startDependencies(api)
        ),
      (error) => error.code === 'archive-destination-occupied'
    );
    assert.equal(existsSync(path.join(fixture.root, dir, 'state.json')), false);
    assert.equal(existsSync(path.join(fixture.root, dir, 'events.jsonl')), false);
  }
});

test('direct init applies configured archive occupancy refusal before protocol creation', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const archive = path.join(fixture.root, 'docs/reviews/occupied');
  mkdirSync(archive, { recursive: true });
  const dir = '.tmp/direct-occupied';

  assert.throws(
    () =>
      api.initializeProtocol({
        cwd: fixture.root,
        dir,
        artifact: fixture.artifact,
        owner: 'author-agent',
        reviewer: 'reviewer-agent',
        maxReviewTurns: 2,
        archiveDir: 'docs/reviews/occupied',
      }),
    (error) => error.code === 'archive-destination-occupied'
  );
  assert.equal(existsSync(path.join(fixture.root, dir, 'state.json')), false);
  assert.equal(existsSync(path.join(fixture.root, dir, 'events.jsonl')), false);
});

test('archive occupancy translates unreadable directory enumeration', () => {
  const root = temporaryRoot('aitm-co-review-unreadable-archive-');
  const absolute = path.join(root, 'docs/reviews/unreadable');
  mkdirSync(absolute, { recursive: true });
  writeFileSync(path.join(absolute, 'preserve.md'), 'preserve\n');
  const injected = Object.assign(new Error('injected enumeration refusal'), { code: 'EACCES' });

  assert.throws(
    () =>
      assertArchiveDestinationAbsent(
        { absolute, relative: 'docs/reviews/unreadable' },
        {
          readdir() {
            throw injected;
          },
        }
      ),
    (error) =>
      error !== injected &&
      error.code === 'archive-destination-occupied' &&
      /docs\/reviews\/unreadable: unreadable: injected enumeration refusal/.test(error.message)
  );
  assert.equal(readFileSync(path.join(absolute, 'preserve.md'), 'utf8'), 'preserve\n');
});

test('start delegates initialization and publishes concrete hashed handoffs before thin output', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const result = startProtocol(
    {
      cwd: fixture.root,
      artifact: fixture.artifact,
      owner: 'author-agent',
      reviewer: 'reviewer-agent',
      dir: '.tmp/review-start',
    },
    startDependencies(api)
  );

  assert.equal(result.state.maxReviewTurns, 10);
  assert.equal(result.state.initialization.archiveDir, undefined);
  assert.equal(result.manifest.hostArchive, undefined);
  assert.deepEqual(
    readEvents(fixture.root, '.tmp/review-start').map(({ type }) => type),
    ['init']
  );
  assert.equal(result.manifest.schema, 'aitm.co-review-start/v1');
  for (const role of ['author', 'reviewer']) {
    const record = result.manifest.handoffs[role];
    assert.match(record.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(readFileSync(path.join(fixture.root, record.path), 'utf8').startsWith('# '), true);
  }
  const author = readFileSync(result.authorHandoff.absolute, 'utf8');
  const reviewer = readFileSync(result.reviewerHandoff.absolute, 'utf8');
  const runtimeAbsolute = path.resolve(fixture.root, '.tmp/review-start');
  for (const bytes of [author, reviewer]) {
    assert.match(bytes, new RegExp(result.state.protocolId));
    assert.match(bytes, new RegExp(path.resolve(fixture.root, '.tmp/review-start')));
    assert.match(bytes, /wait cycle N\/20/);
    assert.match(bytes, /compaction/i);
    assert.match(bytes, /--timeout 60/);
    assert.match(bytes, /snapshot publication/i);
    assert.match(bytes, /one settled status re-read/i);
    assert.match(bytes, /mismatch persists/i);
    assert.match(bytes, /continue from its reported state/i);
    assert.doesNotMatch(bytes, /<[^>]+>/);
  }
  assert.match(author, /author-agent/);
  assert.match(author, /--response/);
  assert.match(author, new RegExp(`status --dir ${runtimeAbsolute} --json`));
  assert.match(author, new RegExp(`--response ${runtimeAbsolute}/round-N-author-response\\.md`));
  assert.match(author, /lastHandoff\.artifacts\.review\.path/);
  assert.match(author, /--answers REVIEW_PATH/);
  assert.match(
    author,
    /read the exact preceding immutable review path directly from structured status/i
  );
  assert.match(author, /canonical `HEAD` and clean tracked state/i);
  assert.match(author, /artifact-only changes/i);
  assert.match(author, /separately observed waits/i);
  assert.match(author, /start.*turn timer immediately/i);
  assert.match(author, /routing.*does not.*human.*approval/is);
  assert.match(author, /\[finding:F-001\] \[disposition:accepted\]/);
  assert.match(author, /\[evidence:repository-path-or-command\]/);
  assert.match(reviewer, /reviewer-agent/);
  assert.match(reviewer, /--review/);
  assert.match(reviewer, new RegExp(`--review ${runtimeAbsolute}/round-N-reviewer-review\\.md`));
  assert.doesNotMatch(author, /--dir \.tmp\/review-start/);
  assert.doesNotMatch(reviewer, /--dir \.tmp\/review-start/);
  assert.match(reviewer, /\[supplement:S-1\]/);
  assert.match(reviewer, /optional.*--summary/i);
  assert.doesNotMatch(reviewer, /required.*--summary/i);
  assert.match(reviewer, /normal repository inspection, test, build, and Bash capabilities/i);
  assert.match(reviewer, /same canonical physical worktree/i);
  assert.match(reviewer, /never edit or commit the authoritative artifact/i);
  assert.match(reviewer, /Create only the new review file/i);
  assert.match(reviewer, /write.*review.*Edit.*Write.*apply_patch/is);
  assert.match(reviewer, /start.*turn timer immediately/i);
  assert.match(reviewer, /without an unrelated bound task/i);
  assert.match(reviewer, /routing.*does not.*human.*approval/is);
  assert.match(reviewer, /exit 4.*acceptance is already durable/is);
  assert.doesNotMatch(reviewer, /Arbitrary Bash remains blocked/i);
  assert.equal(
    result.output,
    `AUTHOR PROMPT\nRead and follow this handoff completely, then begin:\n${result.authorHandoff.absolute}\n\n` +
      `REVIEWER PROMPT\nRead and follow this handoff completely, then begin:\n${result.reviewerHandoff.absolute}\n`
  );
});

test('flagged start CLI applies defaults and prints only the two handoff prompts', async () => {
  const fixture = memoryRepositoryFixture();
  const result = await runCliDirect(
    [
      'start',
      '--artifact',
      fixture.artifact,
      '--owner',
      'author-agent',
      '--reviewer',
      'reviewer-agent',
      '--dir',
      '.tmp/cli-start',
    ],
    { cwd: fixture.root, repository: fixture.repository }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^AUTHOR PROMPT\n/);
  assert.match(result.stdout, /\n\nREVIEWER PROMPT\n/);
  assert.doesNotMatch(result.stdout, /\{\s*"/);
});

test('flagged start records every numeric override in state and startup metadata', async () => {
  const fixture = memoryRepositoryFixture();
  const dir = '.tmp/override-start';
  const result = await runCliDirect(
    [
      'start',
      '--artifact',
      fixture.artifact,
      '--owner',
      'author-agent',
      '--reviewer',
      'reviewer-agent',
      '--dir',
      dir,
      '--max-turns',
      '4',
      '--wait-cycles',
      '7',
      '--wait-interval',
      '12',
      '--issue',
      '1272',
      '--artifact-kind',
      'plan',
    ],
    { cwd: fixture.root, repository: fixture.repository }
  );
  assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(readFileSync(path.join(fixture.root, dir, 'state.json'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(path.join(fixture.root, dir, 'start-manifest.json'), 'utf8')
  );
  assert.equal(state.maxReviewTurns, 4);
  assert.equal(manifest.maxReviewTurns, 4);
  assert.equal(state.initialization.claimProvenance, 'provider-session/v1');
  assert.equal(manifest.initialization.claimProvenance, 'provider-session/v1');
  assert.equal(manifest.waitCycles, 7);
  assert.equal(manifest.waitIntervalSeconds, 12);
  assert.equal(state.initialization.archiveDir, 'docs/superpowers/reviews/1272/plan');
  assert.deepEqual(manifest.hostArchive, {
    issue: 1272,
    artifactKind: 'plan',
    archiveDir: 'docs/superpowers/reviews/1272/plan',
  });
});

test('exact start retry is event-idempotent, reconstructs one missing handoff, and refuses conflicts', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    artifact: fixture.artifact,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    dir: '.tmp/retry-start',
  };
  const first = startProtocol(options, startDependencies(api));
  const events = readEvents(fixture.root, options.dir);
  const authorBytes = readFileSync(first.authorHandoff.absolute, 'utf8');

  const exact = startProtocol(options, startDependencies(api));
  assert.equal(exact.output, first.output);
  assert.deepEqual(readEvents(fixture.root, options.dir), events);

  unlinkSync(first.authorHandoff.absolute);
  startProtocol(options, startDependencies(api));
  assert.equal(readFileSync(first.authorHandoff.absolute, 'utf8'), authorBytes);
  assert.deepEqual(readEvents(fixture.root, options.dir), events);

  unlinkSync(first.authorHandoff.absolute);
  writeFileSync(first.reviewerHandoff.absolute, '# changed\n');
  assert.throws(() => startProtocol(options, startDependencies(api)), /co-review:start-conflict/);
  assert.equal(existsSync(first.authorHandoff.absolute), false);
  assert.equal(readFileSync(first.reviewerHandoff.absolute, 'utf8'), '# changed\n');
});

test('exact start retry refuses protocol event-integrity drift before touching handoffs', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    artifact: fixture.artifact,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    dir: '.tmp/integrity-start',
  };
  const dependencies = startDependencies(api);
  const first = startProtocol(options, dependencies);
  const authorBefore = readFileSync(first.authorHandoff.absolute, 'utf8');
  const eventsPath = path.join(fixture.root, options.dir, 'events.jsonl');
  const event = JSON.parse(readFileSync(eventsPath, 'utf8'));
  writeFileSync(eventsPath, `${JSON.stringify({ ...event, revision: 99 })}\n`);

  assert.throws(() => startProtocol(options, dependencies), /co-review:start-integrity/);
  assert.equal(readFileSync(first.authorHandoff.absolute, 'utf8'), authorBefore);
});

test('post-initialization publication failure reports an explicit retry and remains recoverable', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    artifact: fixture.artifact,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    dir: '.tmp/partial-start',
  };
  assert.throws(
    () =>
      startProtocol(
        options,
        startDependencies(api, {
          beforePublish(name) {
            if (name === 'reviewer-handoff.md') throw new Error('injected publication failure');
          },
        })
      ),
    /resolved directory: \.tmp\/partial-start; next: npx aitm co-review start .*--dir \.tmp\/partial-start/
  );
  assert.equal(existsSync(path.join(fixture.root, options.dir, 'state.json')), true);
  assert.equal(existsSync(path.join(fixture.root, options.dir, 'author-handoff.md')), true);
  assert.equal(existsSync(path.join(fixture.root, options.dir, 'start-manifest.json')), false);

  const recovered = startProtocol(options, startDependencies(api));
  assert.equal(existsSync(recovered.reviewerHandoff.absolute), true);
  assert.equal(existsSync(path.join(fixture.root, options.dir, 'start-manifest.json')), true);
  assert.equal(readEvents(fixture.root, options.dir).length, 1);
});

test('host-configured publication recovery preserves the exact issue and artifact kind', async () => {
  const fixture = memoryRepositoryFixture();
  const api = await memoryProtocol(fixture.repository);
  const options = {
    cwd: fixture.root,
    artifact: fixture.artifact,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    dir: '.tmp/host-partial-start',
    issue: '1272',
    artifactKind: 'spec',
  };
  assert.throws(
    () =>
      startProtocol(
        options,
        startDependencies(api, {
          beforePublish(name) {
            if (name === 'reviewer-handoff.md') throw new Error('injected host failure');
          },
        })
      ),
    /next: npx aitm co-review start .*--issue 1272 --artifact-kind spec/
  );
  const recovered = startProtocol(options, startDependencies(api));
  assert.equal(recovered.state.initialization.archiveDir, 'docs/superpowers/reviews/1272/spec');
  assert.equal(readEvents(fixture.root, options.dir).length, 1);
});

test('startup publication never follows generated-file symlinks or overwrites a rename race', async () => {
  const symlinked = memoryRepositoryFixture();
  const symlinkedApi = await memoryProtocol(symlinked.repository);
  const symlinkDir = '.tmp/symlink-start';
  symlinkedApi.initializeProtocol({
    cwd: symlinked.root,
    dir: symlinkDir,
    artifact: symlinked.artifact,
    owner: 'author-agent',
    reviewer: 'reviewer-agent',
    maxReviewTurns: 10,
  });
  const outside = path.join(symlinked.root, '.tmp/outside-author.md');
  writeFileSync(outside, '# outside\n');
  symlinkSync(outside, path.join(symlinked.root, symlinkDir, 'author-handoff.md'));
  assert.throws(
    () =>
      startProtocol(
        {
          cwd: symlinked.root,
          dir: symlinkDir,
          artifact: symlinked.artifact,
          owner: 'author-agent',
          reviewer: 'reviewer-agent',
        },
        startDependencies(symlinkedApi)
      ),
    /conflicting or non-regular generated content/
  );
  assert.equal(readFileSync(outside, 'utf8'), '# outside\n');

  const raced = memoryRepositoryFixture();
  const racedApi = await memoryProtocol(raced.repository);
  const racedDir = '.tmp/raced-start';
  assert.throws(
    () =>
      startProtocol(
        {
          cwd: raced.root,
          dir: racedDir,
          artifact: raced.artifact,
          owner: 'author-agent',
          reviewer: 'reviewer-agent',
        },
        startDependencies(racedApi, {
          beforePublish(name) {
            if (name === 'author-handoff.md') {
              writeFileSync(path.join(raced.root, racedDir, name), '# racing writer\n');
            }
          },
        })
      ),
    /co-review:start-conflict/
  );
  assert.equal(
    readFileSync(path.join(raced.root, racedDir, 'author-handoff.md'), 'utf8'),
    '# racing writer\n'
  );

  const swapped = memoryRepositoryFixture();
  const swappedApi = await memoryProtocol(swapped.repository);
  const swappedDir = '.tmp/swapped-start';
  const outsideDirectory = temporaryRoot('aitm-co-review-start-outside-');
  assert.throws(
    () =>
      startProtocol(
        {
          cwd: swapped.root,
          dir: swappedDir,
          artifact: swapped.artifact,
          owner: 'author-agent',
          reviewer: 'reviewer-agent',
        },
        startDependencies(swappedApi, {
          beforePublish(name) {
            if (name !== 'author-handoff.md') return;
            const runtime = path.join(swapped.root, swappedDir);
            renameSync(runtime, `${runtime}-original`);
            symlinkSync(outsideDirectory, runtime, 'dir');
          },
        })
      ),
    /co-review:start-runtime-drift/
  );
  for (const generated of ['author-handoff.md', 'reviewer-handoff.md', 'start-manifest.json']) {
    assert.equal(existsSync(path.join(outsideDirectory, generated)), false);
  }
});

test('interactive start displays resolved configuration and cancellation mutates nothing', async () => {
  const fixture = memoryRepositoryFixture();
  const answers = [
    fixture.artifact,
    '.tmp/interactive-start',
    'author-agent',
    'reviewer-agent',
    '1272',
    'spec',
    '',
    '',
    '',
    'yes',
  ];
  const questions = [];
  const result = await runCliDirect(['start'], {
    cwd: fixture.root,
    repository: fixture.repository,
    isTTY: true,
    prompt(question) {
      questions.push(question);
      return answers.shift();
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(questions.join('\n'), /Author identity/);
  assert.match(result.stdout, /Resolved co-review startup:/);
  assert.match(result.stdout, /Maximum reviewer turns: 10/);
  assert.match(result.stdout, /Host issue: 1272/);
  assert.match(result.stdout, /Artifact kind: spec/);
  assert.match(result.stdout, /Archive destination: docs\/superpowers\/reviews\/1272\/spec/);
  assert.match(result.stdout, /AUTHOR PROMPT/);

  const cancelledDir = '.tmp/cancelled-start';
  const cancelledAnswers = [
    fixture.artifact,
    cancelledDir,
    'author-agent',
    'reviewer-agent',
    '',
    '',
    '',
    '',
    '',
    'no',
  ];
  const cancelled = await runCliDirect(['start'], {
    cwd: fixture.root,
    repository: fixture.repository,
    isTTY: true,
    prompt() {
      return cancelledAnswers.shift();
    },
  });
  assert.equal(cancelled.status, 0);
  assert.match(cancelled.stdout, /cancelled; no state changed/i);
  assert.equal(existsSync(path.join(fixture.root, cancelledDir)), false);
});

test('non-interactive incomplete and invalid flagged start invocations fail before state', async () => {
  const fixture = memoryRepositoryFixture();
  const missing = await runCliDirect(['start', '--artifact', fixture.artifact], {
    cwd: fixture.root,
    repository: fixture.repository,
    isTTY: false,
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /without an interactive terminal/);

  const invalid = await runCliDirect(
    [
      'start',
      '--artifact',
      fixture.artifact,
      '--owner',
      'author-agent',
      '--reviewer',
      'reviewer-agent',
      '--dir',
      '.tmp/invalid-start',
      '--wait-interval',
      '61',
    ],
    { cwd: fixture.root, repository: fixture.repository }
  );
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /start-wait-interval/);
  assert.match(invalid.stderr, /no state changed/);
  assert.equal(existsSync(path.join(fixture.root, '.tmp/invalid-start')), false);

  for (const [suffix, hostArgs] of [
    ['missing-kind', ['--issue', '1272']],
    ['missing-issue', ['--artifact-kind', 'spec']],
    ['bad-issue', ['--issue', '01272', '--artifact-kind', 'spec']],
    ['bad-kind', ['--issue', '1272', '--artifact-kind', 'design']],
  ]) {
    const dir = `.tmp/${suffix}-start`;
    const refused = await runCliDirect(
      [
        'start',
        '--artifact',
        fixture.artifact,
        '--owner',
        'author-agent',
        '--reviewer',
        'reviewer-agent',
        '--dir',
        dir,
        ...hostArgs,
      ],
      { cwd: fixture.root, repository: fixture.repository, isTTY: false }
    );
    assert.equal(refused.status, 2, `${suffix}: ${refused.stderr}`);
    assert.match(refused.stderr, /co-review:start-host-context/);
    assert.match(refused.stderr, /no state changed/);
    assert.equal(existsSync(path.join(fixture.root, dir)), false);
  }
});

test('structured and top-level help fully document guided startup without hiding init', () => {
  assert.equal(Object.keys(COMMANDS)[0], 'start');
  const command = renderHelp('start');
  for (const expected of [
    'npx aitm co-review start',
    '--artifact <repo-path>',
    '--owner <author-identity>',
    '--reviewer <reviewer-identity>',
    '--max-turns <N>',
    '--wait-cycles <N>',
    '--wait-interval <seconds>',
    '--issue <N>',
    '--artifact-kind <spec|plan>',
    'docs/superpowers/reviews/<issue>/<spec|plan>/',
    '10',
    '20',
    '60',
    '.tmp/co-review/',
    'author-handoff.md',
    'reviewer-handoff.md',
    'start-manifest.json',
    'compaction',
    'does not launch agents',
    'no state changed',
  ]) {
    assert.match(command, new RegExp(expected.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const top = renderHelp();
  assert.match(top, /co-review <start\|init\|status/);
  assert.match(top, /start before review; init remains the low-level primitive/);
});
