// @story #1855
import {
  assert,
  createSandbox,
  evaluateNativeRevisionStageGuards,
  execFileSync,
  fileURLToPath,
  nativeFinalFixture,
  path,
  rawLifecycleSources,
  test,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

test('native stage evaluation exposes frozen data without held readers after release', async (t) => {
  if (process.env.AITM_NATIVE_STAGE_CONTEXT !== '1') {
    const isolation = createSandbox();
    try {
      let status = 0,
        output = '';
      try {
        output = execFileSync(
          process.execPath,
          ['--test', `--test-name-pattern=^${t.name}$`, fileURLToPath(import.meta.url)],
          {
            cwd: isolation.context.sourceRoot,
            env: { ...isolation.env, AITM_NATIVE_STAGE_CONTEXT: '1' },
            encoding: 'utf8',
            timeout: 120000,
          }
        );
      } catch (error) {
        status = error.status;
        output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
      }
      t.diagnostic(output);
      assert.equal(status, 0, 'isolated original native source capture');
      return;
    } finally {
      isolation.dispose();
    }
  }
  const f = await nativeFinalFixture({ nativeStageLayout: true });
  try {
    const cfg = {
      repo: f.context.repository,
      projectId: 'PVT_fixture',
      fieldDisposition: 'PVTF_disposition',
    };
    writeFileSync(
      path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
      JSON.stringify(cfg)
    );
    f.restart((snapshot) => {
      snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
      // Native layout resolves the body gates without a workflow exception request.
      // Retain only responses the real selected pipeline actually consumes.
      snapshot.lifecycleSources.remote.comments.workflow = [];
    });
    const before = structuredClone(f.backend.snapshot);
    const evaluationStart = Date.now();
    const evaluation = await withRevisionConsumer(
      {
        repository: f.context.repository,
        issue: f.context.issue,
        activity: 'stage-write',
        backend: f.backend,
        projectDir: f.projectDir,
      },
      () =>
        evaluateNativeRevisionStageGuards({
          cfg,
          projectDir: f.projectDir,
          issueArg: String(f.context.issue),
          stateArg: 'test',
          resolvedFromState: 'develop',
          plan: { runGuardPipeline: true },
        })
    );
    assert.deepEqual(Object.keys(evaluation).sort(), [
      'assignmentReads',
      'evaluatedAt',
      'guardInvocations',
      'guardReads',
      'guardResult',
      'localReads',
      'ownershipReads',
      'requirementIds',
    ]);
    assert.ok(
      Date.parse(evaluation.evaluatedAt) >= evaluationStart &&
        Date.parse(evaluation.evaluatedAt) <= Date.now()
    );
    assert.ok(evaluation.guardInvocations.length > 0);
    assert.equal(
      evaluation.assignmentReads,
      null,
      'empty diagnostic fixture supplies no assignment capture'
    );
    assert.deepEqual(Object.keys(evaluation.localReads).sort(), ['configuration', 'session']);
    const { configuration, session } = evaluation.localReads;
    assert.deepEqual(Object.keys(configuration).sort(), ['sources', 'value']);
    assert.deepEqual(
      configuration.sources.map((source) => source.role),
      ['user', 'project']
    );
    const projectSource = configuration.sources[1];
    assert.equal(
      projectSource.selectedPath,
      path.join(f.projectDir, '.ai-task-manager/task-tracker.json')
    );
    assert.equal(projectSource.bytes, JSON.stringify(cfg));
    assert.equal(projectSource.currentExists, true);
    assert.equal(projectSource.selectedExists, true);
    assert.equal(projectSource.error, null);
    assert.equal(configuration.value.repo, f.context.repository);
    assert.deepEqual(Object.keys(session).sort(), ['source', 'value']);
    assert.equal(session.source.sessionId, f.context.executor.sessionId);
    assert.equal(
      session.source.path,
      path.join(
        f.projectDir,
        '.tmp/aitm/gates',
        `task-tracker.session.${f.context.executor.sessionId}.json`
      )
    );
    assert.equal(session.value.sessionId, f.context.executor.sessionId);
    assert.equal(session.source.error, null);
    const { homedir } = await import('node:os');
    const { deriveRecordedStageSources } =
      await import('../../../../task-tracker/lib/criteria-revision/native-stage-data.mjs');
    const recorded = deriveRecordedStageSources({
      schema: 'aitm.native-stage-sources/v1',
      repository: f.context.repository,
      projectDir: f.projectDir,
      homeDir: homedir(),
      sessionId: f.context.executor.sessionId,
      ...evaluation.localReads,
    });
    assert.deepEqual(recorded.config, configuration.value);
    assert.deepEqual(recorded.sessionPolicy, session.value);

    for (const trace of evaluation.guardInvocations)
      assert.deepEqual(
        trace.map((item) => item.guardId),
        [
          'blocked-by-not-done',
          'develop-exit-code-complete',
          'develop-exit-receipt',
          'develop-exit-commit-trail-head',
          'develop-exit-epic-children-done',
          'child-cannot-lead-epic-exit',
          'criteria-revision-admission',
          'contiguity-entry',
          'body-gates-entry-test',
        ]
      );
    const inspect = (value) => {
      assert.notEqual(typeof value, 'function');
      if (value && typeof value === 'object') {
        assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
        assert.ok(Object.isFrozen(value));
        for (const child of Object.values(value)) inspect(child);
      }
    };
    inspect(evaluation);
    assert.deepEqual(JSON.parse(JSON.stringify(evaluation)), evaluation);
    assert.deepEqual(f.backend.snapshot, before);
    assert.equal(await evaluateNativeRevisionStageGuards({}), null);
  } finally {
    f.dispose();
  }
});
