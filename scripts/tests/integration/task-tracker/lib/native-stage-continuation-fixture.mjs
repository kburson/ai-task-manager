// cspell:words rechain
import { STATUS_OPTION_QUERY } from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
// @story #1855
import {
  appendCommitRow,
  assert,
  buildInitialTrail,
  buildRow,
  createHash,
  createRevisionMemory,
  createSandbox,
  currentSessionId,
  evaluateNativeRevisionStageGuards,
  execFileSync,
  fileURLToPath,
  freshStageContext,
  hashBytes,
  initialTimingComment,
  mkdirSync,
  moveState,
  mutateIssueBody,
  nativeAssignmentPairs,
  nativeFinalFixture,
  nativeStageItemPairs,
  nativeTimingSources,
  observeRevision,
  path,
  rawLifecycleSources,
  readFileSync,
  readdirSync,
  rmSync,
  saveMarker,
  saveState,
  statSync,
  test,
  updateMarker,
  verbAcStamp,
  verbEnsureChecked,
  withRevisionConsumer,
  writeFileSync,
} from './native-continuation-fixtures.mjs';

export function registerNativeStageCase(mode, entrypoint, fault = null) {
  const faultMode = mode;
  const sentinelLateCases = {
    'sentinel-late-persist-token-accessor': ['persist', 'token', 'accessor'],
    'sentinel-late-persist-token-identity': ['persist', 'token', 'identity'],
    'sentinel-late-persist-invocation-accessor': ['persist', 'invocation', 'accessor'],
    'sentinel-late-persist-invocation-identity': ['persist', 'invocation', 'identity'],
    'sentinel-late-persist-step-accessor': ['persist', 'step', 'accessor'],
    'sentinel-late-persist-step-identity': ['persist', 'step', 'identity'],
    'sentinel-late-effect-token-accessor': ['effect', 'token', 'accessor'],
    'sentinel-late-effect-token-identity': ['effect', 'token', 'identity'],
    'sentinel-late-context-issue-accessor': ['effect', 'issue', 'context-accessor'],
    'sentinel-late-context-executor-accessor': ['effect', 'executor', 'context-accessor'],
    'sentinel-late-context-identity': ['effect', 'sessionId', 'context-identity'],
  };
  const sentinelLate = sentinelLateCases[mode];
  const statusModes = [
    'status-source-read',
    'status-source-unreleased',
    'status-source-close',
    'status-source-parse',
    'status-source-parser',
    'status-source-values',
    'status-source-unused',
    'status-source-exhausted',
    'status-source-prefix',
    'status-source-late-config',
    'status-source-late-vector',
    'status-source-custody-input',
    'status-source-custody-output',
    'status-source-custody-error',
  ];
  const expectStage = sentinelLate
    ? 'entry-body'
    : [
          'board',
          'board-prefix',
          'board-exception',
          'board-exception-prefix',
          'sentinel-data',
          'sentinel-history',
          'sentinel-intent',
          'sentinel-complete',
          'sentinel-prefix',
        ].includes(mode)
      ? 'entry-body'
      : mode === 'entry-adversarial'
        ? 'entry-body'
        : mode === 'entry-body-prefix'
          ? 'entry-body'
          : mode === 'entry-intent'
            ? 'entry-body'
            : mode === 'actor-journal-prefix'
              ? 'actor-journal'
              : mode === 'intent-prefix'
                ? 'intent'
                : mode;
  const originalName = sentinelLate
    ? 'native sentinel refuses late original input change: ' + mode
    : faultMode === 'sentinel-complete'
      ? 'native sentinel effect preserves every other completed board resource'
      : faultMode === 'sentinel-prefix'
        ? 'native sentinel interruption retains its exact original durable prefix'
        : faultMode === 'sentinel-intent'
          ? 'native sentinel intent is durable before its body effect'
          : faultMode === 'sentinel-history'
            ? 'sentinel historical prefixes remain pending with complete unaffected resources'
            : faultMode === 'sentinel-data'
              ? 'sentinel DATA derives only from genuine completed board predecessor'
              : statusModes.includes(expectStage) &&
                  !['status-source-read', 'status-source-unreleased'].includes(expectStage)
                ? 'native raw Status ' +
                  expectStage +
                  ' preserves exact parser and pending semantics'
                : expectStage === 'root-adapter'
                  ? 'native stage refuses active runtime identity adapter before journal admission'
                  : expectStage === 'status-source-read'
                    ? 'original native board consumes empty then target raw Status reads'
                    : expectStage === 'status-source-unreleased'
                      ? 'native raw Status missing next pair refuses before another write'
                      : faultMode === 'board-exception-prefix'
                        ? 'original board exception interruption retains exact unknown prefix'
                        : faultMode === 'board-exception'
                          ? 'original native board write throw is retained without confirmation or compensation'
                          : faultMode === 'board-prefix'
                            ? 'owned native board retains exact interrupted resource and pending denial'
                            : faultMode === 'board'
                              ? 'owned native stage verifies original board status before sentinel effects'
                              : faultMode === 'entry-intent'
                                ? 'owned native entry intent remains durable when body effect is interrupted'
                                : expectStage === 'entry-helper-override'
                                  ? 'native entry refuses late helper substitution after actual phase completion'
                                  : expectStage === 'late-sources'
                                    ? 'native stage rechecks actual sources after historical replay awaits'
                                    : expectStage === 'entry-body'
                                      ? 'owned native stage persists original entry body before board effects'
                                      : String(expectStage).startsWith('phase-') &&
                                          expectStage !== 'phase-pair'
                                        ? `owned native ${expectStage} validates exact shared phase history`
                                        : expectStage === 'transition-native'
                                          ? 'owned native transition identity retains original context and rejects copies'
                                          : expectStage === 'transition-override'
                                            ? 'complete native stage refuses caller transition identity before preparation'
                                            : expectStage === 'phase-pair'
                                              ? 'owned native stage publishes original two shared phase facts'
                                              : String(expectStage).startsWith('actor-final-')
                                                ? `owned native actor final ${expectStage.split('-')[2]} preserves every interrupted prefix`
                                                : expectStage === 'actor-final'
                                                  ? 'owned native stage saves original outer actor final state only in memory'
                                                  : expectStage === 'actor-remove'
                                                    ? 'owned native stage removes original actor journal only in memory'
                                                    : String(expectStage).startsWith(
                                                          'actor-checkpoint-'
                                                        ) && String(expectStage).endsWith('-prefix')
                                                      ? `owned native checkpoint ${expectStage.split('-')[2]} preserves every interrupted prefix`
                                                      : expectStage === 'actor-checkpoint-host'
                                                        ? 'owned native checkpoint refuses transient host journal removal lock'
                                                        : expectStage === 'actor-checkpoint'
                                                          ? 'owned native stage saves original actor checkpoint only in memory'
                                                          : expectStage === 'actor-cursor-prefix'
                                                            ? 'owned native actor cursor preserves every interrupted prefix'
                                                            : expectStage === 'actor-cursor-legacy'
                                                              ? 'owned native actor cursor preserves legacy sticky fields'
                                                              : expectStage ===
                                                                  'actor-cursor-absent'
                                                                ? 'owned native actor cursor creates genuine absent resource'
                                                                : expectStage === 'actor-cursor'
                                                                  ? 'owned native stage commits original actor cursor only in memory'
                                                                  : expectStage ===
                                                                      'actor-publication-prefix'
                                                                    ? 'owned native actor publication preserves every interrupted prefix'
                                                                    : expectStage ===
                                                                        'actor-publication-existing'
                                                                      ? 'owned native stage updates existing actor timing only in memory'
                                                                      : expectStage ===
                                                                          'actor-publication'
                                                                        ? 'owned native stage publishes original actor row only in memory'
                                                                        : expectStage ===
                                                                            'actor-journal'
                                                                          ? 'owned native stage prepares sealed actor journal only in memory'
                                                                          : expectStage ===
                                                                              'actor-override'
                                                                            ? 'complete native stage refuses caller actor before preparation'
                                                                            : expectStage ===
                                                                                'intent'
                                                                              ? 'owned native stage persists original header and first intent before any effect'
                                                                              : expectStage ===
                                                                                  'historical'
                                                                                ? 'original stage guard data replays native predicates without current readiness'
                                                                                : expectStage ===
                                                                                    'preparation'
                                                                                  ? 'owned native stage preparation cancels original emitter before host effects'
                                                                                  : expectStage ===
                                                                                      'vertical'
                                                                                    ? 'owned native stage vertical continuation runs actor phase body board and tail'
                                                                                    : expectStage
                                                                                      ? 'complete native guards permit actual Develop to Test saga'
                                                                                      : 'complete native stage guards remain fenced before any saga effect';
  test(originalName + (fault ? ' [' + fault.when + ':' + fault.suffix + ']' : ''), async (t) => {
    if (process.env.AITM_NATIVE_STAGE_CONTEXT !== '1') {
      const isolation = createSandbox();
      try {
        let status = 0,
          output = '';
        try {
          output = execFileSync(process.execPath, ['--test', fileURLToPath(entrypoint)], {
            cwd: isolation.context.sourceRoot,
            env: { ...isolation.env, AITM_NATIVE_STAGE_CONTEXT: '1' },
            encoding: 'utf8',
            timeout: 590000,
          });
        } catch (error) {
          status = error.status;
          output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
        }
        t.diagnostic(output);
        assert.equal(status, 0, 'isolated actual native stage fixture');
        return;
      } finally {
        isolation.dispose();
      }
    }
    const f = await nativeFinalFixture({
      bodyStages: ['backlog', 'refine', 'plan', 'develop'],
      nativeStageLayout: true,
    });
    try {
      const cfg = {
        repo: f.context.repository,
        projectId: 'PVT_fixture',
        fieldDisposition: 'PVTF_disposition',
        ...(typeof expectStage === 'string'
          ? {
              kanbanFieldId: 'PVTF_status',
              kanbanOptionDevelop: 'OPTION_develop',
              kanbanOptionTest: 'OPTION_test',
              fieldStartTime: 'PVTF_start',
              fieldEngagedTime: 'PVTF_engaged',
              fieldSessionTime: 'PVTF_session',
              fieldReviewTime: 'PVTF_review',
              fieldPlanTime: 'PVTF_plan',
              fieldEstimate: 'PVTF_estimate',
              fieldBlockedBy: 'PVTF_blocked',
              rankFieldId: 'PVTF_rank',
              sizeFieldId: 'PVTF_size',
              priorityFieldId: 'PVTF_priority',
            }
          : {}),
      };
      writeFileSync(
        path.join(f.projectDir, '.ai-task-manager/task-tracker.json'),
        JSON.stringify(cfg)
      );
      for (const label of [
        'Supported model hooks',
        'Shared model guard',
        'Independent requirement',
      ]) {
        await verbAcStamp({
          cfg,
          projectDir: f.projectDir,
          statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'),
          rest: [label],
          pexec: f.pexec,
          deps: { revisionBackend: f.backend, getLiveState: async () => 'develop' },
        });
        await verbEnsureChecked({
          cfg,
          projectDir: f.projectDir,
          statePath: path.join(f.projectDir, '.ai-task-manager/task-tracker-state.json'),
          rest: [label],
          pexec: f.pexec,
          deps: { revisionBackend: f.backend },
        });
        assert.equal(
          (await observeRevision({ context: f.context, deps: f.backend })).status,
          'applied'
        );
      }
      assert.equal((await f.invoke()).error, undefined);
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: f.projectDir,
        encoding: 'utf8',
      }).trim();
      const trail = updateMarker(
        appendCommitRow(
          buildInitialTrail({ issueNumber: f.context.issue }),
          buildRow({
            sha,
            subject: 'Meaningful native Test fixture',
            author: 'sandbox',
            ts: '2026-09-30T12:00:00Z',
          })
        ),
        sha
      );
      f.restart((snapshot) => {
        snapshot.lifecycleSources = rawLifecycleSources(snapshot.observation);
        snapshot.lifecycleSources.remote.comments.commit[0].response = [
          { id: 'IC_native_trail', body: trail },
        ];
        // A ready baseline has no exception requirement and performs no workflow comment query.
        snapshot.lifecycleSources.remote.comments.workflow = [];
        if (typeof expectStage === 'string') {
          snapshot.lifecycleSources.remote.assignments = nativeAssignmentPairs(f.context, true);
          snapshot.lifecycleSources.remote.stageItem = nativeStageItemPairs(f.context, cfg);
          const allComments = [...snapshot.comments, { id: 'IC_native_trail', body: trail }];
          if (expectStage === 'actor-publication-existing')
            allComments.push({ id: 'IC_existing_timing', body: initialTimingComment() });
          snapshot.lifecycleSources.remote.comments.commit[0].response = allComments;
          snapshot.lifecycleSources.remote.timing = nativeTimingSources(f.context, allComments);
          snapshot.lifecycleSources.remote.stageComments = {
            request: {
              file: 'gh',
              args: [
                'api',
                '--paginate',
                '--slurp',
                `repos/${f.context.repository}/issues/${f.context.issue}/comments`,
              ],
            },
            response: {
              stdout: JSON.stringify([
                allComments.map((comment, index) => ({
                  id: index + 101,
                  node_id: comment.id,
                  body: comment.body,
                  issue_url: `https://api.github.com/repos/${f.context.repository}/issues/${f.context.issue}`,
                  user: { login: 'native-fixture-owner' },
                })),
              ]),
              stderr: '',
              exitCode: 0,
            },
          };
          snapshot.lifecycleSources.remote.identity = {
            request: { file: 'gh', args: ['api', 'user', '--jq', '.login'] },
            response: { stdout: 'native-fixture-owner\n', stderr: '', exitCode: 0 },
          };
          if (statusModes.includes(expectStage)) {
            const [owner, repo] = f.context.repository.split('/');
            snapshot.lifecycleSources.remote.stageStatus = {
              schema: 'aitm.native-stage-status-source/v1',
              reads: [
                {
                  attempt: 1,
                  request: {
                    query: STATUS_OPTION_QUERY,
                    variables: { owner, repo, issue: f.context.issue },
                  },
                  response: { stdout: '{}', stderr: '', exitCode: 0 },
                },
              ],
            };
            const target = {
              stdout: JSON.stringify({
                data: {
                  repository: {
                    issue: {
                      projectItems: {
                        nodes: [
                          {
                            project: { id: cfg.projectId },
                            fieldValueByName: { optionId: cfg.kanbanOptionTest },
                          },
                        ],
                      },
                    },
                  },
                },
              }),
              stderr: '',
              exitCode: 0,
            };
            const empty = { stdout: '{}', stderr: '', exitCode: 0 };
            const variants = {
              'status-source-read': [empty, target],
              'status-source-prefix': [empty, target],
              'status-source-late-config': [empty, target],
              'status-source-late-vector': [empty, target],
              'status-source-custody-input': [empty, target],
              'status-source-custody-output': [empty, target],
              'status-source-custody-error': [
                { stdout: 'partial', stderr: 'terminated', exitCode: null },
                target,
              ],
              'status-source-unreleased': [empty],
              'status-source-close': [
                { stdout: 'partial', stderr: 'terminated', exitCode: null },
                { stdout: 'failed', stderr: 'refused', exitCode: 3 },
                target,
              ],
              'status-source-parse': [
                { stdout: '{', stderr: '', exitCode: 0 },
                {
                  stdout: '{"errors":[{"message":"native query failed"}]}',
                  stderr: '',
                  exitCode: 0,
                },
                target,
              ],
              'status-source-parser': [
                {
                  stdout: '{"data":{"repository":{"issue":{"projectItems":{"nodes":{}}}}}}',
                  stderr: '',
                  exitCode: 0,
                },
                target,
              ],
              'status-source-values': [
                { stdout: '{"data":null}', stderr: '', exitCode: 0 },
                { ...target, stdout: target.stdout.replace('OPTION_test', 'OPTION_develop') },
                target,
              ],
              'status-source-unused': [target, empty],
              'status-source-exhausted': [empty, empty, empty],
            };
            const request = snapshot.lifecycleSources.remote.stageStatus.reads[0].request;
            snapshot.lifecycleSources.remote.stageStatus.reads = variants[expectStage].map(
              (response, index) => ({
                attempt: index + 1,
                request: structuredClone(request),
                response: structuredClone(response),
              })
            );
          }
        }
      });
      if (typeof expectStage === 'string') {
        const runtime = await import('../../../../task-tracker/runtime.mjs');
        const { loadState, saveState } = await import('../../../../task-tracker/state.mjs');
        const { saveMarker, markerPathFor } =
          await import('../../../../task-tracker/word-counter.mjs');
        const transcriptDir = path.join(f.projectDir, '.tmp/aitm/native-stage-transcripts');
        mkdirSync(transcriptDir, { recursive: true });
        process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = transcriptDir;
        writeFileSync(
          path.join(transcriptDir, `${currentSessionId()}.jsonl`),
          JSON.stringify({
            type: 'assistant',
            message: { content: 'native stage captured words' },
          }) + '\n'
        );
        const nativeContext = runtime.buildContext(['status']);
        assert.equal(nativeContext.projectDir, f.projectDir);
        assert.equal(nativeContext.cfg.kanbanFieldId, 'PVTF_status');
        assert.equal(nativeContext.cfg.kanbanOptionTest, 'OPTION_test');
        saveMarker(markerPathFor(currentSessionId()), 0, 0, `#${f.context.issue}`, 0);
        saveState(
          {
            ...loadState(nativeContext.statePath),
            active: `#${f.context.issue}`,
            entryStartTs: new Date(Date.now() - 2000).toISOString(),
            lastWordMarker: 0,
            lastFullWordMarker: 0,
          },
          nativeContext.statePath
        );
        assert.equal(loadState(nativeContext.statePath).active, `#${f.context.issue}`);
        if (expectStage === 'actor-cursor-absent') rmSync(markerPathFor(currentSessionId()));
        if (expectStage === 'actor-cursor-legacy')
          writeFileSync(
            markerPathFor(currentSessionId()),
            JSON.stringify({
              legacyNote: 'preserve original',
              wordCount: { line: 0, words: 0, sticky: 'keep native field' },
            })
          );
      }
      const before = structuredClone(f.backend.snapshot);
      const ctx = {
        cfg,
        projectDir: f.projectDir,
        issueArg: String(f.context.issue),
        stateArg: 'test',
        resolvedFromState: 'develop',
        plan: { runGuardPipeline: true },
        revisionBackend: f.backend,
      };
      if (
        [
          'board',
          'board-prefix',
          'board-exception',
          'board-exception-prefix',
          'sentinel-data',
          'sentinel-history',
          'sentinel-intent',
          'sentinel-complete',
          'sentinel-prefix',
        ].includes(faultMode) ||
        sentinelLate ||
        statusModes.includes(expectStage)
      ) {
        const nativeProject = await import('../../../../gh/lib/github-projects.mjs');
        ctx.gh = nativeProject.gh;
        ctx.projectItemForIssue = nativeProject.projectItemForIssue;
        ctx.optionId = cfg.kanbanOptionTest;
      }
      const evaluation = await withRevisionConsumer(
        {
          repository: f.context.repository,
          issue: f.context.issue,
          activity: 'stage-write',
          backend: f.backend,
          projectDir: f.projectDir,
        },
        () => evaluateNativeRevisionStageGuards(ctx)
      );
      t.diagnostic(JSON.stringify(evaluation));
      assert.equal(evaluation.guardResult.ok, true, JSON.stringify(evaluation.guardResult));
      assert.equal(evaluation.guardReads.length, evaluation.guardInvocations.length);
      for (const reads of evaluation.guardReads) {
        assert.deepEqual(
          reads.map((entry) => entry.invocation.guardId),
          ['develop-exit-code-complete', 'develop-exit-receipt', 'develop-exit-commit-trail-head']
        );
        const code = reads[0].data,
          receipt = reads[1].data,
          head = reads[2].data;
        assert.equal(receipt.projectDir, f.projectDir);
        assert.equal(receipt.head.cwd, f.projectDir);
        assert.equal(receipt.head.stdout.trim(), sha);
        assert.equal(receipt.head.exitCode, 0);
        assert.equal(
          code.bodyHash,
          createHash('sha256').update(f.backend.observation.body.bytes.trim()).digest('hex')
        );
        assert.equal(code.reads[0].stdout.trim(), f.projectDir);
        assert.ok(code.reads.every((read) => read.cwd === f.projectDir && read.exitCode === 0));
        assert.equal(code.ancestry.identity.worktreePath, f.projectDir);
        assert.ok(code.ancestry.reads.length > 0);
        assert.ok(
          code.ancestry.reads.every((read) => read.cwd === f.projectDir && read.exitCode === 0)
        );
        assert.equal(head.projectDir, f.projectDir);
        assert.equal(head.reads[0].stdout.trim(), sha);
        assert.equal(head.attribution, null);
        assert.ok(Object.isFrozen(code.ancestry.reads) && Object.isFrozen(head.reads));
      }
      if (expectStage === 'historical') {
        const stage =
          await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
        const observed = await observeRevision({ context: f.context, deps: f.backend });
        const { homedir } = await import('node:os');
        const input = {
          observation: observed.observation,
          definitions: observed.effectiveProposal.after.definitions,
          proofs: f.backend.snapshot.nativeProofRecords,
          lifecycleSources: f.backend.snapshot.lifecycleSources,
          sources: {
            schema: 'aitm.native-stage-sources/v1',
            repository: f.context.repository,
            projectDir: f.projectDir,
            homeDir: homedir(),
            sessionId: currentSessionId(),
            ...evaluation.localReads,
          },
          invocations: evaluation.guardInvocations,
          gitReads: evaluation.guardReads,
        };
        const replayed = await stage.reconstructNativeStageGuardEvidence(input);
        assert.equal(replayed.headSha, sha);
        assert.deepEqual(replayed.invocations, evaluation.guardInvocations);
        assert.equal(replayed.receipt.journalId, f.backend.snapshot.nativeProofRecords.at(-1).id);
        assert.ok(Object.isFrozen(replayed));
        assert.equal(replayed.owner, 'native-fixture-owner');
        assert.deepEqual(replayed.assignment, evaluation.assignmentReads);
        const { canonicalRecordJson } =
          await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
        assert.deepEqual(
          await stage.reconstructNativeStageGuardEvidence(JSON.parse(canonicalRecordJson(input))),
          replayed
        );
        const remoteInput = {
          observation: input.observation,
          lifecycleSources: input.lifecycleSources,
          retained: f.backend.comments,
          projectId: cfg.projectId,
          kanbanFieldId: cfg.kanbanFieldId,
        };
        const resources = await stage.deriveRecordedStageRemoteResources(remoteInput);
        const resourceFile = path.join(f.projectDir, '.tmp/aitm/recorded-stage-remote.json');
        writeFileSync(resourceFile, canonicalRecordJson(remoteInput));
        const persistedResources = await stage.deriveRecordedStageRemoteResources(
          JSON.parse(readFileSync(resourceFile, 'utf8'))
        );
        assert.deepEqual(persistedResources, resources);
        assert.equal(resources.membership.projectId, 'PVT_fixture');
        assert.equal(resources.membership.itemId, 'PVTI_subject');
        assert.equal(
          JSON.parse(resources.membership.bytes).fieldValues.nodes[0].optionId,
          'OPTION_develop'
        );
        assert.equal(resources.comments.length, f.backend.comments.length + 1);
        for (const comment of f.backend.comments) {
          const resource = resources.comments.find((value) => value.nodeId === comment.id);
          assert.equal(JSON.parse(resource.bytes).body, comment.body);
        }
        for (const [label, change] of [
          [
            'missing original census',
            (value) => {
              delete value.lifecycleSources.remote.stageComments;
            },
          ],
          [
            'changed timing census',
            (value) => {
              value.lifecycleSources.remote.timing.pages[0].response.data.repository.issue.comments.nodes[0].body +=
                'changed';
            },
          ],
          [
            'unrelated retained record',
            (value) => {
              value.retained.push({ id: 'foreign', body: 'not original' });
            },
          ],
          [
            'copied allow',
            (value) => {
              value.ready = true;
            },
          ],
        ]) {
          const bad = structuredClone(remoteInput);
          change(bad);
          await assert.rejects(
            stage.deriveRecordedStageRemoteResources(bad),
            (error) => error.message.includes('native-stage-remote-resources'),
            label
          );
        }
        for (const [label, change] of [
          [
            'missing original identity',
            (value) => {
              delete value.lifecycleSources.remote.identity;
            },
          ],
          [
            'missing original owner',
            (value) => {
              for (const pair of [
                ...value.lifecycleSources.remote.assignments.pages,
                ...value.lifecycleSources.remote.assignments.final,
              ])
                pair.response.repository.issue.assignees.nodes = [];
            },
          ],
          [
            'multiple original owners',
            (value) => {
              for (const pair of [
                ...value.lifecycleSources.remote.assignments.pages,
                ...value.lifecycleSources.remote.assignments.final,
              ])
                pair.response.repository.issue.assignees.nodes.push({ login: 'second-owner' });
            },
          ],
          [
            'unused original membership',
            (value) => {
              const pair = structuredClone(value.lifecycleSources.remote.assignments.pages[0]);
              pair.request.cursor = 'unused';
              value.lifecycleSources.remote.assignments.pages.push(pair);
            },
          ],
          [
            'foreign original owner',
            (value) => {
              value.lifecycleSources.remote.identity.response.stdout = 'foreign-owner\n';
            },
          ],
          [
            'failed original identity',
            (value) => {
              value.lifecycleSources.remote.identity.response.exitCode = 1;
            },
          ],
          [
            'incomplete original membership',
            (value) => {
              delete value.lifecycleSources.remote.assignments.pages[0].response.repository.issue
                .projectItems.pageInfo.hasNextPage;
            },
          ],
          [
            'owner changed at original final read',
            (value) => {
              value.lifecycleSources.remote.assignments.final[0].response.repository.issue.assignees.nodes =
                [{ login: 'foreign-owner' }];
            },
          ],
          [
            'missing invocation',
            (value) => {
              value.invocations[0].pop();
            },
          ],
          [
            'reordered invocation',
            (value) => {
              value.invocations[0].reverse();
            },
          ],
          [
            'missing original Git leaf',
            (value) => {
              value.gitReads[0][0].data.reads.pop();
            },
          ],
          [
            'failed original Git leaf',
            (value) => {
              value.gitReads[0][0].data.reads[1].exitCode = 1;
            },
          ],
          [
            'foreign native Git root',
            (value) => {
              value.gitReads[0][0].data.reads[0].cwd = path.dirname(f.projectDir);
            },
          ],
          [
            'current saved success',
            (value) => {
              value.guardResult = { ok: true };
            },
          ],
          [
            'missing receipt execution',
            (value) => {
              value.proofs = value.proofs.filter(
                (j) => j.execution.schema !== 'aitm.native-develop-final-execution/v1'
              );
            },
          ],
          [
            'foreign parent subject',
            (value) => {
              value.lifecycleSources.remote.parent[0].request.issue++;
            },
          ],
          [
            'extra raw reader authority',
            (value) => {
              value.lifecycleSources.remote.parent[0].response.repository.issue.ready = true;
            },
          ],
        ]) {
          const bad = structuredClone(input);
          change(bad);
          await assert.rejects(
            stage.reconstructNativeStageGuardEvidence(bad),
            /criteria-revision:native-stage-guard-evidence/,
            label
          );
        }
        assert.deepEqual(f.backend.snapshot, before);
        return;
      }
      if (typeof expectStage === 'string') {
        assert.equal(evaluation.ownershipReads.decision.kind, 'owned-by-session');
        assert.equal(evaluation.assignmentReads.reads.length, 3);
        assert.equal(evaluation.assignmentReads.snapshot.state, 'develop');
      }
      const captureFiles = () =>
        Object.fromEntries(
          readdirSync(f.projectDir, { recursive: true })
            .sort()
            .map((name) => [
              name,
              statSync(path.join(f.projectDir, name)).isFile()
                ? createHash('sha256')
                    .update(readFileSync(path.join(f.projectDir, name)))
                    .digest('hex')
                : 'directory',
            ])
        );
      if (expectStage === 'root-adapter') {
        const storage = await import('../../../../task-tracker/lib/runtime-storage.mjs');
        const files = captureFiles(),
          reads = [];
        f.backend.failAfter = 'native-stage-journal-write';
        await assert.rejects(
          storage.withRuntimeRootAdapters(
            {
              readIdentity(directory) {
                reads.push(directory);
                return storage.readPhysicalRuntimeIdentity(directory);
              },
            },
            () => moveState(ctx)
          ),
          (error) => error.code === 'revision-authority-unavailable'
        );
        t.diagnostic(
          JSON.stringify({
            reads,
            operations: f.backend.effects,
            records: f.backend.snapshot.nativeStageRecords?.length ?? 0,
          })
        );
        assert.equal(
          f.backend.effects.some((effect) => effect.startsWith('native-stage-')),
          false
        );
        assert.equal(
          f.backend.snapshot.nativeStageRecords?.length ?? 0,
          0,
          'substituted root source cannot admit original stage history'
        );
        assert.deepEqual(f.backend.snapshot, before);
        assert.deepEqual(captureFiles(), files);
        const { AsyncLocalStorage } = await import('node:async_hooks');
        const originalRun = AsyncLocalStorage.prototype.run;
        const sentinel = {},
          lateReads = [];
        let actualScope;
        try {
          AsyncLocalStorage.prototype.run = function (store, callback, ...args) {
            if (store === sentinel) actualScope = this;
            return Reflect.apply(originalRun, this, [store, callback, ...args]);
          };
          storage.withRuntimeRootAdapters(sentinel, () => {});
        } finally {
          AsyncLocalStorage.prototype.run = originalRun;
        }
        assert.ok(actualScope);
        const { default: childProcess } = await import('node:child_process');
        const { syncBuiltinESMExports } = await import('node:module');
        const previousStore = actualScope.getStore(),
          originalExec = childProcess.execFileSync;
        let introduced = false,
          injectedSnapshot,
          injectedFiles,
          operationStart;
        childProcess.execFileSync = function (file, args, options) {
          const value = Reflect.apply(originalExec, this, arguments);
          if (
            !introduced &&
            file === 'git' &&
            new Error().stack.includes('at checkOriginalStageSources')
          ) {
            introduced = true;
            injectedSnapshot = f.backend.snapshot;
            injectedFiles = captureFiles();
            operationStart = f.backend.effects.length;
            actualScope.enterWith({
              readIdentity(directory) {
                lateReads.push(directory);
                return storage.readPhysicalRuntimeIdentity(directory);
              },
            });
          }
          return value;
        };
        syncBuiltinESMExports();
        try {
          const result = await moveState(freshStageContext(ctx));
          t.diagnostic(
            JSON.stringify({
              lateAdapter: {
                introduced,
                result,
                lateReads,
                operations: f.backend.effects.slice(operationStart),
              },
            })
          );
          assert.equal(introduced, true);
          assert.equal(result.code, 'revision-authority-unavailable');
          assert.equal(result.preparationReason, 'complete-original-current-sources');
          assert.deepEqual(lateReads, []);
          const allowed = new Set([
            'authority-read',
            'page-read',
            'native-history-readback',
            'native-proof-record-readback',
            'admission-deny',
          ]);
          assert.ok(f.backend.effects.slice(operationStart).every((effect) => allowed.has(effect)));
          assert.deepEqual(f.backend.snapshot, injectedSnapshot);
          assert.deepEqual(captureFiles(), injectedFiles);
        } finally {
          childProcess.execFileSync = originalExec;
          syncBuiltinESMExports();
          actualScope.enterWith(previousStore);
        }
        return;
      }
      if (
        [
          'status-source-custody-input',
          'status-source-custody-output',
          'status-source-custody-error',
        ].includes(expectStage)
      ) {
        // Test-local observation of actual lexical inputs, never a product port or
        // a claim that public callers can obtain these private references.
        const { default: childProcess } = await import('node:child_process');
        const { syncBuiltinESMExports } = await import('node:module');
        const core = await import('../../../../task-tracker/lib/move-state/move-state-core.mjs');
        const originalExec = childProcess.execFileSync,
          originalDescriptors = Object.getOwnPropertyDescriptors;
        const originalClone = globalThis.structuredClone,
          files = captureFiles();
        let request,
          output,
          introduced = false,
          sourcePositive = false,
          copiesRefused = 0;
        let injectedSnapshot,
          operationStart,
          requestCaptures = 0,
          outputCaptures = 0;
        Object.getOwnPropertyDescriptors = function (value) {
          const descriptors = Reflect.apply(originalDescriptors, this, arguments);
          const stack = new Error().stack;
          if (
            !request &&
            stack.includes('at registerBoardRequest') &&
            stack.includes('at runStatusWriteAdmitted') &&
            Reflect.ownKeys(descriptors).sort().join(',') === 'cfg,issueNumber'
          ) {
            request = value;
            requestCaptures++;
          }
          return descriptors;
        };
        globalThis.structuredClone = function (value) {
          const result = Reflect.apply(originalClone, this, arguments);
          const stack = new Error().stack.split('\n');
          if (
            !output &&
            stack[2]?.includes('at clone') &&
            stack[3]?.includes('readMemoryNativeStageBoardStatus') &&
            value &&
            Object.keys(value).sort().join(',') === 'exitCode,stderr,stdout'
          ) {
            output = result;
            outputCaptures++;
          }
          return result;
        };
        childProcess.execFileSync = function (file, args, options) {
          const value = Reflect.apply(originalExec, this, arguments);
          const stack = new Error().stack;
          if (
            !introduced &&
            file === 'git' &&
            stack.includes('at checkOriginalStageSources') &&
            stack.includes('at Module.recordNativeStageBoardStatusSource')
          ) {
            introduced = true;
            assert.ok(
              request && output,
              'actual lexical status input and direct memory return captured'
            );
            assert.deepEqual(
              core.readNativeStageStatusSourceResponse(request, output),
              before.lifecycleSources.remote.stageStatus.reads[0].response
            );
            sourcePositive = true; // Detached DATA only, under genuine existing custody.
            assert.throws(
              () => core.readNativeStageStatusSourceResponse({ ...request }, output),
              (error) => error instanceof TypeError && error.message === 'native-board-request'
            );
            copiesRefused++;
            assert.throws(
              () => core.readNativeStageStatusSourceResponse(request, originalClone(output)),
              (error) =>
                error.code === 'revision-authority-unavailable' &&
                error.preparationReason === 'original-board-status-source'
            );
            copiesRefused++;
            if (expectStage === 'status-source-custody-input') request.issueNumber = '999';
            else if (expectStage === 'status-source-custody-error')
              output.stderr = 'altered original close bytes';
            else output.stdout = '{"data":null}';
            injectedSnapshot = f.backend.snapshot;
            operationStart = f.backend.effects.length;
          }
          return value;
        };
        syncBuiltinESMExports();
        let result;
        try {
          result = await moveState(ctx);
        } finally {
          childProcess.execFileSync = originalExec;
          syncBuiltinESMExports();
          Object.getOwnPropertyDescriptors = originalDescriptors;
          globalThis.structuredClone = originalClone;
        }
        t.diagnostic(
          JSON.stringify({
            originalStatusCustody: {
              introduced,
              requestCaptures,
              outputCaptures,
              sourcePositive,
              copiesRefused,
              result,
              operations: f.backend.effects.slice(operationStart),
            },
          })
        );
        assert.equal(introduced, true);
        assert.equal(requestCaptures, 1);
        assert.equal(outputCaptures, 1);
        assert.equal(sourcePositive, true);
        assert.equal(copiesRefused, 2);
        assert.equal(result.exit, 4);
        assert.equal(result.code, 'revision-authority-unavailable');
        assert.deepEqual(f.backend.snapshot, injectedSnapshot);
        assert.deepEqual(f.backend.effects.slice(operationStart), []);
        const board = injectedSnapshot.nativeStageRecords[0].steps[13];
        assert.equal(board.attempts.length, 1);
        assert.equal(board.attempts[0].write.kind, 'returned');
        assert.equal(board.attempts[0].read, null);
        assert.equal(board.attempts[0].after, null);
        assert.equal(board.outcome, null);
        assert.equal(board.readback, null);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (['status-source-late-config', 'status-source-late-vector'].includes(expectStage)) {
        // Removing the post-await current checks must expose another durable record
        // after this genuine original parser boundary; no native read is replaced.
        const { default: childProcess } = await import('node:child_process');
        const { syncBuiltinESMExports } = await import('node:module');
        const core = await import('../../../../task-tracker/lib/move-state/move-state-core.mjs');
        const nativeBoard =
          await import('../../../../task-tracker/lib/move-state/github-mutation.mjs');
        const originalExec = childProcess.execFileSync;
        const configFile = path.join(f.projectDir, '.ai-task-manager/task-tracker.json');
        const configBytes = readFileSync(configFile, 'utf8'),
          files = captureFiles();
        let introduced = false,
          injectedSnapshot,
          operationStart,
          gets = 0,
          refused = 0;
        childProcess.execFileSync = function (file, args, options) {
          const value = Reflect.apply(originalExec, this, arguments);
          const stack = new Error().stack;
          if (
            !introduced &&
            file === 'git' &&
            stack.includes('at checkOriginalStageSources') &&
            stack.includes('at Module.recordNativeStageBoardStatusSource')
          ) {
            introduced = true;
            const publicShape = { cfg, issueNumber: f.context.issue };
            const getter = { issueNumber: f.context.issue };
            Object.defineProperty(getter, 'cfg', {
              enumerable: true,
              get() {
                gets++;
                return cfg;
              },
            });
            for (const input of [
              publicShape,
              structuredClone(publicShape),
              getter,
              Object.create(publicShape),
              {
                ...publicShape,
                response: before.lifecycleSources.remote.stageStatus.reads[0].response,
              },
            ]) {
              assert.throws(
                () =>
                  core.readNativeStageStatusSourceResponse(
                    input,
                    structuredClone(before.lifecycleSources.remote.stageStatus.reads[0].response)
                  ),
                (error) => error instanceof TypeError && error.message === 'native-board-request'
              );
              assert.throws(
                () => nativeBoard.readOriginalNativeBoardStatus(input, {}),
                (error) =>
                  error instanceof TypeError && error.message === 'native-board-status-custody'
              );
              refused++;
            }
            assert.equal(gets, 0);
            if (expectStage === 'status-source-late-config')
              writeFileSync(
                configFile,
                JSON.stringify({ ...cfg, kanbanOptionTest: 'OPTION_changed' })
              );
            else
              f.backend.addComment({
                id: 'IC_late_unowned',
                body: 'unowned late authority resource',
              });
            injectedSnapshot = f.backend.snapshot;
            operationStart = f.backend.effects.length;
          }
          return value;
        };
        syncBuiltinESMExports();
        let result;
        try {
          result = await moveState(ctx);
        } finally {
          childProcess.execFileSync = originalExec;
          syncBuiltinESMExports();
          writeFileSync(configFile, configBytes);
        }
        t.diagnostic(
          JSON.stringify({
            lateStatus: {
              introduced,
              refused,
              gets,
              result,
              operations: f.backend.effects.slice(operationStart),
            },
          })
        );
        assert.equal(introduced, true, 'actual original recording source boundary reached');
        assert.equal(refused, 5);
        assert.equal(gets, 0);
        assert.equal(result.exit, 4);
        assert.equal(result.code, 'revision-authority-unavailable');
        assert.deepEqual(f.backend.snapshot, injectedSnapshot);
        assert.deepEqual(f.backend.effects.slice(operationStart), []);
        const board = injectedSnapshot.nativeStageRecords[0].steps[13];
        assert.equal(board.attempts.length, 1);
        assert.equal(board.attempts[0].write.kind, 'returned');
        assert.equal(board.attempts[0].read, null);
        assert.equal(board.attempts[0].after, null);
        assert.equal(board.outcome, null);
        assert.equal(board.readback, null);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (expectStage === 'status-source-prefix') {
        const { when, suffix } = fault;
        const point =
          suffix === 'write'
            ? 'native-stage-board-attempt-readback'
            : 'native-stage-board-source-readback';
        f.backend[when] = point;
        const files = captureFiles();
        const result = await moveState(ctx);
        t.diagnostic(JSON.stringify({ result, operations: f.backend.effects }));
        assert.equal(result.exit, 4);
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0],
          board = journal.steps[13];
        assert.equal(journal.steps.length, 14);
        assert.equal(board.attempts.length, 1);
        const recorded = suffix === 'readback' || when === 'failAfter';
        assert.equal(board.attempts[0].read !== null, recorded);
        assert.equal(board.attempts[0].after !== null, recorded);
        if (recorded) {
          assert.deepEqual(
            board.attempts[0].read.transport,
            before.lifecycleSources.remote.stageStatus.reads[0].response
          );
          assert.deepEqual(board.attempts[0].read.result, { kind: 'undefined' });
          assert.deepEqual(board.attempts[0].read.status, { kind: 'returned', value: '' });
          assert.deepEqual(board.attempts[0].after, {
            stage: 'test',
            membership: snapshot.nativeStageResources.membership,
          });
        }
        assert.equal(board.outcome, null);
        assert.equal(board.readback, null);
        assert.deepEqual(journal.header.guardCapture.lifecycleSources, before.lifecycleSources);
        for (const name of [
          'native-stage-board-attempt-intent-write',
          'native-stage-board-effect-write',
        ])
          assert.equal(f.backend.effects.filter((value) => value === name).length, 1);
        assert.equal(f.backend.effects.includes('native-stage-board-outcome-write'), false);
        assert.equal(snapshot.observation.stage, 'test');
        const item = JSON.parse(snapshot.nativeStageResources.membership.bytes);
        const expectedItem = JSON.parse(journal.header.original.resources.membership.bytes);
        const status = expectedItem.fieldValues.nodes.find(
          (value) => value.field.id === cfg.kanbanFieldId
        );
        status.name = 'Test';
        status.optionId = cfg.kanbanOptionTest;
        assert.deepEqual(item, expectedItem);
        const recovered = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        assert.equal(
          (await observeRevision({ context: f.context, deps: recovered })).status,
          'pending-native-stage'
        );
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: recovered,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (statusModes.includes(expectStage) && expectStage !== 'status-source-unreleased') {
        const files = captureFiles();
        const result = await moveState(ctx);
        t.diagnostic(
          JSON.stringify({
            result,
            operations: f.backend.effects,
            records: f.backend.snapshot.nativeStageRecords?.length ?? 0,
          })
        );
        const journal = f.backend.snapshot.nativeStageRecords?.[0];
        assert.equal(
          journal?.steps.length ?? 0,
          14,
          'source-selection frontier before native reader invocation'
        );
        const board = journal.steps[13];
        const raw = before.lifecycleSources.remote.stageStatus.reads;
        const expectedCount = expectStage === 'status-source-unused' ? 1 : raw.length;
        assert.equal(board.attempts.length, expectedCount);
        assert.deepEqual(
          board.attempts.map((value) => value.read.transport),
          raw.slice(0, expectedCount).map((value) => value.response)
        );
        if (expectStage === 'status-source-unused') {
          assert.equal(board.outcome, null);
          assert.equal(board.readback, null);
          assert.equal(f.backend.effects.includes('native-stage-board-outcome-write'), false);
        } else if (expectStage === 'status-source-exhausted') {
          assert.deepEqual(board.outcome, { kind: 'unconfirmed', attempt: 3, exit: 7 });
          assert.equal(board.readback, null);
        } else {
          assert.deepEqual(board.outcome, {
            kind: 'confirmed',
            attempt: expectedCount,
            exit: null,
          });
          assert.ok(board.readback);
          assert.equal(board.attempts.at(-1).read.status.value, cfg.kanbanOptionTest);
        }
        if (expectStage === 'status-source-read')
          assert.deepEqual(board.attempts[0].read.result, { kind: 'undefined' });
        if (expectStage === 'status-source-close') {
          assert.equal(board.attempts[0].read.error.code, null);
          assert.equal(board.attempts[1].read.error.code, 3);
          assert.equal(board.attempts[0].read.error.message, 'gh exited null: terminated');
          assert.equal(board.attempts[1].read.error.message, 'gh exited 3: refused');
        }
        if (expectStage === 'status-source-parse') {
          assert.equal(board.attempts[0].read.error.name, 'SyntaxError');
          assert.equal(board.attempts[1].read.error.message, 'native query failed');
        }
        if (expectStage === 'status-source-parser') {
          assert.equal(board.attempts[0].read.kind, 'returned');
          assert.equal(board.attempts[0].read.status.kind, 'threw');
          assert.equal(board.attempts[0].read.status.name, 'TypeError');
        }
        if (expectStage === 'status-source-values') {
          assert.deepEqual(board.attempts[0].read.result, { kind: 'json', value: null });
          assert.equal(board.attempts[1].read.status.value, cfg.kanbanOptionDevelop);
        }
        assert.equal(f.backend.observation.stage, 'test');
        const item = JSON.parse(f.backend.snapshot.nativeStageResources.membership.bytes);
        const expectedItem = JSON.parse(journal.header.original.resources.membership.bytes);
        const status = expectedItem.fieldValues.nodes.find(
          (value) => value.field.id === cfg.kanbanFieldId
        );
        status.name = 'Test';
        status.optionId = cfg.kanbanOptionTest;
        assert.deepEqual(item, expectedItem);
        assert.equal(
          f.backend.effects.filter((value) => value === 'native-stage-board-effect-write').length,
          expectedCount
        );
        assert.equal(
          f.backend.effects.filter((value) => value === 'native-stage-board-source-readback')
            .length,
          expectedCount
        );
        const recovered = createRevisionMemory(JSON.parse(JSON.stringify(f.backend.snapshot)));
        assert.equal(
          (await observeRevision({ context: f.context, deps: recovered })).status,
          'pending-native-stage'
        );
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: recovered,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (expectStage === 'status-source-unreleased') {
        // Historical presence-denial case now exercises the genuine missing-next
        // pair condition, retaining its original one-pair source and entrypoint.
        const files = captureFiles();
        const result = await moveState(ctx);
        t.diagnostic(JSON.stringify({ result, operations: f.backend.effects }));
        assert.equal(result.exit, 4);
        assert.equal(result.preparationReason, 'board-status-source');
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0];
        assert.equal(journal.steps.length, 14);
        const board = journal.steps[13];
        assert.equal(board.attempts.length, 1);
        assert.deepEqual(
          board.attempts[0].read.transport,
          before.lifecycleSources.remote.stageStatus.reads[0].response
        );
        assert.deepEqual(board.attempts[0].read.result, { kind: 'undefined' });
        assert.deepEqual(board.attempts[0].read.status, { kind: 'returned', value: '' });
        assert.equal(board.outcome, null);
        assert.equal(board.readback, null);
        for (const name of [
          'native-stage-board-attempt-intent-write',
          'native-stage-board-effect-write',
          'native-stage-board-attempt-readback',
          'native-stage-board-source-readback',
        ])
          assert.equal(f.backend.effects.filter((value) => value === name).length, 1, name);
        assert.equal(f.backend.effects.includes('native-stage-board-outcome-write'), false);
        const recovered = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        assert.equal(
          (await observeRevision({ context: f.context, deps: recovered })).status,
          'pending-native-stage'
        );
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: recovered,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (expectStage === 'transition-override') {
        const files = captureFiles();
        let accessors = 0;
        const supplied = 'move:11111111-1111-4111-8111-111111111111';
        const inherited = Object.create({ transitionId: supplied });
        Object.assign(inherited, ctx);
        const accessor = { ...ctx };
        Object.defineProperty(accessor, 'transitionId', {
          get() {
            accessors++;
            return supplied;
          },
        });
        for (const value of [{ ...ctx, transitionId: supplied }, inherited, accessor]) {
          let result, caught;
          try {
            result = await moveState(value);
          } catch (error) {
            caught = error;
          }
          t.diagnostic(
            JSON.stringify({
              result,
              records: f.backend.snapshot.nativeStageRecords?.length ?? 0,
              steps: f.backend.snapshot.nativeStageRecords?.at(-1)?.steps.length ?? 0,
            })
          );
          assert.equal(
            f.backend.snapshot.nativeStageRecords?.length ?? 0,
            0,
            'caller transition identity cannot seal a native stage record'
          );
          assert.equal(caught?.code, 'revision-authority-unavailable');
          assert.deepEqual(f.backend.snapshot, before);
          assert.deepEqual(captureFiles(), files);
        }
        assert.equal(accessors, 0);
        return;
      }
      if (expectStage === 'actor-override') {
        const files = captureFiles();
        await assert.rejects(
          moveState({ ...ctx, actor: 'caller-selected-actor' }),
          (error) => error.code === 'revision-authority-unavailable'
        );
        assert.deepEqual(f.backend.snapshot, before);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (expectStage === 'late-sources') {
        const { jsonlPath } = await import('../../../../task-tracker/word-counter.mjs');
        const configFile = path.join(f.projectDir, '.ai-task-manager/task-tracker.json');
        const sessionFile = evaluation.localReads.session.source.path;
        const transcriptFile = jsonlPath(currentSessionId());
        const configBytes = readFileSync(configFile, 'utf8'),
          transcriptBytes = readFileSync(transcriptFile, 'utf8');
        const originalTranscriptDir = process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR;
        const alternateDir = path.join(f.projectDir, '.tmp/aitm/alternate-native-transcripts');
        mkdirSync(alternateDir, { recursive: true });
        writeFileSync(path.join(alternateDir, `${currentSessionId()}.jsonl`), transcriptBytes);
        const originalNow = Date.now;
        for (const kind of [
          'configuration',
          'session',
          'transcript-prefix',
          'transcript-path',
          'HEAD',
        ]) {
          let changed = false,
            expectedFiles;
          const clockProbe = t.mock.method(Date, 'now', function () {
            const value = originalNow(),
              stack = new Error().stack;
            if (
              !changed &&
              stack.includes('at derivePlanExtension') &&
              stack.includes('at reconstructNativePlanRecord')
            ) {
              changed = true;
              queueMicrotask(() => {
                if (kind === 'configuration')
                  writeFileSync(
                    configFile,
                    JSON.stringify({ ...cfg, kanbanOptionTest: 'OPTION_foreign' })
                  );
                if (kind === 'session') {
                  mkdirSync(path.dirname(sessionFile), { recursive: true });
                  writeFileSync(sessionFile, '{}');
                }
                if (kind === 'transcript-prefix')
                  writeFileSync(
                    transcriptFile,
                    transcriptBytes.replace(
                      'native stage captured words',
                      'changed original transcript words'
                    )
                  );
                if (kind === 'transcript-path')
                  process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = alternateDir;
                if (kind === 'HEAD')
                  execFileSync(
                    'git',
                    ['commit', '--allow-empty', '-m', 'Native current HEAD drift'],
                    { cwd: f.projectDir }
                  );
                expectedFiles = captureFiles();
              });
            }
            return value;
          });
          try {
            const result = await moveState(freshStageContext(ctx));
            assert.equal(changed, true, kind);
            assert.equal(result.preparationReason, 'complete-original-current-sources', kind);
            assert.equal(result.code, 'revision-authority-unavailable', kind);
            assert.deepEqual(f.backend.snapshot, before, kind);
            assert.deepEqual(
              captureFiles(),
              expectedFiles,
              kind + ' no effects after external drift'
            );
          } finally {
            clockProbe.mock.restore();
            writeFileSync(configFile, configBytes);
            writeFileSync(transcriptFile, transcriptBytes);
            rmSync(sessionFile, { force: true });
            process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = originalTranscriptDir;
          }
        }
        return;
      }
      if (sentinelLate) {
        // A missing post-await continuity check must expose a getter or another
        // durable operation. All observations forward the actual native calls.
        const [phase, field, mutation] = sentinelLate;
        const originalDescriptors = Object.getOwnPropertyDescriptors;
        const originalReason = Object.getOwnPropertyDescriptor(
          Error.prototype,
          'preparationReason'
        );
        assert.equal(originalReason, undefined);
        const files = captureFiles(),
          errors = [];
        let captures = 0,
          injections = 0,
          gets = 0,
          selected = null,
          queuedFailure = null;
        let restoreTarget = null,
          restoreKey = null,
          restoreDescriptor = null;
        let injectedSnapshot, injectedFiles, effectStart;
        Object.defineProperty(Error.prototype, 'preparationReason', {
          configurable: true,
          get() {
            if (injections && new Error().stack.includes('at prepareNativeStageAtBoundary'))
              errors.push(this);
            return undefined;
          },
          set(value) {
            Object.defineProperty(this, 'preparationReason', {
              value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          },
        });
        Object.getOwnPropertyDescriptors = function (value) {
          const descriptors = Reflect.apply(originalDescriptors, this, arguments);
          const stack = new Error().stack;
          const caller =
            phase === 'persist'
              ? 'persistMemoryNativeStageSentinel'
              : 'writeMemoryNativeStageSentinel';
          const keys =
            phase === 'persist'
              ? 'backend,capability,context,invocation,step,token'
              : 'backend,capability,context,invocation,token';
          if (
            !selected &&
            stack.includes('at sentinelStoreInputContinuity') &&
            stack.includes(caller) &&
            Reflect.ownKeys(descriptors).sort().join(',') === keys
          ) {
            selected = value;
            captures++;
            queueMicrotask(() => {
              try {
                const snapshot = f.backend.snapshot,
                  journal = snapshot.nativeStageRecords[0];
                assert.ok(journal.steps.slice(0, 14).every((step) => step.readback !== null));
                assert.equal(journal.steps[13].outcome.kind, 'confirmed');
                assert.equal(journal.steps.length, phase === 'persist' ? 14 : 15);
                assert.deepEqual(
                  f.backend.effects.filter((op) => op.startsWith('native-stage-sentinel-')),
                  phase === 'persist'
                    ? []
                    : [
                        'native-stage-sentinel-intent-write',
                        'native-stage-sentinel-intent-readback',
                      ]
                );
                if (phase === 'effect') assert.equal(journal.steps[14].readback, null);
                const context = descriptors.context.value;
                restoreTarget =
                  mutation === 'context-identity'
                    ? context.executor
                    : mutation === 'context-accessor'
                      ? context
                      : value;
                restoreKey = field;
                restoreDescriptor = Object.getOwnPropertyDescriptor(restoreTarget, restoreKey);
                assert.ok(restoreDescriptor && Object.hasOwn(restoreDescriptor, 'value'));
                if (mutation.endsWith('accessor'))
                  Object.defineProperty(restoreTarget, restoreKey, {
                    enumerable: true,
                    configurable: true,
                    get() {
                      gets++;
                      throw new Error('late getter must not run');
                    },
                  });
                else
                  Object.defineProperty(restoreTarget, restoreKey, {
                    ...restoreDescriptor,
                    value: mutation === 'context-identity' ? 'changed-original-session' : {},
                  });
                injections++;
                injectedSnapshot = f.backend.snapshot;
                injectedFiles = captureFiles();
                effectStart = f.backend.effects.length;
              } catch (error) {
                queuedFailure = error;
              }
            });
          }
          return descriptors;
        };
        let result;
        try {
          result = await moveState(ctx);
        } finally {
          Object.getOwnPropertyDescriptors = originalDescriptors;
          if (restoreTarget && restoreDescriptor)
            Object.defineProperty(restoreTarget, restoreKey, restoreDescriptor);
          delete Error.prototype.preparationReason;
        }
        const expectedError =
          mutation === 'context-accessor'
            ? 'criteria-revision:native-stage-sentinel-context'
            : mutation === 'context-identity'
              ? 'criteria-revision:native-stage-sentinel-context-changed'
              : mutation === 'accessor'
                ? 'criteria-revision:native-stage-sentinel-input'
                : 'criteria-revision:native-stage-sentinel-input-changed';
        t.diagnostic(
          JSON.stringify({
            sentinelLate: {
              mode,
              phase,
              captures,
              injections,
              gets,
              queuedFailure: queuedFailure?.message ?? null,
              errors: errors.map((error) => ({
                name: error.name,
                message: error.message,
                stack: error.stack,
              })),
              result,
              operations: f.backend.effects.slice(effectStart),
            },
          })
        );
        assert.equal(queuedFailure, null);
        assert.equal(captures, 1);
        assert.equal(injections, 1);
        assert.equal(gets, 0);
        assert.equal(
          errors.length,
          1,
          'capture actual original asynchronous TypeError at native outer catch'
        );
        assert.ok(errors[0] instanceof TypeError);
        assert.equal(errors[0].message, expectedError);
        assert.equal(result.exit, 4);
        assert.equal(result.code, 'revision-authority-unavailable');
        assert.equal(result.preparationReason, 'native-source-unavailable');
        assert.deepEqual(f.backend.effects.slice(effectStart), []);
        assert.deepEqual(f.backend.snapshot, injectedSnapshot);
        assert.deepEqual(captureFiles(), injectedFiles);
        assert.deepEqual(captureFiles(), files);
        assert.equal(
          Object.getOwnPropertyDescriptor(Error.prototype, 'preparationReason'),
          undefined
        );
        return;
      }
      if (['sentinel-complete', 'sentinel-prefix'].includes(faultMode)) {
        const files = captureFiles(),
          originalDescriptors = Object.getOwnPropertyDescriptors(ctx);
        const operations = [
          'intent-write',
          'intent-readback',
          'effect-write',
          'effect-readback',
        ].map((suffix) => 'native-stage-sentinel-' + suffix);
        if (fault) f.backend[fault.when] = 'native-stage-sentinel-' + fault.suffix;
        const filesystem = (await import('node:fs')).default;
        const { syncBuiltinESMExports } = await import('node:module');
        const originalRead = filesystem.readFileSync;
        let beforeSentinel = null;
        filesystem.readFileSync = function (...args) {
          const value = originalRead.apply(this, args);
          if (!beforeSentinel && f.backend.effects.includes('native-stage-board-effect-readback')) {
            beforeSentinel = f.backend.snapshot;
          }
          return value;
        };
        syncBuiltinESMExports();
        let result;
        try {
          result = await moveState(ctx);
        } finally {
          filesystem.readFileSync = originalRead;
          syncBuiltinESMExports();
        }
        t.diagnostic(JSON.stringify({ result, operations: f.backend.effects }));
        assert.ok(beforeSentinel, 'capture follows actual native completed14');
        assert.equal(beforeSentinel.nativeStageRecords[0].steps.length, 14);
        assert.ok(
          beforeSentinel.nativeStageRecords[0].steps.every((step) => step.readback !== null)
        );
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0];
        const end = fault
          ? operations.indexOf('native-stage-sentinel-' + fault.suffix) +
            (fault.when === 'failAfter' ? 1 : 0)
          : 4;
        assert.equal(result.exit, 4, 'later leaves remain denied');
        assert.deepEqual(
          f.backend.effects.filter((op) => op.startsWith('native-stage-sentinel-')),
          operations.slice(0, end)
        );
        assert.equal(journal.steps.length, end === 0 ? 14 : 15);
        assert.deepEqual(journal.header, beforeSentinel.nativeStageRecords[0].header);
        assert.deepEqual(journal.steps.slice(0, 14), beforeSentinel.nativeStageRecords[0].steps);
        assert.deepEqual(snapshot.nativeStageResources, beforeSentinel.nativeStageResources);
        const expected = structuredClone(beforeSentinel);
        if (end > 0) {
          const step = journal.steps[14];
          assert.equal(step.kind, 'sentinel-body');
          assert.equal(step.ordinal, 15);
          assert.equal(step.readback === null, end < 4);
          expected.nativeStageRecords[0].steps.push(structuredClone(step));
          const codec =
            await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
          const data = await codec.reconstructNativeStageSentinel({
            header: journal.header,
            steps: journal.steps,
          });
          assert.deepEqual(data.beforeBody, beforeSentinel.observation.body);
          assert.deepEqual(data.resources, beforeSentinel.nativeStageResources);
          if (end >= 3) {
            assert.deepEqual(snapshot.observation.body, data.afterBody);
            assert.equal(
              snapshot.observation.body.version,
              beforeSentinel.observation.body.version + 1
            );
            const marker = `<!-- aitm-move-complete state=test ts=${step.intent.ts} move=${journal.header.intent.transitionId} -->`;
            assert.ok(snapshot.observation.body.bytes.includes(marker));
            assert.equal(
              snapshot.observation.body.bytes.split('<!-- aitm-move-complete ').length,
              2
            );
            expected.observation.body = structuredClone(data.afterBody);
          }
          if (end === 4) {
            assert.equal(step.readback.response.stdout, snapshot.observation.body.bytes + '\n');
            assert.equal(
              step.readback.resource.response.stdout,
              JSON.stringify({ body: snapshot.observation.body.bytes })
            );
            assert.deepEqual(Object.keys(JSON.parse(step.readback.resource.response.stdout)), [
              'body',
            ]);
          }
        }
        assert.deepEqual(
          snapshot,
          expected,
          'only sealed step15 and its exact body bytes may change'
        );
        assert.equal(
          Object.hasOwn(ctx, 'transitionEvidence'),
          Object.hasOwn(originalDescriptors, 'transitionEvidence')
        );
        assert.deepEqual(captureFiles(), files, 'complete recursive fixture files unchanged');
        const restarted = createRevisionMemory(snapshot);
        const observed = await observeRevision({ context: f.context, deps: restarted });
        assert.equal(observed.status, 'pending-native-stage', JSON.stringify(observed));
        assert.equal(observed.nativeHistoryApproved, false);
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: restarted,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        await assert.rejects(
          withRevisionConsumer(
            {
              repository: f.context.repository,
              issue: f.context.issue,
              activity: 'stage-write',
              backend: restarted,
              projectDir: f.projectDir,
            },
            () => {
              calls.push('stage');
            }
          ),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(restarted.snapshot, snapshot);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (faultMode === 'sentinel-intent') {
        const files = captureFiles();
        f.backend.failBefore = 'native-stage-sentinel-effect-write';
        const result = await moveState(ctx);
        t.diagnostic(JSON.stringify({ result, operations: f.backend.effects }));
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0];
        t.diagnostic(
          JSON.stringify({
            originalHeaderDifferences: Object.keys(before.observation).filter(
              (key) =>
                JSON.stringify(before.observation[key]) !==
                JSON.stringify(journal.header.original.observation[key])
            ),
          })
        );
        assert.equal(result.exit, 4);
        assert.equal(journal.steps[13].outcome.kind, 'confirmed');
        assert.ok(journal.steps.slice(0, 14).every((step) => step.readback !== null));
        assert.equal(
          journal.steps.length,
          15,
          'original sentinel intent must be stored before effect'
        );
        assert.equal(journal.steps[14].kind, 'sentinel-body');
        assert.equal(journal.steps[14].readback, null);
        assert.deepEqual(
          f.backend.effects.filter((op) => op.startsWith('native-stage-sentinel-')),
          ['native-stage-sentinel-intent-write', 'native-stage-sentinel-intent-readback']
        );
        assert.equal(
          snapshot.observation.body.bytes,
          JSON.parse(journal.steps[12].readback.resource.response.stdout).body
        );
        assert.equal(snapshot.observation.stage, 'test');
        const codec =
          await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
        const prior = await codec.reconstructNativeStageBoard({
          header: journal.header,
          steps: journal.steps.slice(0, 14),
        });
        assert.equal(prior.confirmed, true);
        assert.deepEqual(snapshot.nativeStageResources, prior.afterResources);
        assert.deepEqual(snapshot.observation.body, prior.body);
        const immutable = structuredClone({
          header: journal.header,
          steps: journal.steps.slice(0, 14),
        });
        assert.deepEqual(captureFiles(), files);
        const restarted = createRevisionMemory(snapshot);
        const observed = await observeRevision({ context: f.context, deps: restarted });
        assert.equal(observed.status, 'pending-native-stage');
        assert.equal(observed.nativeHistoryApproved, false);
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: restarted,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(restarted.snapshot, snapshot);
        assert.deepEqual(
          {
            header: f.backend.snapshot.nativeStageRecords[0].header,
            steps: f.backend.snapshot.nativeStageRecords[0].steps.slice(0, 14),
          },
          immutable
        );
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (['sentinel-data', 'sentinel-history'].includes(faultMode)) {
        const files = captureFiles();
        // Keep this historical DATA exercise rooted in actual completed14,
        // with the newly supported15 deliberately interrupted before intent.
        f.backend.failBefore = 'native-stage-sentinel-intent-write';
        const result = await moveState(ctx);
        assert.equal(result.exit, 4, 'sentinel intent deliberately interrupted');
        assert.deepEqual(
          f.backend.effects.filter((op) => op.startsWith('native-stage-sentinel-')),
          []
        );
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0];
        assert.equal(journal.steps.length, 14);
        assert.equal(journal.steps[13].outcome.kind, 'confirmed');
        assert.ok(journal.steps.every((step) => step.readback !== null));
        assert.deepEqual(captureFiles(), files);
        const operations = structuredClone(f.backend.effects);
        const codec =
          await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
        const { canonicalRecordJson } =
          await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
        const ts = new Date().toISOString();
        const step = {
          ordinal: 15,
          kind: 'sentinel-body',
          previous: hashBytes(canonicalRecordJson(journal.steps[13])),
          intent: { ts },
          readback: null,
        };
        assert.equal(typeof codec.reconstructNativeStageSentinel, 'function');
        const data = await codec.reconstructNativeStageSentinel({
          header: journal.header,
          steps: [...journal.steps, step],
        });
        assert.deepEqual(data.beforeBody, snapshot.observation.body);
        assert.deepEqual(data.resources, snapshot.nativeStageResources);
        assert.equal(data.stage, 'test');
        assert.equal(data.afterBody.version, snapshot.observation.body.version + 1);
        assert.ok(
          data.afterBody.bytes.includes(
            `<!-- aitm-move-complete state=test ts=${ts} move=${journal.header.intent.transitionId} -->`
          )
        );
        assert.equal(data.readbackBody, null);
        assert.ok(
          Object.isFrozen(data) &&
            Object.isFrozen(data.resources) &&
            Object.isFrozen(data.afterBody)
        );
        const input = { header: journal.header, steps: [...journal.steps, step] };
        assert.deepEqual(
          await codec.reconstructNativeStageSentinel(JSON.parse(canonicalRecordJson(input))),
          data
        );
        const { ghFetchArgs } =
          await import('../../../../task-tracker/lib/versioned-issue-write.mjs');
        const args = ghFetchArgs(f.context.repository, f.context.issue);
        const completed = structuredClone(input);
        completed.steps[14].readback = {
          request: { file: 'gh', args },
          response: { stdout: data.afterBody.bytes + '\n', stderr: '', exitCode: 0 },
          resource: {
            request: { file: 'gh', args: args.slice(0, -2) },
            response: {
              stdout: JSON.stringify({ body: data.afterBody.bytes }),
              stderr: '',
              exitCode: 0,
            },
          },
        };
        assert.equal(
          (await codec.reconstructNativeStageSentinel(completed)).readbackBody,
          data.afterBody.bytes
        );
        const failures = [
          [
            'extra authority field',
            (value) => {
              value.ready = true;
            },
          ],
          [
            'wrong ordinal',
            (value) => {
              value.steps[14].ordinal = 16;
            },
          ],
          [
            'wrong predecessor',
            (value) => {
              value.steps[14].previous = hashBytes('foreign');
            },
          ],
          [
            'early timestamp',
            (value) => {
              value.steps[14].intent.ts = '1970-01-01T00:00:00.000Z';
            },
          ],
          [
            'extra intent',
            (value) => {
              value.steps[14].intent.afterBody = data.afterBody.bytes;
            },
          ],
          [
            'unconfirmed board',
            (value) => {
              value.steps[13].readback = null;
              value.steps[14].previous = hashBytes(canonicalRecordJson(value.steps[13]));
            },
          ],
          [
            'altered independent membership',
            (value) => {
              const member = JSON.parse(value.steps[13].readback.membership.bytes);
              member.id = 'PVTI_foreign';
              value.steps[13].readback.membership.bytes = canonicalRecordJson(member);
              value.steps[14].previous = hashBytes(canonicalRecordJson(value.steps[13]));
            },
          ],
          [
            'foreign body resource',
            (value) => {
              value.steps[14].readback.resource.response.stdout = JSON.stringify({
                body: snapshot.observation.body.bytes,
              });
            },
          ],
          [
            'extra JSON body key',
            (value) => {
              value.steps[14].readback.resource.response.stdout = JSON.stringify({
                body: data.afterBody.bytes,
                ready: true,
              });
            },
          ],
          [
            'raw CLI mismatch',
            (value) => {
              value.steps[14].readback.response.stdout = snapshot.observation.body.bytes;
            },
          ],
        ];
        for (const [label, mutate] of failures) {
          const bad = structuredClone(completed);
          mutate(bad);
          await assert.rejects(codec.reconstructNativeStageSentinel(bad), label);
        }
        if (faultMode === 'sentinel-history') {
          const mutable = structuredClone(input);
          const pendingData = codec.reconstructNativeStageSentinel(mutable);
          mutable.steps[14].intent.ts = '1970-01-01T00:00:00.000Z';
          assert.deepEqual(await pendingData, data, 'closed DATA detaches before its first await');
          const rechain = (value) => {
            const { id, ...header } = value.header;
            value.header.id = hashBytes(canonicalRecordJson(header));
            // Preserve the actual deterministic memory allocation when rehashing
            // this coherent DATA negative; otherwise it fails before board semantics.
            const oldNode = `IC_memory_stage_${id.slice(7)}_2`;
            const newNode = `IC_memory_stage_${value.header.id.slice(7)}_2`;
            if (oldNode !== newNode)
              value.steps = JSON.parse(JSON.stringify(value.steps).split(oldNode).join(newNode));
            value.steps[0].previous = value.header.id;
            for (let i = 1; i < value.steps.length; i++)
              value.steps[i].previous = hashBytes(canonicalRecordJson(value.steps[i - 1]));
          };
          for (const [label, mutate] of [
            [
              'source option',
              (value) => {
                value.header.intent.sourceOptionId = 'OPTION_foreign';
              },
            ],
            [
              'write request',
              (value) => {
                value.steps[13].attempts[0].request.args[0] = 'foreign';
              },
            ],
            [
              'actual Status read',
              (value) => {
                value.steps[13].attempts[0].read.response.repository.issue.projectItems.nodes[0].fieldValueByName.optionId =
                  'OPTION_foreign';
              },
            ],
            [
              'outcome',
              (value) => {
                value.steps[13].outcome.exit = 7;
              },
            ],
          ]) {
            const bad = structuredClone(completed);
            mutate(bad);
            rechain(bad);
            await assert.rejects(
              codec.reconstructNativeStageSentinel(bad),
              (error) => String(error.message).startsWith('criteria-revision:'),
              label
            );
          }
          for (const phase of ['intended', 'effected', 'readback']) {
            const retained = structuredClone(snapshot);
            retained.nativeStageRecords[0] = structuredClone(
              phase === 'readback'
                ? { ...journal, steps: completed.steps }
                : { ...journal, steps: input.steps }
            );
            if (phase !== 'intended') retained.observation.body = structuredClone(data.afterBody);
            const recovered = createRevisionMemory(retained);
            const observed = await observeRevision({ context: f.context, deps: recovered });
            assert.equal(
              observed.status,
              'pending-native-stage',
              phase + ':' + JSON.stringify(observed)
            );
            const calls = [];
            await assert.rejects(
              mutateIssueBody({
                issueNumber: f.context.issue,
                repo: f.context.repository,
                mutate: (body) => {
                  calls.push('body');
                  return body;
                },
                deps: {
                  revisionBackend: recovered,
                  pexec: async () => {
                    calls.push('transport');
                  },
                },
              }),
              (error) => error.code === 'revision-pending'
            );
            assert.deepEqual(calls, []);
            assert.deepEqual(recovered.snapshot, retained);
          }
          const historical = structuredClone(snapshot);
          historical.nativeStageRecords[0] = {
            ...structuredClone(journal),
            steps: structuredClone(completed.steps),
          };
          historical.observation.body = structuredClone(data.afterBody);
          // Legacy execution proof is carried by the actual stamped body line;
          // the separate canonical proofRecords collection remains empty here.
          const { parseProofMarker, upsertProofMarker } =
            await import('../../../../task-tracker/lib/proof-marker.mjs');
          const proofLine = historical.observation.body.bytes
            .split('\n')
            .find((line) => line.includes('Supported model hooks') && parseProofMarker(line)?.sha);
          assert.ok(proofLine, 'actual native stamped proof line present');
          assert.equal(String(parseProofMarker(proofLine).exit), '0');
          const changedProofLine = upsertProofMarker(proofLine, { sha: 'a'.repeat(40) });
          assert.notEqual(changedProofLine, proofLine);
          assert.ok(
            historical.observation.protectedSourceBindings.length > 0,
            'real original source bindings present'
          );
          for (const [label, mutate] of [
            [
              'current body bytes',
              (value) => {
                value.observation.body.bytes += '\nForeign body content.\n';
              },
            ],
            [
              'current body version',
              (value) => {
                value.observation.body.version += 1;
              },
            ],
            [
              'current native proof marker SHA',
              (value) => {
                value.observation.body.bytes = value.observation.body.bytes.replace(
                  proofLine,
                  changedProofLine
                );
              },
            ],
            [
              'current source binding',
              (value) => {
                value.observation.protectedSourceBindings[0].hash = hashBytes('foreign source');
              },
            ],
            [
              'unaffected local resource',
              (value) => {
                value.nativeStageResources.local.trackerState.bytes += ' ';
              },
            ],
            [
              'retained complete planning child',
              (value) => {
                value.planning.epicChildren.push({
                  number: 999,
                  rank: 1,
                  blockedBy: [],
                  state: 'open',
                  closeReason: null,
                });
              },
            ],
            [
              'earlier authority bytes',
              (value) => {
                value.comments[0].body += ' ';
              },
            ],
          ]) {
            const changed = structuredClone(historical);
            mutate(changed);
            let recovered,
              refused = false;
            try {
              recovered = createRevisionMemory(changed);
              const observed = await observeRevision({ context: f.context, deps: recovered });
              refused = observed.status === 'indeterminate' || observed.status === 'blocked';
              t.diagnostic(JSON.stringify({ sentinelHistoryNegative: label, observed }));
            } catch (error) {
              refused = String(error.message).startsWith('criteria-revision:');
              t.diagnostic(
                JSON.stringify({
                  sentinelHistoryNegative: label,
                  constructorRefusal: error.message,
                })
              );
            }
            assert.equal(refused, true, label);
            if (recovered)
              assert.deepEqual(recovered.snapshot, changed, label + ' no reconstruction mutation');
          }
        }
        assert.deepEqual(f.backend.snapshot, snapshot);
        assert.deepEqual(f.backend.effects, operations);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      if (faultMode === 'board-exception-prefix') {
        const { when, suffix } = fault;
        const point = `native-stage-board-exception-${suffix}`;
        const writeWhen = when === 'failBefore' ? 'failAfter' : 'failBefore';
        f.backend[writeWhen] = 'native-stage-board-effect-write';
        f.backend[when] = point;
        const files = captureFiles();
        const failed = await moveState(ctx);
        assert.equal(failed.exit, 4);
        assert.deepEqual(captureFiles(), files, 'complete host path/byte hashes');
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0],
          board = journal.steps[13];
        assert.equal(journal.steps.length, 14);
        assert.ok(journal.steps.slice(0, 13).every((step) => step.readback));
        assert.equal(board.attempts.length, 1);
        const recorded = !(suffix === 'write' && when === 'failBefore');
        const disposed =
          suffix === 'outcome-readback' || (suffix === 'outcome-write' && when === 'failAfter');
        assert.deepEqual(
          board.attempts[0].write,
          recorded
            ? {
                kind: 'threw',
                name: 'Error',
                message: `interrupted:${writeWhen}:native-stage-board-effect-write`,
                code: null,
              }
            : null
        );
        assert.equal(board.attempts[0].read, null);
        assert.equal(board.attempts[0].after, null);
        assert.deepEqual(
          board.outcome,
          disposed ? { kind: 'exception', attempt: 1, exit: null } : null
        );
        assert.equal(board.readback, null);
        const item = JSON.parse(journal.header.original.resources.membership.bytes);
        const effected = writeWhen === 'failAfter';
        if (effected) {
          const status = item.fieldValues.nodes.find(
            (field) => field.field.id === cfg.kanbanFieldId
          );
          status.name = 'Test';
          status.optionId = cfg.kanbanOptionTest;
        }
        assert.deepEqual(JSON.parse(snapshot.nativeStageResources.membership.bytes), item);
        assert.equal(snapshot.observation.stage, effected ? 'test' : 'develop');
        const { reconstructNativeStageEntryBody } =
          await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
        const expectedObservation = structuredClone(before.observation);
        expectedObservation.body = (
          await reconstructNativeStageEntryBody({
            header: journal.header,
            steps: journal.steps.slice(0, 13),
          })
        ).afterBody;
        expectedObservation.stage = effected ? 'test' : 'develop';
        assert.deepEqual(snapshot.observation, expectedObservation);
        assert.deepEqual(snapshot.comments, before.comments);
        assert.deepEqual(snapshot.lifecycleSources, before.lifecycleSources);
        const operations = ['write', 'readback', 'outcome-write', 'outcome-readback'].map(
          (name) => `native-stage-board-exception-${name}`
        );
        const end = operations.indexOf(point) + (when === 'failAfter' ? 1 : 0);
        assert.deepEqual(
          f.backend.effects.filter((name) => name.startsWith('native-stage-board-exception-')),
          operations.slice(0, end)
        );
        assert.ok(!f.backend.effects.includes('native-stage-board-write-return'));
        assert.ok(!f.backend.effects.includes('native-stage-board-outcome-write'));
        assert.ok(!f.backend.effects.includes('native-stage-board-effect-readback'));
        const restarted = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        const observed = await observeRevision({ context: f.context, deps: restarted });
        assert.equal(observed.status, 'pending-native-stage', JSON.stringify(observed));
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: restarted,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(restarted.snapshot, snapshot);
        return;
      }
      if (faultMode === 'board-exception') {
        f.backend.failBefore = 'native-stage-board-effect-write';
        const files = captureFiles();
        const failed = await moveState(ctx);
        assert.equal(failed.exit, 4);
        assert.deepEqual(captureFiles(), files);
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords[0],
          board = journal.steps[13];
        assert.equal(journal.steps.length, 14);
        assert.ok(journal.steps.slice(0, 13).every((step) => step.readback));
        assert.equal(board.attempts.length, 1);
        assert.deepEqual(board.attempts[0].write, {
          kind: 'threw',
          name: 'Error',
          message: 'interrupted:failBefore:native-stage-board-effect-write',
          code: null,
        });
        assert.equal(board.attempts[0].read, null);
        assert.equal(board.attempts[0].after, null);
        assert.deepEqual(board.outcome, { kind: 'exception', attempt: 1, exit: null });
        assert.equal(board.readback, null);
        assert.equal(snapshot.observation.stage, 'develop');
        assert.deepEqual(
          snapshot.nativeStageResources.membership,
          journal.header.original.resources.membership
        );
        assert.ok(!f.backend.effects.includes('native-stage-board-effect-write'));
        assert.deepEqual(
          f.backend.effects.filter((name) => name.startsWith('native-stage-board-exception-')),
          [
            'native-stage-board-exception-write',
            'native-stage-board-exception-readback',
            'native-stage-board-exception-outcome-write',
            'native-stage-board-exception-outcome-readback',
          ]
        );
        const restarted = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        const observed = await observeRevision({ context: f.context, deps: restarted });
        assert.equal(observed.status, 'pending-native-stage', JSON.stringify(observed));
        const calls = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              calls.push('body');
              return body;
            },
            deps: {
              revisionBackend: restarted,
              pexec: async () => {
                calls.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(calls, []);
        assert.deepEqual(restarted.snapshot, snapshot);
        return;
      }
      if (fault) {
        const { when, suffix } = fault;
        if (faultMode === 'board-prefix') {
          const point = `native-stage-board-${suffix}`;
          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, 'complete fixture path/byte hashes');
          const retained = interrupted.snapshot,
            journal = retained.nativeStageRecords[0];
          const sealed = !(suffix === 'intent-write' && when === 'failBefore');
          const effected =
            suffix === 'effect-readback' || (suffix === 'effect-write' && when === 'failAfter');
          const completed = suffix === 'effect-readback' && when === 'failAfter';
          assert.equal(journal.steps.length, sealed ? 14 : 13);
          assert.ok(journal.steps.slice(0, 13).every((step) => step.readback));
          if (sealed) assert.equal(journal.steps[13].readback !== null, completed);
          const item = JSON.parse(journal.header.original.resources.membership.bytes);
          if (effected) {
            const status = item.fieldValues.nodes.find(
              (field) => field.field.id === cfg.kanbanFieldId
            );
            status.name = 'Test';
            status.optionId = cfg.kanbanOptionTest;
          }
          assert.deepEqual(
            JSON.parse(retained.nativeStageResources.membership.bytes),
            item,
            'whole independent membership changes only native Status'
          );
          assert.equal(retained.observation.stage, effected ? 'test' : 'develop');
          const { reconstructNativeStageEntryBody } =
            await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
          const expected = structuredClone(before.observation);
          expected.body = (
            await reconstructNativeStageEntryBody({
              header: journal.header,
              steps: journal.steps.slice(0, 13),
            })
          ).afterBody;
          expected.stage = effected ? 'test' : 'develop';
          assert.deepEqual(retained.observation, expected);
          assert.deepEqual(retained.comments, before.comments);
          assert.deepEqual(retained.lifecycleSources, before.lifecycleSources);
          if (sealed && suffix.startsWith('effect')) {
            const attempt = journal.steps[13].attempts[0];
            assert.equal(attempt.number, 1);
            assert.equal(attempt.after !== null, suffix === 'effect-readback');
            if (suffix === 'effect-write') {
              assert.equal(attempt.write?.kind, 'threw');
              assert.equal(attempt.write.message, `interrupted:${when}:${point}`);
              assert.deepEqual(journal.steps[13].outcome, {
                kind: 'exception',
                attempt: 1,
                exit: null,
              });
            } else assert.equal(attempt.write?.kind, 'returned');
          }
          const restarted = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          const observed = await observeRevision({ context: f.context, deps: restarted });
          assert.equal(observed.status, 'pending-native-stage', JSON.stringify(observed));
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('body');
                return body;
              },
              deps: {
                revisionBackend: restarted,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);
          assert.deepEqual(restarted.observation, expected);
          return;
        }
        if (faultMode === 'entry-body-prefix') {
          const point = `native-stage-body-${suffix}`;
          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} complete host hashes`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(suffix === 'intent-write' && when === 'failBefore');
          const effected =
            suffix === 'effect-readback' || (suffix === 'effect-write' && when === 'failAfter');
          const completed = suffix === 'effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? 13 : 12);
          assert.ok(pending.steps.slice(0, 12).every((step) => step.readback));
          if (sealed) assert.equal(pending.steps[12].readback !== null, completed);
          const expectedObservation = structuredClone(before.observation);
          if (effected) {
            const { reconstructNativeStageEntryBody } =
              await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
            expectedObservation.body = (
              await reconstructNativeStageEntryBody({
                header: pending.header,
                steps: pending.steps,
              })
            ).afterBody;
          }
          assert.deepEqual(retained.observation, expectedObservation);
          assert.deepEqual(retained.comments, before.comments);
          assert.deepEqual(retained.lifecycleSources, before.lifecycleSources);
          assert.deepEqual(
            retained.nativeStageResources.membership,
            pending.header.original.resources.membership
          );
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);
          assert.deepEqual(recovered.observation, expectedObservation);
          if (when === 'failBefore' && suffix === 'intent-write') {
            const coherent = JSON.parse(JSON.stringify(retained));
            coherent.planning.epicChildren.push({
              number: 999,
              rank: 1,
              blockedBy: [],
              state: 'open',
              closeReason: null,
            });
            const changed = createRevisionMemory(coherent);
            const rejected = await observeRevision({ context: f.context, deps: changed });
            assert.deepEqual(
              rejected,
              { status: 'indeterminate', code: 'criteria-revision:native-history-planning-drift' },
              'closed valid child data must fail complete historical planning comparison'
            );
            assert.deepEqual(changed.snapshot, coherent);
          }
          return;
        }
        if (['phase-11-prefix', 'phase-12-prefix'].includes(faultMode)) {
          const ordinal = Number(expectStage.split('-')[1]);
          const point = `native-stage-phase-${ordinal}-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} complete host hashes`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(suffix === 'intent-write' && when === 'failBefore');
          const effected =
            suffix === 'effect-readback' || (suffix === 'effect-write' && when === 'failAfter');
          const completed = suffix === 'effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? ordinal : ordinal - 1);
          assert.ok(pending.steps.slice(0, ordinal - 1).every((step) => step.readback));
          if (sealed) assert.equal(pending.steps[ordinal - 1].readback !== null, completed);
          const previous = pending.steps[ordinal - 2],
            step = pending.steps[ordinal - 1];
          const timing = retained.nativeStageResources.comments.find(
            (entry) => entry.nodeId === pending.steps[1].intent.nodeId
          );
          const expectedBody = effected
            ? step.intent.afterBody
            : ordinal === 11
              ? pending.steps[1].intent.afterBody
              : previous.intent.afterBody;
          assert.equal(JSON.parse(timing.bytes).body, expectedBody);
          assert.deepEqual(
            retained.nativeStageResources.comments.filter(
              (entry) => entry.nodeId !== timing.nodeId
            ),
            pending.header.original.resources.comments.filter(
              (entry) => entry.nodeId !== timing.nodeId
            )
          );
          for (const [key, index] of [
            ['activeTask', 7],
            ['actorTiming', 8],
            ['trackerState', 9],
          ])
            assert.deepEqual(retained.nativeStageResources.local[key], {
              bytes: pending.steps[index].intent.bytes,
            });
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (
          [
            'actor-final-session-prefix',
            'actor-final-actor-prefix',
            'actor-final-tracker-prefix',
          ].includes(faultMode)
        ) {
          const resource = expectStage.split('-')[2];
          const ordinal = { session: 8, actor: 9, tracker: 10 }[resource];
          const point = `native-stage-actor-final-local-${resource}-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} complete host hashes`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(suffix === 'intent-write' && when === 'failBefore');
          const effected =
            suffix === 'effect-readback' || (suffix === 'effect-write' && when === 'failAfter');
          const completed = suffix === 'effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? ordinal : ordinal - 1);
          assert.ok(pending.steps.slice(0, ordinal - 1).every((step) => step.readback));
          if (sealed)
            assert.deepEqual(
              pending.steps[ordinal - 1].readback,
              completed
                ? {
                    file: pending.steps[ordinal - 1].intent.file,
                    bytes: pending.steps[ordinal - 1].intent.bytes,
                  }
                : null
            );
          for (const [key, finalIndex, checkpointIndex] of [
            ['activeTask', 7, 3],
            ['actorTiming', 8, 4],
            ['trackerState', 9, 5],
          ]) {
            const expectedIndex =
              finalIndex < ordinal - 1 || (finalIndex === ordinal - 1 && effected)
                ? finalIndex
                : checkpointIndex;
            assert.deepEqual(retained.nativeStageResources.local[key], {
              bytes: pending.steps[expectedIndex].intent.bytes,
            });
          }
          assert.equal(retained.nativeStageResources.local.actorFlush, null);
          assert.deepEqual(
            retained.nativeStageResources.local.queue,
            pending.header.original.resources.local.queue
          );
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (
          [
            'actor-checkpoint-session-prefix',
            'actor-checkpoint-actor-prefix',
            'actor-checkpoint-tracker-prefix',
          ].includes(faultMode)
        ) {
          const resource = expectStage.split('-')[2];
          const ordinal = { session: 4, actor: 5, tracker: 6 }[resource];
          const key = { session: 'activeTask', actor: 'actorTiming', tracker: 'trackerState' }[
            resource
          ];
          const point = `native-stage-local-${resource}-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} complete host hashes`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(suffix === 'intent-write' && when === 'failBefore');
          const effected =
            suffix === 'effect-readback' || (suffix === 'effect-write' && when === 'failAfter');
          const completed = suffix === 'effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? ordinal : ordinal - 1);
          assert.ok(pending.steps.slice(0, ordinal - 1).every((step) => step.readback));
          assert.deepEqual(
            retained.nativeStageResources.local[key],
            effected
              ? { bytes: pending.steps[ordinal - 1].intent.bytes }
              : pending.header.original.resources.local[key]
          );
          if (sealed)
            assert.deepEqual(
              pending.steps[ordinal - 1].readback,
              completed
                ? {
                    file: pending.steps[ordinal - 1].intent.file,
                    bytes: pending.steps[ordinal - 1].intent.bytes,
                  }
                : null
            );
          for (const [otherKey, stepIndex] of [
            ['activeTask', 3],
            ['actorTiming', 4],
            ['trackerState', 5],
          ]) {
            if (otherKey === key) continue;
            assert.deepEqual(
              retained.nativeStageResources.local[otherKey],
              stepIndex < ordinal - 1
                ? { bytes: pending.steps[stepIndex].intent.bytes }
                : pending.header.original.resources.local[otherKey]
            );
          }
          assert.deepEqual(
            retained.nativeStageResources.local.queue,
            pending.header.original.resources.local.queue
          );
          assert.equal(
            retained.nativeStageResources.local.actorFlush.bytes,
            pending.steps[0].intent.journalBytes
          );
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (['actor-cursor-prefix'].includes(faultMode)) {
          const point = `native-stage-cursor-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} no host effects`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(point === 'native-stage-cursor-intent-write' && when === 'failBefore');
          const effected =
            point === 'native-stage-cursor-effect-readback' ||
            (point === 'native-stage-cursor-effect-write' && when === 'failAfter');
          const completed = point === 'native-stage-cursor-effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? 3 : 2);
          assert.deepEqual(
            retained.nativeStageResources.local.wordCursor,
            effected
              ? { bytes: pending.steps[2].intent.bytes }
              : pending.header.original.resources.local.wordCursor
          );
          if (sealed)
            assert.deepEqual(
              pending.steps[2].readback,
              completed
                ? { file: pending.steps[2].intent.file, bytes: pending.steps[2].intent.bytes }
                : null
            );
          for (const key of ['activeTask', 'actorTiming', 'trackerState', 'queue'])
            assert.deepEqual(
              retained.nativeStageResources.local[key],
              pending.header.original.resources.local[key]
            );
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (['actor-publication-prefix'].includes(faultMode)) {
          const point = `native-stage-timing-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(
            captureFiles(),
            files,
            `${when}:${point} leaves every host byte unchanged`
          );
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const sealed = !(point === 'native-stage-timing-intent-write' && when === 'failBefore');
          const effected =
            point === 'native-stage-timing-effect-readback' ||
            (point === 'native-stage-timing-effect-write' && when === 'failAfter');
          const completed = point === 'native-stage-timing-effect-readback' && when === 'failAfter';
          assert.equal(pending.steps.length, sealed ? 2 : 1, `${when}:${point} durable intent`);
          assert.equal(
            retained.nativeStageResources.comments.length,
            pending.header.original.resources.comments.length + (effected ? 1 : 0)
          );
          assert.deepEqual(
            retained.nativeStageResources.comments.slice(
              0,
              pending.header.original.resources.comments.length
            ),
            pending.header.original.resources.comments
          );
          if (sealed)
            assert.equal(
              pending.steps[1].readback !== null,
              completed,
              `${when}:${point} actual readback`
            );
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (['actor-journal-prefix'].includes(faultMode)) {
          const point = `native-stage-actor-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4, `${when}:${point}`);
          assert.deepEqual(captureFiles(), files, `${when}:${point} cannot mutate host bytes`);
          const retained = interrupted.snapshot,
            pending = retained.nativeStageRecords[0];
          const written = !(when === 'failBefore' && point === 'native-stage-actor-effect-write');
          const readBack = when === 'failAfter' && point === 'native-stage-actor-effect-readback';
          assert.equal(
            retained.nativeStageResources.local.actorFlush?.bytes ?? null,
            written ? pending.steps[0].intent.journalBytes : null,
            `${when}:${point} independent effect prefix`
          );
          assert.deepEqual(
            pending.steps[0].readback,
            readBack
              ? {
                  file: pending.header.original.actor.capture.journalFile,
                  bytes: pending.steps[0].intent.journalBytes,
                }
              : null,
            `${when}:${point} actual readback prefix`
          );
          assert.equal(pending.header.original.resources.local.actorFlush, null);
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          const recovered = createRevisionMemory(JSON.parse(JSON.stringify(retained)));
          assert.equal(
            (await observeRevision({ context: f.context, deps: recovered })).status,
            'pending-native-stage'
          );
          const calls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                calls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: recovered,
                pexec: async () => {
                  calls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(calls, []);

          return;
        }
        if (['intent-prefix'].includes(faultMode)) {
          const point = `native-stage-journal-${suffix}`;

          const interrupted = createRevisionMemory(structuredClone(before));
          interrupted[when] = point;
          const files = captureFiles();
          const failed = await moveState({
            ...freshStageContext(ctx),
            revisionBackend: interrupted,
          });
          assert.equal(failed.exit, 4);
          assert.deepEqual(captureFiles(), files, `${when}:${point} leaves host bytes unchanged`);
          const retained = interrupted.snapshot;
          const persisted = !(when === 'failBefore' && point === 'native-stage-journal-write');
          assert.equal(retained.nativeStageRecords?.length ?? 0, persisted ? 1 : 0);
          const recovered = createRevisionMemory(retained);
          const observed = await observeRevision({ context: f.context, deps: recovered });
          assert.equal(
            observed.status,
            persisted ? 'pending-native-stage' : 'applied',
            `${when}:${point}`
          );
          assert.deepEqual(retained.observation, before.observation);
          assert.deepEqual(retained.comments, before.comments);
          if (persisted) {
            assert.equal(retained.nativeStageRecords[0].steps[0].readback, null);
            const calls = [];
            await assert.rejects(
              mutateIssueBody({
                issueNumber: f.context.issue,
                repo: f.context.repository,
                projectDir: f.projectDir,
                mutate: (body) => {
                  calls.push('mutate');
                  return body;
                },
                deps: {
                  revisionBackend: recovered,
                  pexec: async () => {
                    calls.push('transport');
                  },
                },
              }),
              (error) => error.code === 'revision-pending'
            );
            assert.deepEqual(calls, []);
          }

          return;
        }
        throw new Error('unknown native prefix fixture');
      }
      if (expectStage === 'entry-helper-override') {
        const files = captureFiles(),
          effects = [];
        const filesystem = (await import('node:fs')).default;
        const { syncBuiltinESMExports } = await import('node:module');
        const nativeRead = filesystem.readFileSync;
        let changed = false;
        filesystem.readFileSync = function (...args) {
          if (!changed && f.backend.effects.includes('native-stage-phase-12-effect-readback')) {
            changed = true;
            Object.defineProperty(ctx, '_mutateBody', {
              configurable: true,
              enumerable: true,
              get() {
                effects.push('getter');
                return async () => {
                  effects.push('mutate');
                };
              },
            });
          }
          return nativeRead.apply(this, args);
        };
        syncBuiltinESMExports();
        let result;
        try {
          result = await moveState(ctx);
        } finally {
          filesystem.readFileSync = nativeRead;
          syncBuiltinESMExports();
        }
        assert.equal(changed, true, 'substitution occurs after genuinely completed phase12');
        assert.equal(result.exit, 4);
        assert.deepEqual(
          effects,
          [],
          'late helper accessor cannot run before original entry admission'
        );
        assert.equal(f.backend.snapshot.nativeStageRecords[0].steps.length, 12);
        assert.deepEqual(f.backend.observation, before.observation);
        assert.deepEqual(captureFiles(), files);
        return;
      }
      const localBefore = [
        'preparation',
        'intent',
        'actor-journal',
        'actor-publication',
        'actor-publication-existing',
        'actor-publication-prefix',
        'actor-cursor',
        'actor-cursor-legacy',
        'actor-cursor-absent',
        'actor-cursor-prefix',
        'actor-checkpoint',
        'actor-checkpoint-host',
        'actor-checkpoint-session-prefix',
        'actor-checkpoint-actor-prefix',
        'actor-checkpoint-tracker-prefix',
        'actor-remove',
        'actor-final',
        'actor-final-session-prefix',
        'actor-final-actor-prefix',
        'actor-final-tracker-prefix',
        'entry-body',
        'phase-pair',
        'phase-11-prefix',
        'phase-12-prefix',
        'phase-adversarial',
        'transition-native',
      ].includes(expectStage)
        ? captureFiles()
        : null;
      if (faultMode === 'entry-intent') f.backend.failBefore = 'native-stage-body-effect-write';
      if (['preparation', 'intent'].includes(expectStage))
        f.backend.failBefore = 'native-stage-actor-effect-write';
      if (expectStage === 'actor-remove')
        f.backend.failBefore = 'native-stage-actor-final-local-session-intent-write';
      if (String(expectStage).startsWith('actor-final') || expectStage === 'transition-native')
        f.backend.failBefore = 'native-stage-phase-11-intent-write';
      if (expectStage === 'actor-journal')
        f.backend.failBefore = 'native-stage-timing-intent-write';
      if (String(expectStage).startsWith('actor-checkpoint'))
        f.backend.failBefore = 'native-stage-removal-intent-write';
      if (String(expectStage).startsWith('actor-cursor'))
        f.backend.failBefore = 'native-stage-local-session-intent-write';
      if (String(expectStage).startsWith('actor-publication'))
        f.backend.failBefore = 'native-stage-cursor-intent-write';
      const hostRemovalLocks = [];
      const filesystem = (await import('node:fs')).default;
      const { syncBuiltinESMExports } = await import('node:module');
      const originalMkdir = filesystem.mkdirSync,
        originalRmdir = filesystem.rmdirSync;
      if (
        [
          'actor-checkpoint-host',
          'actor-remove',
          'actor-final',
          'actor-final-session-prefix',
          'actor-final-actor-prefix',
          'actor-final-tracker-prefix',
          'entry-body',
          'phase-pair',
          'phase-11-prefix',
          'phase-12-prefix',
          'phase-adversarial',
          'transition-native',
        ].includes(expectStage)
      ) {
        filesystem.mkdirSync = function (file, ...args) {
          if (String(file).endsWith('.flush.json.lock'))
            hostRemovalLocks.push(['mkdir', String(file)]);
          return originalMkdir.call(this, file, ...args);
        };
        filesystem.rmdirSync = function (file, ...args) {
          if (String(file).endsWith('.flush.json.lock'))
            hostRemovalLocks.push(['rmdir', String(file)]);
          return originalRmdir.call(this, file, ...args);
        };
        syncBuiltinESMExports();
      }
      let result;
      try {
        result = await moveState(ctx);
      } finally {
        if (
          [
            'actor-checkpoint-host',
            'actor-remove',
            'actor-final',
            'actor-final-session-prefix',
            'actor-final-actor-prefix',
            'actor-final-tracker-prefix',
            'entry-body',
            'phase-pair',
            'phase-11-prefix',
            'phase-12-prefix',
            'phase-adversarial',
            'transition-native',
          ].includes(expectStage)
        ) {
          filesystem.mkdirSync = originalMkdir;
          filesystem.rmdirSync = originalRmdir;
          syncBuiltinESMExports();
        }
      }
      t.diagnostic(JSON.stringify({ nativeStageResult: result, nativeEffects: f.backend.effects }));
      if (
        [
          'actor-remove',
          'actor-final',
          'actor-final-session-prefix',
          'actor-final-actor-prefix',
          'actor-final-tracker-prefix',
          'entry-body',
          'phase-pair',
          'phase-11-prefix',
          'phase-12-prefix',
          'phase-adversarial',
          'transition-native',
        ].includes(expectStage)
      ) {
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords?.[0];
        assert.equal(journal?.steps[5]?.kind, 'local-tracker');
        assert.ok(journal.steps[5].readback, 'actual checkpoint precedes journal removal');
        assert.equal(
          snapshot.nativeStageResources.local.actorFlush,
          null,
          'original actor journal removed from independent memory resource'
        );
        assert.equal(journal.steps[6]?.kind, 'actor-journal-remove');
        assert.deepEqual(journal.steps[6]?.readback, {
          file: journal.header.original.actor.capture.journalFile,
          bytes: null,
        });
        if (
          String(expectStage).startsWith('actor-final') ||
          [
            'entry-body',
            'phase-pair',
            'phase-11-prefix',
            'phase-12-prefix',
            'phase-adversarial',
            'transition-native',
          ].includes(expectStage)
        ) {
          assert.equal(
            journal.steps.length,
            faultMode === 'board'
              ? 14
              : expectStage === 'entry-body'
                ? 13
                : String(expectStage).startsWith('phase-')
                  ? 12
                  : 10,
            'the original outer save and requested phase facts must complete'
          );
          assert.deepEqual(
            journal.steps.slice(7, 10).map((step) => step.kind),
            ['local-session', 'local-actor', 'local-tracker']
          );
          assert.ok(
            journal.steps
              .slice(7, 10)
              .every((step) => step.readback && step.intent.invocation === 'actor-final')
          );
          const candidate = JSON.parse(journal.header.original.actor.candidateBytes);
          const session = JSON.parse(snapshot.nativeStageResources.local.activeTask.bytes);
          const actor = JSON.parse(snapshot.nativeStageResources.local.actorTiming.bytes);
          assert.equal(session.entryStartTs, journal.header.original.actor.capture.ts);
          assert.equal(session.wordsAtStart, candidate.checkpoint.lastWordMarker);
          assert.equal(actor.state.lastFullWordMarker, candidate.checkpoint.lastFullWordMarker);
          if (String(expectStage).startsWith('phase-')) {
            assert.deepEqual(
              journal.steps.slice(10).map((step) => step.kind),
              ['phase-timing', 'phase-timing']
            );
            assert.deepEqual(
              journal.steps.slice(10).map((step) => step.intent.phase),
              ['develop:complete', 'test:enter']
            );
            assert.ok(journal.steps.slice(10).every((step) => step.readback));
            assert.equal(journal.steps[10].intent.ts, journal.steps[11].intent.ts);
            assert.notEqual(
              journal.steps[10].intent.beforeBody,
              journal.steps[11].intent.afterBody
            );
          }
        }
        assert.deepEqual(hostRemovalLocks, [], 'no host journal lock mkdir/rmdir attempt');
        assert.deepEqual(captureFiles(), localBefore);
        if (faultMode === 'entry-intent') {
          assert.equal(journal.steps[12].kind, 'entry-body');
          assert.equal(journal.steps[12].readback, null);
          assert.ok(f.backend.effects.includes('native-stage-body-intent-write'));
          assert.ok(f.backend.effects.includes('native-stage-body-intent-readback'));
          assert.ok(!f.backend.effects.includes('native-stage-body-effect-write'));
          assert.deepEqual(snapshot.observation, before.observation);
        } else if (expectStage === 'entry-body') {
          assert.equal(journal.steps[12].kind, 'entry-body');
          assert.ok(journal.steps[12].readback);
          assert.match(snapshot.observation.body.bytes, /aitm-entered-test/);
          assert.match(snapshot.observation.body.bytes, /aitm-last-known-state[^>]*test/);
          assert.notEqual(snapshot.observation.body.bytes, before.observation.body.bytes);
          if (faultMode === 'board') {
            assert.equal(journal.steps[13].kind, 'board-status');
            assert.ok(journal.steps[13].readback);
            assert.equal(snapshot.observation.stage, 'test');
            const item = JSON.parse(snapshot.nativeStageResources.membership.bytes);
            const status = item.fieldValues.nodes.find(
              (field) => field.field.id === cfg.kanbanFieldId
            );
            assert.equal(status.optionId, cfg.kanbanOptionTest);
            assert.equal(status.name, 'Test');
            const expectedItem = JSON.parse(journal.header.original.resources.membership.bytes);
            const expectedStatus = expectedItem.fieldValues.nodes.find(
              (field) => field.field.id === cfg.kanbanFieldId
            );
            expectedStatus.optionId = cfg.kanbanOptionTest;
            expectedStatus.name = 'Test';
            assert.deepEqual(
              item,
              expectedItem,
              'every unaffected membership field/identity byte projection remains exact'
            );
            const { statusWriteArgs, STATUS_OPTION_QUERY } =
              await import('../../../../task-tracker/lib/move-state/github-mutation.mjs');
            const board = journal.steps[13],
              attempt = board.attempts[0];
            assert.equal(board.attempts.length, 1);
            assert.equal(attempt.number, 1);
            assert.deepEqual(attempt.request, { file: 'gh', args: statusWriteArgs(board.intent) });
            assert.deepEqual(attempt.before, {
              stage: 'develop',
              membership: journal.header.original.resources.membership,
            });
            assert.deepEqual(attempt.write, { kind: 'returned', stdout: '' });
            const [owner, repo] = f.context.repository.split('/');
            assert.deepEqual(attempt.read.request, {
              query: STATUS_OPTION_QUERY,
              variables: { owner, repo, issue: f.context.issue },
            });
            assert.deepEqual(attempt.after, {
              stage: 'test',
              membership: snapshot.nativeStageResources.membership,
            });
            assert.deepEqual(board.outcome, { kind: 'confirmed', attempt: 1, exit: null });
            assert.deepEqual(board.readback, { attempt: 1, ...attempt.after });
            assert.deepEqual(
              f.backend.effects.filter((name) => name.startsWith('native-stage-board-')),
              [
                'native-stage-board-intent-write',
                'native-stage-board-intent-readback',
                'native-stage-board-attempt-intent-write',
                'native-stage-board-attempt-intent-readback',
                'native-stage-board-effect-write',
                'native-stage-board-write-return',
                'native-stage-board-attempt-readback',
                'native-stage-board-outcome-write',
                'native-stage-board-effect-readback',
              ]
            );
            const pendingCalls = [];
            await assert.rejects(
              mutateIssueBody({
                issueNumber: f.context.issue,
                repo: f.context.repository,
                projectDir: f.projectDir,
                mutate: (body) => {
                  pendingCalls.push('body');
                  return body;
                },
                deps: {
                  revisionBackend: f.backend,
                  pexec: async () => {
                    pendingCalls.push('transport');
                  },
                },
              }),
              (error) => error.code === 'revision-pending'
            );
            assert.deepEqual(pendingCalls, []);
          } else
            assert.deepEqual(
              snapshot.nativeStageResources.membership,
              journal.header.original.resources.membership,
              'board remains original before its own leaf'
            );
        } else assert.deepEqual(snapshot.observation, before.observation);
        assert.deepEqual(snapshot.comments, before.comments);
        const restartedStage = await observeRevision({
          context: f.context,
          deps: createRevisionMemory(JSON.parse(JSON.stringify(snapshot))),
        });
        assert.equal(restartedStage.status, 'pending-native-stage', JSON.stringify(restartedStage));
        assert.equal(result.exit, 4, 'later phase publication remains fenced');
        if (faultMode === 'entry-adversarial') {
          const { readMemoryPlanning } =
            await import('../../../../task-tracker/lib/criteria-revision/store.mjs');
          assert.throws(
            () => readMemoryPlanning(f.backend, f.context),
            /planning-snapshot-stale/,
            'historical pending-stage classification cannot make current planning data eligible'
          );
          const pendingCalls = [];
          await assert.rejects(
            mutateIssueBody({
              issueNumber: f.context.issue,
              repo: f.context.repository,
              projectDir: f.projectDir,
              mutate: (body) => {
                pendingCalls.push('mutate');
                return body;
              },
              deps: {
                revisionBackend: f.backend,
                pexec: async () => {
                  pendingCalls.push('transport');
                },
              },
            }),
            (error) => error.code === 'revision-pending'
          );
          assert.deepEqual(pendingCalls, []);
          const { canonicalRecordJson } =
            await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
          const digest = (value) => hashBytes(canonicalRecordJson(value));
          for (const [label, change] of [
            [
              'retained planning hash',
              (value) => {
                value.planning.bodyHash = hashBytes(value.observation.body.bytes);
              },
            ],
            [
              'retained planning config',
              (value) => {
                value.planning.cfg.kanbanOptionTest = 'foreign-option';
              },
            ],
            [
              'retained planning children',
              (value) => {
                value.planning.epicChildren.push({ number: 999 });
              },
            ],
            [
              'retained planning trunk',
              (value) => {
                value.planning.trunkSha = 'b'.repeat(40);
              },
            ],
            [
              'retained planning subject',
              (value) => {
                value.planning.issue += 1;
              },
            ],
            [
              'retained source hash',
              (value) => {
                value.lifecycleSources.bodyHash = hashBytes('foreign original');
              },
            ],
            [
              'retained source identity',
              (value) => {
                value.lifecycleSources.issue += 1;
              },
            ],
            [
              'retained raw source pair',
              (value) => {
                value.lifecycleSources.remote.identity.response.stdout = 'foreign-owner\n';
              },
            ],
            [
              'current body bytes',
              (value) => {
                value.observation.body.bytes += '\nUnrelated body drift.\n';
              },
            ],
            [
              'current resource bytes',
              (value) => {
                value.nativeStageResources.local.trackerState.bytes += ' ';
              },
            ],
            [
              'foreign ordered reference',
              (value) => {
                value.nativeOrder.at(-1).id = hashBytes('foreign stage');
              },
            ],
            [
              'missing original predecessor',
              (value) => {
                value.nativeOrder.at(-1).predecessor = null;
              },
            ],
            [
              'coherent changed original body',
              (value) => {
                const header = value.nativeStageRecords[0].header;
                header.original.observation.body.bytes += '\nUnrelated original drift.\n';
                header.guardCapture.lifecycleSources.bodyHash = hashBytes(
                  header.original.observation.body.bytes
                );
                value.lifecycleSources = structuredClone(header.guardCapture.lifecycleSources);
              },
            ],
            [
              'coherent extra JSON body member',
              (value) => {
                const response = value.nativeStageRecords[0].steps[12].readback.resource.response;
                response.stdout = JSON.stringify({ ...JSON.parse(response.stdout), ready: true });
              },
            ],
            [
              'framing cannot conceal body resource drift',
              (value) => {
                value.nativeStageRecords[0].steps[12].readback.resource.response.stdout =
                  JSON.stringify({ body: value.observation.body.bytes + ' ' });
              },
            ],
          ]) {
            const changed = structuredClone(snapshot);
            change(changed);
            if (label.startsWith('coherent changed original')) {
              const retained = changed.nativeStageRecords[0],
                { id, ...unsigned } = retained.header;
              retained.header.id = digest(unsigned);
              changed.nativeOrder.at(-1).id = retained.header.id;
              retained.steps[0].previous = retained.header.id;
              for (let i = 1; i < retained.steps.length; i++)
                retained.steps[i].previous = digest(retained.steps[i - 1]);
            }
            let backend,
              observed,
              refused = false;
            try {
              backend = createRevisionMemory(changed);
              observed = await observeRevision({ context: f.context, deps: backend });
            } catch {
              refused = true;
            }
            assert.ok(refused || observed.status !== 'pending-native-stage', label);
            if (backend)
              assert.deepEqual(backend.snapshot, changed, label + ' no reconstruction effects');
          }
        }
        if (expectStage === 'phase-adversarial') {
          const { canonicalRecordJson } =
            await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
          const { nativeStageTimingPages } =
            await import('../../../../task-tracker/lib/criteria-revision/stage-execution.mjs');
          for (const [label, change] of [
            [
              'phase',
              (value) => {
                value.nativeStageRecords[0].steps[10].intent.phase = 'review:complete';
              },
            ],
            [
              'timestamp',
              (value) => {
                value.nativeStageRecords[0].steps[11].intent.ts = '2000-01-01T00:00:00.000Z';
              },
            ],
            [
              'original row',
              (value) => {
                value.nativeStageRecords[0].steps[10].intent.row += 'extra';
              },
            ],
            [
              'foreign timing ID',
              (value) => {
                value.nativeStageRecords[0].steps[11].intent.nodeId = 'IC_foreign';
              },
            ],
            [
              'predecessor body',
              (value) => {
                value.nativeStageRecords[0].steps[11].intent.beforeBody += 'extra';
              },
            ],
            [
              'extra intent authority',
              (value) => {
                value.nativeStageRecords[0].steps[11].intent.ready = true;
              },
            ],
            [
              'unrelated local resource',
              (value) => {
                value.nativeStageResources.local.trackerState.bytes += ' ';
              },
            ],
            [
              'unrelated retained comment',
              (value) => {
                value.nativeStageResources.comments.find(
                  (entry) => entry.nodeId !== journal.steps[11].intent.nodeId
                ).bytes += ' ';
              },
            ],
            [
              'missing completed phase readback',
              (value) => {
                value.nativeStageRecords[0].steps[10].readback = null;
              },
            ],
            [
              'coherent unauthorized append',
              (value) => {
                const step = value.nativeStageRecords[0].steps[11],
                  entry = value.nativeStageResources.comments.find(
                    (entry) => entry.nodeId === step.intent.nodeId
                  );
                step.intent.afterBody += 'unrelated source text';
                const raw = JSON.parse(entry.bytes);
                raw.body = step.intent.afterBody;
                entry.bytes = JSON.stringify(raw);
                step.readback.source.body = raw.body;
                step.readback.pages = nativeStageTimingPages({
                  repository: f.context.repository,
                  issue: f.context.issue,
                  comments: value.nativeStageResources.comments,
                });
              },
            ],
          ]) {
            const changed = structuredClone(snapshot);
            change(changed);
            // Preserve a coherent outer linked-step hash so semantic reconstruction,
            // rather than a stale adjacent digest alone, must reject altered data.
            const steps = changed.nativeStageRecords[0].steps;
            steps[11].previous =
              'sha256:' + createHash('sha256').update(canonicalRecordJson(steps[10])).digest('hex');
            let backend,
              observation,
              refused = false;
            try {
              backend = createRevisionMemory(changed);
              observation = await observeRevision({ context: f.context, deps: backend });
            } catch {
              refused = true;
            }
            assert.ok(refused || observation.status !== 'pending-native-stage', label);
            if (backend)
              assert.deepEqual(backend.snapshot, changed, label + ' no reconstruction effects');
          }
        }
        if (/^phase-(11|12)-prefix$/.test(expectStage)) {
          const ordinal = Number(expectStage.split('-')[1]);
        }
        if (expectStage === 'transition-native') {
          const generated = ctx.transitionId;
          assert.equal(journal.header.intent.transitionId, generated);
          const copiedBackend = createRevisionMemory(structuredClone(before));
          await assert.rejects(
            moveState({ ...ctx, revisionBackend: copiedBackend }),
            (error) => error.code === 'revision-authority-unavailable'
          );
          assert.deepEqual(
            copiedBackend.snapshot,
            before,
            'copy of actual generated ID is not original context'
          );
          const originalBackend = createRevisionMemory(structuredClone(before));
          ctx.revisionBackend = originalBackend;
          originalBackend.failBefore = 'native-stage-phase-11-intent-write';
          const repeated = await moveState(ctx);
          assert.equal(repeated.exit, 4);
          assert.equal(ctx.transitionId, generated);
          assert.equal(
            originalBackend.snapshot.nativeStageRecords[0].header.intent.transitionId,
            generated
          );
          assert.equal(originalBackend.snapshot.nativeStageRecords[0].steps.length, 10);
          assert.ok(
            originalBackend.snapshot.nativeStageRecords[0].steps.every((step) => step.readback)
          );
          assert.deepEqual(captureFiles(), localBefore);
        }
        if (
          String(expectStage).startsWith('actor-final-') &&
          String(expectStage).endsWith('-prefix')
        ) {
          const resource = expectStage.split('-')[2];
          const ordinal = { session: 8, actor: 9, tracker: 10 }[resource];
        }
        return;
      }
      if (String(expectStage).startsWith('actor-checkpoint')) {
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords?.[0];
        assert.ok(journal?.steps[2]?.readback, 'native cursor completes before checkpoint');
        const candidate = JSON.parse(journal.header.original.actor.candidateBytes);
        assert.notDeepEqual(
          snapshot.nativeStageResources.local.activeTask,
          journal.header.original.resources.local.activeTask,
          'native checkpoint must persist the independently owned session resource'
        );
        const active = JSON.parse(snapshot.nativeStageResources.local.activeTask.bytes);
        assert.equal(active.issue, candidate.issue);
        assert.equal(active.entryStartTs, candidate.checkpoint.entryStartTs);
        assert.equal(active.wordsAtStart, candidate.checkpoint.wordsAtEntryStart);
        const actor = JSON.parse(snapshot.nativeStageResources.local.actorTiming.bytes);
        assert.equal(actor.state.lastWordMarker, candidate.checkpoint.lastWordMarker);
        assert.equal(actor.state.lastFullWordMarker, candidate.checkpoint.lastFullWordMarker);
        assert.deepEqual(
          journal.steps.slice(3, 6).map((step) => step.kind),
          ['local-session', 'local-actor', 'local-tracker']
        );
        assert.ok(journal.steps.slice(3, 6).every((step) => step.readback));
        assert.equal(
          snapshot.nativeStageResources.local.actorFlush.bytes,
          journal.steps[0].intent.journalBytes,
          'following journal removal still fenced'
        );
        assert.deepEqual(captureFiles(), localBefore);
        assert.equal(
          (
            await observeRevision({
              context: f.context,
              deps: createRevisionMemory(JSON.parse(JSON.stringify(snapshot))),
            })
          ).status,
          'pending-native-stage'
        );
        assert.equal(result.exit, 4);
        assert.deepEqual(
          hostRemovalLocks,
          [],
          'no transient host actor-journal mkdir/rmdir attempt'
        );
        if (String(expectStage).endsWith('-prefix')) {
          const resource = expectStage.split('-')[2];
          const ordinal = { session: 4, actor: 5, tracker: 6 }[resource];
          const key = { session: 'activeTask', actor: 'actorTiming', tracker: 'trackerState' }[
            resource
          ];
        }
        return;
      }
      if (
        [
          'actor-cursor',
          'actor-cursor-legacy',
          'actor-cursor-absent',
          'actor-cursor-prefix',
        ].includes(expectStage)
      ) {
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords?.[0];
        assert.ok(journal?.steps[1]?.readback, 'original native timing publication is complete');
        const candidate = JSON.parse(journal.header.original.actor.candidateBytes);
        assert.ok(candidate.cursor, 'fixture has actual consumed transcript cursor');
        assert.notDeepEqual(
          snapshot.nativeStageResources.local.wordCursor,
          journal.header.original.resources.local.wordCursor,
          'actual original commit must advance its independent memory cursor'
        );
        const next = JSON.parse(snapshot.nativeStageResources.local.wordCursor.bytes);
        assert.equal(next.wordCount.line, candidate.cursor.after.line);
        assert.equal(next.wordCount.words, candidate.cursor.after.words);
        assert.equal(next.wordCount.wordsFull, candidate.cursor.after.wordsFull);
        assert.equal(next.wordCount.task, candidate.issue);
        if (expectStage === 'actor-cursor-absent')
          assert.equal(journal.header.original.resources.local.wordCursor, null);
        if (expectStage === 'actor-cursor-legacy') {
          assert.equal(next.legacyNote, 'preserve original');
          assert.equal(next.wordCount.sticky, 'keep native field');
        }

        assert.equal(journal.steps[2]?.kind, 'actor-cursor');
        assert.equal(
          journal.steps[2]?.readback?.bytes,
          snapshot.nativeStageResources.local.wordCursor.bytes
        );
        assert.deepEqual(
          snapshot.nativeStageResources.local.actorTiming,
          journal.header.original.resources.local.actorTiming,
          'later checkpoint stays fenced'
        );
        assert.deepEqual(captureFiles(), localBefore, 'cursor effect cannot touch host files');
        assert.equal(
          (
            await observeRevision({
              context: f.context,
              deps: createRevisionMemory(JSON.parse(JSON.stringify(snapshot))),
            })
          ).status,
          'pending-native-stage'
        );
        assert.equal(result.exit, 4);
        return;
      }
      if (
        ['actor-publication', 'actor-publication-existing', 'actor-publication-prefix'].includes(
          expectStage
        )
      ) {
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords?.[0];
        assert.ok(journal, 'original native stage header persisted');
        const { appendRow, buildInitialComment } =
          await import('../../../../task-tracker/gh-timing-comment.internals.mjs');
        const candidate = JSON.parse(journal.header.original.actor.candidateBytes);
        const expectedBody = appendRow(buildInitialComment(), candidate.row);
        const original = journal.header.original.resources.comments;
        const current = snapshot.nativeStageResources.comments;
        const existing = expectStage === 'actor-publication-existing';
        assert.equal(
          current.length,
          original.length + (existing ? 0 : 1),
          'actual original publisher must update only its timing resource'
        );
        const target = existing
          ? current.find((entry) => entry.nodeId === 'IC_existing_timing')
          : current.at(-1);
        assert.deepEqual(
          current.filter((entry) => entry.nodeId !== target.nodeId),
          original.filter((entry) => entry.nodeId !== target.nodeId),
          'all unrelated authority comments remain byte-exact'
        );
        assert.equal(
          JSON.parse(target.bytes).body,
          expectedBody,
          'ONE native append serializer owns exact timing body'
        );
        if (existing) {
          const initial = JSON.parse(
            original.find((entry) => entry.nodeId === target.nodeId).bytes
          );
          assert.deepEqual(
            JSON.parse(target.bytes),
            { ...initial, body: expectedBody },
            'existing timing metadata remains exact'
          );
        }
        assert.equal(journal.steps[1]?.kind, 'actor-timing');
        assert.ok(journal.steps[1].readback, 'actual complete timing census readback is durable');
        assert.deepEqual(snapshot.observation, before.observation);
        assert.deepEqual(snapshot.comments, before.comments);
        assert.deepEqual(
          captureFiles(),
          localBefore,
          'native publication cannot create host locks, queue or timing files'
        );
        const restored = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        assert.equal(
          (await observeRevision({ context: f.context, deps: restored })).status,
          'pending-native-stage'
        );
        assert.equal(result.exit, 4, 'later cursor/checkpoint leaves are still fenced');
        return;
      }
      if (expectStage === 'actor-remove')
        f.backend.failBefore = 'native-stage-actor-final-local-session-intent-write';
      if (expectStage === 'actor-journal') {
        const snapshot = f.backend.snapshot,
          journal = snapshot.nativeStageRecords?.[0];
        assert.ok(journal, 'actual private stage header was persisted');
        const first = journal.steps[0];
        assert.equal(
          journal.header.original.resources.local.actorFlush,
          null,
          'fixed effect preserves immutable original actor resource'
        );
        assert.equal(
          snapshot.nativeStageResources.local.actorFlush?.bytes,
          first.intent.journalBytes,
          'same native emitter must execute the fixed journal effect into independent memory resource'
        );
        assert.deepEqual(first.readback, {
          file: journal.header.original.actor.capture.journalFile,
          bytes: first.intent.journalBytes,
        });
        assert.deepEqual(snapshot.observation, before.observation);
        assert.deepEqual(snapshot.comments, before.comments);
        assert.deepEqual(
          captureFiles(),
          localBefore,
          'memory actor resource cannot touch host locks, tmp, journal or state files'
        );
        const restored = createRevisionMemory(JSON.parse(JSON.stringify(snapshot)));
        assert.equal(
          (await observeRevision({ context: f.context, deps: restored })).status,
          'pending-native-stage'
        );
        assert.equal(result.exit, 4, 'later actor publication still has no fixed leaf');

        return;
      }
      if (expectStage === 'intent') {
        const snapshot = f.backend.snapshot;
        assert.equal(
          snapshot.nativeStageRecords?.length,
          1,
          'real original header must be durable before first effect'
        );
        const journal = snapshot.nativeStageRecords[0];
        assert.equal(journal.schema, 'aitm.native-stage/v1');
        assert.equal(journal.steps.length, 1);
        assert.equal(journal.steps[0].kind, 'actor-journal-prepare');
        assert.equal(journal.steps[0].readback, null);
        assert.equal(journal.steps[0].previous, journal.header.id);
        assert.equal(snapshot.nativeOrder.at(-1).kind, 'stage');
        assert.equal(snapshot.nativeOrder.at(-1).id, journal.header.id);
        assert.equal(journal.header.predecessor, before.nativeOrder.at(-1).id);
        assert.deepEqual(snapshot.observation, before.observation);
        assert.deepEqual(snapshot.comments, before.comments);
        assert.deepEqual(snapshot.nativeStageResources, journal.header.original.resources);
        assert.deepEqual(
          captureFiles(),
          localBefore,
          'stage journal is memory-owned, no host leaf write'
        );
        const restored = createRevisionMemory(snapshot);
        assert.equal(
          (await observeRevision({ context: f.context, deps: restored })).status,
          'pending-native-stage'
        );
        assert.deepEqual(restored.snapshot.nativeStageRecords, snapshot.nativeStageRecords);
        const { canonicalRecordJson } =
          await import('../../../../task-tracker/lib/github-records/canonical-json.mjs');
        const persisted = path.join(f.projectDir, '.tmp/aitm/stage-snapshot.json');
        writeFileSync(persisted, canonicalRecordJson(snapshot));
        const roundtrip = createRevisionMemory(JSON.parse(readFileSync(persisted, 'utf8')));
        assert.equal(
          (await observeRevision({ context: f.context, deps: roundtrip })).status,
          'pending-native-stage'
        );
        assert.equal(
          roundtrip.snapshot.nativeStageRecords[0].steps[0].intent.journalBytes,
          journal.steps[0].intent.journalBytes
        );
        const effects = [];
        await assert.rejects(
          mutateIssueBody({
            issueNumber: f.context.issue,
            repo: f.context.repository,
            projectDir: f.projectDir,
            mutate: (body) => {
              effects.push('mutate');
              return body;
            },
            deps: {
              revisionBackend: roundtrip,
              pexec: async () => {
                effects.push('transport');
              },
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        await assert.rejects(
          moveState({
            ...ctx,
            revisionBackend: roundtrip,
            _createTransitionId: () => {
              effects.push('transition');
              return 'forged';
            },
          }),
          (error) => error.code === 'revision-pending'
        );
        assert.deepEqual(effects, []);
        for (const [label, change] of [
          [
            'missing independent resources',
            (value) => {
              delete value.nativeStageResources;
            },
          ],
          [
            'unrelated current local resource',
            (value) => {
              value.nativeStageResources.local.queue = { bytes: '{}' };
            },
          ],
          [
            'missing earlier proof',
            (value) => {
              value.nativeProofRecords.pop();
            },
          ],
          [
            'wrong stage predecessor',
            (value) => {
              value.nativeStageRecords[0].header.predecessor = null;
            },
          ],
          [
            'coherent wrong source option',
            (value) => {
              const header = value.nativeStageRecords[0].header;
              const walk = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const [key, item] of Object.entries(obj)) {
                  if (key === 'optionId' && item === 'OPTION_develop') obj[key] = 'OPTION_other';
                  else walk(item);
                }
              };
              walk(header.guardCapture.lifecycleSources.remote.stageItem);
              walk(header.original.membership);
              header.original.resources.membership.bytes =
                header.original.resources.membership.bytes.replaceAll(
                  'OPTION_develop',
                  'OPTION_other'
                );
              value.nativeStageResources = structuredClone(header.original.resources);
            },
          ],
          [
            'actor activity threshold disagrees with native config',
            (value) => {
              value.nativeStageRecords[0].header.original.actor.capture.activity.idleThresholdMs++;
            },
          ],
        ]) {
          const changed = structuredClone(snapshot);
          change(changed);
          const header = changed.nativeStageRecords[0].header;
          const { id: previousId, ...unsigned } = header;
          header.id = hashBytes(canonicalRecordJson(unsigned));
          changed.nativeStageRecords[0].steps[0].previous = header.id;
          changed.nativeOrder.at(-1).id = header.id;
          let rejected = false;
          try {
            const bad = createRevisionMemory(changed);
            const read = await observeRevision({ context: f.context, deps: bad });
            rejected = read.status === 'indeterminate';
            assert.ok(
              bad.effects.every((effect) => !effect.endsWith('-write')),
              label
            );
          } catch (error) {
            rejected = /criteria-revision:/.test(error.message);
          }
          assert.ok(rejected, label);
        }

        return;
      }
      if (expectStage === 'preparation') {
        assert.equal(result.phase, 'authority');
        assert.equal(result.code, 'revision-authority-unavailable');
        assert.equal(result.preparationReason, 'durable-stage-effect-unavailable');
        assert.equal(result.exit, 4);
        assert.deepEqual(
          captureFiles(),
          localBefore,
          'original emitter cancellation cannot leave any host file mutation'
        );
        assert.equal(f.backend.snapshot.nativeStageRecords.length, 1);
        assert.deepEqual(f.backend.snapshot.observation, before.observation);
        assert.deepEqual(f.backend.snapshot.comments, before.comments);
        // The subsequent negative preparations start from the genuinely retained
        // pre-stage fixture, not from the now-pending stage. No production history
        // is deleted; each is a separate recognized-memory scenario.
        f.restart((snapshot) => {
          for (const key of Object.keys(snapshot)) delete snapshot[key];
          Object.assign(snapshot, structuredClone(before));
        });
        ctx.revisionBackend = f.backend;
        const { actorTimingStatePath } =
          await import('../../../../task-tracker/lib/actor-timing-state.mjs');
        const { aiAppName } = await import('../../../../task-tracker/word-counter.mjs');
        const actorFile = actorTimingStatePath(
          { provider: aiAppName(), sid: currentSessionId() },
          f.projectDir
        );
        const originalActor = readFileSync(actorFile, 'utf8');
        for (const [file, reason] of [
          [actorFile + '.flush.json', 'actor-journal-present'],
          [actorFile, 'actor-candidate-unavailable'],
        ]) {
          writeFileSync(file, '{malformed native source');
          const damagedBefore = captureFiles();
          const denied = await moveState(ctx);
          assert.equal(denied.phase, 'authority');
          assert.equal(denied.preparationReason, reason);
          assert.equal(denied.code, 'revision-authority-unavailable');
          assert.deepEqual(
            captureFiles(),
            damagedBefore,
            'failed/no-candidate emitter cannot write or hang'
          );
          assert.deepEqual(f.backend.snapshot, before);
          if (file === actorFile) writeFileSync(actorFile, originalActor);
          else rmSync(file);
        }
        const originalTiming = structuredClone(f.backend.snapshot.lifecycleSources.remote.timing);
        for (const [name, change] of [
          [
            'missing census',
            (timing) => {
              timing.pages = [];
            },
          ],
          [
            'failed legacy read',
            (timing) => {
              timing.legacy.response.exitCode = 1;
            },
          ],
          [
            'legacy census disagreement',
            (timing) => {
              timing.legacy.response.stdout = JSON.stringify({
                comments: [{ id: 'IC_false', body: '## ⏱ Timing Log\nUnobserved timing' }],
              });
            },
          ],
          [
            'malformed actor row',
            (timing) => {
              Object.assign(
                timing,
                nativeTimingSources(f.context, [
                  {
                    id: 'IC_malformed',
                    body: '## ⏱ Timing Log\n| 2026-10-06 00:00:00 +00:00 | update | 0 | 0 | 0 | 0 | bad | 0 | <!-- aitm-actor:v1 key=invalid -->',
                  },
                ])
              );
            },
          ],
        ]) {
          f.restart((snapshot) => {
            snapshot.lifecycleSources.remote.timing = structuredClone(originalTiming);
            change(snapshot.lifecycleSources.remote.timing);
          });
          const damagedBefore = captureFiles(),
            originalBackend = structuredClone(f.backend.snapshot);
          const denied = await moveState({ ...ctx, revisionBackend: f.backend });
          assert.equal(denied.preparationReason, 'complete-original-timing', name);
          assert.deepEqual(captureFiles(), damagedBefore);
          assert.deepEqual(f.backend.snapshot, originalBackend);
        }
        const originalRest = structuredClone(before.lifecycleSources.remote.stageComments);
        for (const [name, change] of [
          [
            'missing REST census',
            (remote) => {
              delete remote.stageComments;
            },
          ],
          [
            'REST partial read',
            (remote) => {
              remote.stageComments.response.stderr = 'partial';
            },
          ],
          [
            'extra unmatched native comment',
            (remote) => {
              const pages = JSON.parse(remote.stageComments.response.stdout);
              pages[0].push({
                id: 99999,
                node_id: 'IC_extra',
                body: 'unmatched extra',
                issue_url: `https://api.github.com/repos/${f.context.repository}/issues/${f.context.issue}`,
              });
              remote.stageComments.response.stdout = JSON.stringify(pages);
            },
          ],
        ]) {
          f.restart((snapshot) => {
            snapshot.lifecycleSources.remote.timing = structuredClone(originalTiming);
            snapshot.lifecycleSources.remote.stageComments = structuredClone(originalRest);
            change(snapshot.lifecycleSources.remote);
          });
          const current = structuredClone(f.backend.snapshot),
            damagedBefore = captureFiles();
          const denied = await moveState({ ...ctx, revisionBackend: f.backend });
          assert.equal(denied.preparationReason, 'complete-original-comments', name);
          assert.deepEqual(f.backend.snapshot, current);
          assert.deepEqual(captureFiles(), damagedBefore);
        }
        const originalItem = JSON.parse(JSON.stringify(before.lifecycleSources.remote.stageItem));
        for (const [name, change] of [
          [
            'missing item capture',
            (remote) => {
              delete remote.stageItem;
            },
          ],
          [
            'foreign item membership',
            (remote) => {
              remote.stageItem.membership[0].response.repository.issue.projectItems.nodes[0].id =
                'PVTI_foreign';
            },
          ],
          [
            'non-Develop item',
            (remote) => {
              remote.stageItem.membership[0].response.repository.issue.projectItems.nodes[0].fieldValues.nodes[0].name =
                'Test';
              remote.stageItem.final[0].response.node.fieldValueByName.name = 'Test';
            },
          ],
        ]) {
          f.restart((snapshot) => {
            snapshot.lifecycleSources.remote.timing = structuredClone(originalTiming);
            snapshot.lifecycleSources.remote.stageComments = structuredClone(originalRest);
            snapshot.lifecycleSources.remote.stageItem = JSON.parse(JSON.stringify(originalItem));
            change(snapshot.lifecycleSources.remote);
          });
          const current = structuredClone(f.backend.snapshot),
            damagedBefore = captureFiles();
          const denied = await moveState({ ...ctx, revisionBackend: f.backend });
          assert.equal(denied.preparationReason, 'complete-original-item', name);
          assert.deepEqual(f.backend.snapshot, current);
          assert.deepEqual(captureFiles(), damagedBefore);
        }
        f.restart((snapshot) => {
          snapshot.lifecycleSources.remote.stageItem = JSON.parse(JSON.stringify(originalItem));
        });
        for (const filename of ['project-fields.json', 'project-field-events.json']) {
          const file = path.join(f.projectDir, '.ai-task-manager', filename);
          writeFileSync(file, '{malformed original native source');
          const current = structuredClone(f.backend.snapshot),
            damagedBefore = captureFiles();
          const denied = await moveState({ ...ctx, revisionBackend: f.backend });
          assert.equal(denied.preparationReason, 'complete-original-fields', filename);
          assert.deepEqual(f.backend.snapshot, current);
          assert.deepEqual(captureFiles(), damagedBefore);
          rmSync(file);
        }
        const { buildContext } = await import('../../../../task-tracker/runtime.mjs');
        const queueFile = buildContext(['status']).queuePath;
        writeFileSync(queueFile, '{malformed original queue');
        const queueBefore = captureFiles(),
          current = structuredClone(f.backend.snapshot);
        const queueDenied = await moveState({ ...ctx, revisionBackend: f.backend });
        assert.equal(queueDenied.preparationReason, 'complete-original-local');
        assert.deepEqual(f.backend.snapshot, current);
        assert.deepEqual(captureFiles(), queueBefore);
        rmSync(queueFile);
        // Real filesystem drift at the final awaited original-history boundary.
        // Native clock values remain unchanged; this fixture probe schedules an
        // external edit after actual historical Plan validation yields.
        const configFile = path.join(f.projectDir, '.ai-task-manager/task-tracker.json');
        const originalConfig = readFileSync(configFile, 'utf8');
        const originalNow = Date.now;
        let historySourceChanged = false;
        const clockProbe = t.mock.method(Date, 'now', function () {
          const value = originalNow();
          const stack = new Error().stack;
          if (
            !historySourceChanged &&
            stack.includes('at derivePlanExtension') &&
            stack.includes('at reconstructNativePlanRecord')
          ) {
            historySourceChanged = true;
            queueMicrotask(() =>
              writeFileSync(
                configFile,
                JSON.stringify({ ...cfg, kanbanOptionTest: 'OPTION_foreign' })
              )
            );
          }
          return value;
        });
        try {
          const driftResult = await moveState({ ...ctx, revisionBackend: f.backend });
          assert.equal(
            historySourceChanged,
            true,
            'actual native historical Plan time validation was reached'
          );
          assert.equal(driftResult.preparationReason, 'complete-original-current-sources');
          assert.deepEqual(f.backend.snapshot, current);
        } finally {
          clockProbe.mock.restore();
          writeFileSync(configFile, originalConfig);
        }
        f.restart((snapshot) => {
          snapshot.nativePlanRecords = [];
          snapshot.nativeOrder = snapshot.nativeOrder.filter((ref) => ref.kind !== 'plan');
          snapshot.nativeOrder.forEach((ref, index, refs) => {
            ref.predecessor = refs[index - 1]?.id ?? null;
          });
        });
        const noPlanHistory = structuredClone(f.backend.snapshot),
          historyFiles = captureFiles();
        const historyDenied = await moveState({ ...ctx, revisionBackend: f.backend });
        assert.equal(historyDenied.preparationReason, 'complete-original-history');
        assert.deepEqual(f.backend.snapshot, noPlanHistory);
        assert.deepEqual(captureFiles(), historyFiles);
        assert.deepEqual(captureFiles(), localBefore);
        return;
      }
      if (expectStage) {
        assert.notEqual(
          result.phase,
          'guard',
          'complete actual native guards must reach the ordinary first stage effect; current explicit missing-stage-authority fence is the RED'
        );
        assert.equal(result.exit, null);
        assert.equal(result.boardMoved, true);
        assert.equal(result.sentinelPresent, true);
        return;
      }
      assert.equal(result.phase, 'guard');
      assert.equal(result.exit, 4);
      assert.equal(result.boardMoved, false);
      assert.equal(result.sentinelPresent, false);
      assert.deepEqual(f.backend.snapshot, before);
    } finally {
      f.dispose();
    }
  });
}
