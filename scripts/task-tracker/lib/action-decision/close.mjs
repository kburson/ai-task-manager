// @story #1669
// Advisory close collection: all I/O is confined to command-local observations.
import { readLastKnownState } from '../../gh-timing-comment.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { fetchAssignmentSnapshot } from '../assignment-snapshot.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import {
  createGithubWorkflowBoundaryRuntime,
  evaluateWorkflowBoundary,
} from '../workflow-policy/enforcement.mjs';
import { projectFunctionalDod } from '../functional-dod-project.mjs';
import {
  requireDeliveryReceipt,
  requireEvidenceV2DeliveryReceipt,
  verifyCloseDeliveryReceipt,
} from '../close-delivery-receipt.mjs';
import { parseVerificationReceipt } from '../verification-receipt.mjs';
import { evaluateCompleteGuards, evaluateExactTrunkAttribution } from './evaluate.mjs';
import { createObservationAttempt } from './observations.mjs';
import { resolveProjectDir } from '../project-dir.mjs';
import { readWorktreeIdentity } from '../worktree-binding-guard.mjs';
import { buildGraphNodeAuthority } from '../graph-node-authority.mjs';
import { resolveEpicLineage } from '../resolve-epic-lineage.mjs';
import { PROTOCOL_MARKER_RE } from '../evidence-v2/protocol.mjs';
import { isIssueResidentDeliveryKind, parseIssueKind } from '../issue-kind.mjs';
import { findCommitTrailComment, parseCommitShas } from '../code-complete-gate.mjs';
import { observeDependencyReadiness } from '../dependency-disposition.mjs';
import { runGuards } from '../guard-registry.mjs';
import {
  hasUnauthorizedCloseRecoveryMarker,
  readUnauthorizedCloseRecovery,
} from '../closed-issue-convergence.mjs';
import {
  epicTrailLogArgs,
  parseEpicTrailLog,
  groupCommitsByChild,
  partitionChildrenByDeliveryRequirement,
} from '../epic-derived-commit-trail.mjs';

/** Read-only readers share no state across command boundaries. */
export function createCloseReadOnlyPorts({ issue, cfg, projectDir, deps = {} }) {
  const transport = deps.run ?? pexec;
  const run = async (command, args, options) => {
    const gitRead =
      command === 'git' &&
      [
        'rev-parse',
        'status',
        'branch',
        'ls-remote',
        'cat-file',
        'rev-list',
        'log',
        'show',
        'merge-base',
      ].includes(args[0]) &&
      (args[0] !== 'branch' || args[1] === '--show-current');
    const ghRead =
      command === 'gh' &&
      ((args[0] === 'issue' && args[1] === 'view') ||
        (args[0] === 'pr' && ['view', 'list'].includes(args[1])) ||
        (args[0] === 'api' &&
          !args.includes('--method') &&
          !args.includes('-X') &&
          !args.some((arg) => /\bmutation\b/.test(arg)) &&
          (args.includes('graphql') ||
            !args.some((arg) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(arg)))));
    if (!gitRead && !ghRead) throw new TypeError('close-readiness:effect-forbidden');
    return transport(command, args, options);
  };
  const output = async (command, args) => (await run(command, args, { cwd: projectDir })).stdout;
  const fetchBoard = deps.fetchBoard ?? fetchAssignmentSnapshot;
  const readWorktree = async () => {
    const bound = (deps.resolveBoundDir ?? resolveProjectDir)({
      issue,
      deps: { invokingDir: projectDir },
    });
    const identity = deps.worktreeIdentity ?? readWorktreeIdentity;
    const [headSha, dirty] = await Promise.all([
      output('git', ['rev-parse', 'HEAD']),
      output('git', ['status', '--porcelain', '--untracked-files=no']),
    ]);
    return {
      matches:
        identity({ projectDir }).worktreePath === identity({ projectDir: bound }).worktreePath,
      headSha: headSha.trim(),
      dirtyPaths: dirty
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3)),
    };
  };
  const readChildren = async ({ issue: parent = issue } = {}) => {
    const pages = JSON.parse(
      await output('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${cfg.repo}/issues/${parent}/sub_issues?per_page=100`,
      ])
    );
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new TypeError('close-readiness:children-pages');
    const source = pages.flat();
    const seen = new Set();
    const children = [];
    for (const child of source) {
      if (
        !Number.isSafeInteger(child?.number) ||
        child.number <= 0 ||
        seen.has(child.number) ||
        !['open', 'closed'].includes(child.state) ||
        typeof child.body !== 'string'
      )
        throw new TypeError('close-readiness:children-identity');
      seen.add(child.number);
      const board = await fetchBoard({ issueNumber: child.number, cfg });
      if (typeof board?.state !== 'string' || !board.state || board.state === 'unknown')
        throw new TypeError('close-readiness:children-board');
      const recovery = readUnauthorizedCloseRecovery(child.body);
      if (hasUnauthorizedCloseRecoveryMarker(child.body) && !recovery)
        throw new TypeError('close-readiness:child-recovery-malformed');
      children.push({
        number: child.number,
        body: child.body,
        state: board.state,
        boardState: board.state,
        issueState: child.state,
        closeReason: child.state_reason ?? null,
        recoveryPhase: recovery?.phase === 'complete' ? null : (recovery?.phase ?? null),
      });
    }
    return { complete: true, children };
  };
  const readGraph =
    deps.readGraph ??
    (async (number) => {
      const [owner, name] = cfg.repo.split('/');
      const query =
        'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){number body parent{number body}}}}';
      const response = JSON.parse(
        await output('gh', [
          'api',
          'graphql',
          '-f',
          `query=${query}`,
          '-f',
          `owner=${owner}`,
          '-f',
          `name=${name}`,
          '-F',
          `number=${number}`,
        ])
      );
      const node = response?.data?.repository?.issue;
      if (
        response.errors?.length ||
        node?.number !== number ||
        typeof node.body !== 'string' ||
        !Object.hasOwn(node, 'parent')
      )
        throw new TypeError('close-readiness:lineage-unavailable');
      const snapshot = await readChildren({ issue: number });
      return buildGraphNodeAuthority({
        parent: node.parent?.number ?? null,
        parentBody: node.parent?.body,
        ownBody: node.body,
        children: snapshot.children,
        mapChild: (child) => child,
      });
    });
  const readDelivery = async ({ body }) => {
    if (PROTOCOL_MARKER_RE.test(body))
      throw new TypeError('close-readiness:evidence-v2-read-only-cycle-unavailable');
    if (/aitm-incorporated-close|aitm-close-disposition[^]*?incorporated/.test(body))
      throw new TypeError('close-readiness:incorporated-authorization-unavailable');
    let trunk = cfg.trunkRef;
    if (typeof trunk !== 'string' || !trunk)
      throw new TypeError('close-readiness:trunk-configuration-unavailable');
    const local = trunk.startsWith('refs/heads/');
    trunk = trunk.replace(/^(?:refs\/heads\/|origin\/)/, '');
    const graph = new Map();
    let number = issue;
    let target;
    for (;;) {
      if (graph.has(number)) throw new TypeError('close-readiness:lineage-cycle');
      const node = await readGraph(number);
      graph.set(number, node);
      const lineage = resolveEpicLineage(number, { deps: { graph: () => node, trunk } });
      target = lineage.parentBranch;
      if (node.parent === null || local) break;
      const remote = (await output('git', ['ls-remote', 'origin', `refs/heads/${target}`])).trim();
      if (remote) {
        if (
          !new RegExp(
            `^[a-f0-9]{40,64}\\s+${`refs/heads/${target}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
          ).test(remote)
        )
          throw new TypeError('close-readiness:lineage-ref-ambiguous');
        break;
      }
      number = node.parent;
    }
    const { loadCloseDeliveryGateInput, resolveCloseLifecycleEvidence } =
      await import('../../verbs/close.mjs');
    const lifecycleEvidence = await resolveCloseLifecycleEvidence({
      body,
      issueNumber: issue,
      repository: cfg.repo,
      projectDir,
      deps: deps.lifecycleEvidenceDeps,
    });
    const gateInput = await loadCloseDeliveryGateInput({
      issueNumber: issue,
      cfg: { ...cfg, trunkRef: trunk },
      projectDir,
      pexec: run,
      body,
      lifecycleEvidence,
      ctx: {
        resolveCloseParentIssue: async () => graph.get(issue).parent,
        fetchClosePullRequestEvidence: async () => {
          throw new TypeError('close-readiness:external-pr-source-proof-unavailable');
        },
        loadWorkflowBoundary: deps.loadWorkflowBoundary,
        workflowPolicyRuntime: deps.workflowPolicyRuntime,
      },
    });
    gateInput.lineage.deliveryTarget = target;
    return {
      mode:
        isIssueResidentDeliveryKind(body) && gateInput.pullRequests.length === 0
          ? 'no-commit'
          : 'ordinary',
      gateInput,
      lifecycleEvidence,
      authority: local ? { localRef: target } : { remote: 'origin' },
      graph: [...graph.entries()],
    };
  };
  const readGuardAuthority = async ({ delivery } = {}) => {
    const pages = JSON.parse(
      await output('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${cfg.repo}/issues/${issue}/comments?per_page=100`,
      ])
    );
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new TypeError('close-readiness:comment-pages');
    const comments = pages.flat();
    if (comments.some((comment) => typeof comment?.body !== 'string'))
      throw new TypeError('close-readiness:comment-body');
    const trail = findCommitTrailComment(comments);
    const files = {};
    for (const sha of parseCommitShas(trail?.body)) {
      if (!/^[a-f0-9]{7,64}$/.test(sha)) throw new TypeError('close-readiness:commit-identity');
      await output('git', ['cat-file', '-e', `${sha}^{commit}`]);
      files[sha] = (await output('git', ['show', '--name-only', '--pretty=format:', sha]))
        .split('\n')
        .filter(Boolean);
    }
    const dependency = await observeDependencyReadiness({
      issueNumber: issue,
      cfg,
      deps: { nativeDependencies: { pexec: run }, fetchAssignmentSnapshot: fetchBoard },
    });
    if (dependency.status === 'unknown')
      throw new TypeError('close-readiness:dependency-authority-unavailable');
    const dirty = (await output('git', ['status', '--porcelain', '--untracked-files=no']))
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
    const parent = delivery?.gateInput?.lineage?.parentIssueNumber;
    const parentState =
      parent == null ? null : (await fetchBoard({ issueNumber: parent, cfg })).state;
    if (parent != null && (!parentState || parentState === 'unknown'))
      throw new TypeError('close-readiness:parent-board-unavailable');
    return {
      comments,
      files,
      dirty,
      parentState,
      dependency: { ...dependency, states: [...dependency.states] },
    };
  };
  const runReadOnlyGuards = async (from, to, context, authority) => {
    if (
      from !== 'review' ||
      to !== 'done' ||
      !authority ||
      !Array.isArray(context.children) ||
      !Array.isArray(context.delivery?.graph) ||
      !SHA.test(context.attribution?.tip?.sha ?? '')
    )
      throw new TypeError('close-readiness:guard-authority-unavailable');
    const nodes = new Map(context.delivery.graph);
    const own = nodes.get(issue);
    if (!own || own.authorityError || own.parentAuthorityError)
      throw new TypeError('close-readiness:guard-lineage-unavailable');
    const tip = context.attribution.tip.sha;
    const gateInput = context.delivery.gateInput;
    const receiptGate = requireDeliveryReceipt(gateInput);
    if (!receiptGate.skipped) {
      const { inspectCloseMergeCommit } = await import('../../verbs/close.mjs');
      await verifyCloseDeliveryReceipt({
        gateInput,
        receiptGate,
        testReceiptSha:
          parseVerificationReceipt(gateInput.body, 'test')?.commitSha ??
          context.lifecycleEvidence?.expectedSha,
        acceptedReviewSha: gateInput.acceptedSha,
        deps: {
          // Completeness was already established against this exact tip. Never fetch.
          fetchOriginTrunk: async ({ remote, branch }) => {
            if (remote !== 'origin' || branch !== gateInput.lineage.deliveryTarget)
              throw new TypeError('close-readiness:unobserved-target');
          },
          isAncestor: async ({ ancestor, descendant }) => {
            const target =
              descendant === `origin/${gateInput.lineage.deliveryTarget}` ? tip : descendant;
            if (!SHA.test(ancestor ?? '') || !SHA.test(target ?? ''))
              throw new TypeError('close-readiness:ancestry-ref');
            await output('git', ['cat-file', '-e', `${ancestor}^{commit}`]);
            await output('git', ['cat-file', '-e', `${target}^{commit}`]);
            try {
              await output('git', ['merge-base', '--is-ancestor', ancestor, target]);
              return true;
            } catch (error) {
              if (error.code === 1) return false;
              throw error;
            }
          },
          inspectMergeCommit: ({ mergeCommitSha }) =>
            inspectCloseMergeCommit({ pexec: run, projectDir, mergeCommitSha }),
          attributingCommits: async () => {
            throw new TypeError('close-readiness:unobserved-attribution');
          },
        },
      });
    }
    await import('../guard-bootstrap.mjs');
    return runGuards(from, to, {
      ...context,
      deps: {
        reconcileDependencyDisposition: async () => {},
        observeDependencyReadiness: async () => ({
          ...authority.dependency,
          states: new Map(authority.dependency.states),
        }),
        fetchParentIssue: async () => own.parent,
        readParentStatus: async ({ parentEpicNumber }) => {
          if (parentEpicNumber !== own.parent || !authority.parentState)
            throw new TypeError('close-readiness:unobserved-parent');
          return authority.parentState;
        },
        epicChildren: { fetchSiblings: async () => context.children },
        closeGates: {
          getHeadSha: async () => context.headSha,
          listComments: async () => authority.comments,
          filesForSha: async (sha) => {
            if (!Object.hasOwn(authority.files, sha))
              throw new TypeError('close-readiness:unobserved-commit');
            return authority.files[sha];
          },
          dirtyFiles: async () => new Set(authority.dirty),
          // The legacy lineage gate receives immutable object names only. The
          // original named graph and target ref remain in the observation above.
          resolveTrunkRef: async () => tip,
          graph: (number) => {
            if (number !== issue) throw new TypeError('close-readiness:unobserved-graph');
            return {
              ...own,
              children: context.children,
              ...(own.parent === null ? {} : { parentAuthoritativeBranch: tip }),
            };
          },
          branchExists: (branch) => branch === tip,
          attributingCommits: async (_number, { refs }) => {
            if (refs.length !== 1 || refs[0] !== tip)
              throw new TypeError('close-readiness:unobserved-ref');
            return context.attribution.status === 'attributed' ? [tip] : [];
          },
          epicTrailLog: async ({ epicHead }) => {
            if (epicHead !== tip) throw new TypeError('close-readiness:unobserved-ref');
            return output('git', epicTrailLogArgs(tip));
          },
        },
      },
    });
  };
  const hasAttributingCommit = async (_issue, { refs, cwd }) => {
    const { hasAttributingCommit: read } = await import('../commit-attribution.mjs');
    return read(_issue, { refs, cwd, pexec: run });
  };
  return {
    readWorktree,
    readChildren,
    readDelivery,
    readGuardAuthority,
    runReadOnlyGuards,
    hasAttributingCommit,
    run,
    execGit: (args, options) => run('git', args, options),
  };
}

const SHA = /^[a-f0-9]{40,64}$/;
const unavailable = (issue, source, reason = 'incomplete') => ({
  guardId: 'authority-collection',
  code: 'authority-read-failed',
  args: { source, reason, subject: { issue } },
  noAutomaticRemediation: { reason: 'authority-investigation-required' },
});
const legacy = (guardId) => ({
  guardId,
  code: 'unclassified-refusal',
  args: {},
  noAutomaticRemediation: { reason: 'legacy-guard-requires-human-investigation' },
});
const typed = (refusal) => ({
  guardId: refusal.guardId ?? refusal.id,
  code: refusal.code,
  args: refusal.args ?? {},
  ...(refusal.remediation
    ? { remediation: refusal.remediation }
    : { noAutomaticRemediation: refusal.noAutomaticRemediation }),
});

/** All seven collector fields are present on every return, including missing authority. */
export async function collectCloseReadiness({ issue, attempt, ports = {} } = {}) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new TypeError('close-readiness:issue');
  if (typeof attempt?.observe !== 'function' || typeof ports.scope !== 'string')
    throw new TypeError('close-readiness:attempt');
  const observations = [];
  const blockers = [];
  let indeterminate = false;
  let warnings = [];
  let normalizations = [];
  let humanDecision = null;
  const fail = (source) => {
    indeterminate = true;
    blockers.push(unavailable(issue, source));
  };
  const read = async (resource, identity) => {
    try {
      const observation = await attempt.observe({ resource, identity, scope: ports.scope });
      observations.push(observation);
      if (observation.status !== 'observed') {
        indeterminate = true;
        blockers.push(observation.cause ?? unavailable(issue, resource));
        return null;
      }
      return observation.value;
    } catch {
      fail(resource);
      return null;
    }
  };
  const bodyValue = await read('issue-body', `issue:${issue}:1`);
  const board = await read('project-board', `issue:${issue}:2`);
  const worktree = await read('worktree', `worktree:${issue}`);
  const delivery = await read('delivery', `evidence:${issue}:1`);
  const attribution = await read('delivery', `evidence:${issue}:2`);
  const children = await read('delivery', `evidence:${issue}:3`);
  const body = bodyValue?.body;
  const head = worktree?.headSha;
  const recoveryPresent = typeof body === 'string' && hasUnauthorizedCloseRecoveryMarker(body);
  const recovery = recoveryPresent ? readUnauthorizedCloseRecovery(body) : null;
  if (
    bodyValue &&
    (bodyValue.number !== issue ||
      typeof body !== 'string' ||
      !['OPEN', 'CLOSED'].includes(bodyValue.state))
  )
    fail('issue-body');
  if (
    bodyValue &&
    board &&
    (readLastKnownState(body).state !== 'review' ||
      board.state !== 'review' ||
      bodyValue.state === 'CLOSED' ||
      (recoveryPresent && recovery?.phase !== 'complete'))
  ) {
    indeterminate = true;
    blockers.push({
      guardId: 'action-navigation',
      code: 'state-unavailable',
      args: { reason: 'conflicting' },
      noAutomaticRemediation: { reason: 'state-investigation-required' },
    });
  }
  if (
    worktree &&
    (!SHA.test(head ?? '') || worktree.matches !== true || (ports.head && ports.head !== head))
  )
    fail('worktree');
  if (children && (children.complete !== true || !Array.isArray(children.children)))
    fail('delivery');
  if (attribution) {
    const tip = attribution.tip;
    const target = delivery?.gateInput?.lineage?.deliveryTarget;
    if (
      !['attributed', 'not-attributed'].includes(attribution.status) ||
      tip?.objectComplete !== true ||
      tip.shallow !== false ||
      !SHA.test(tip.sha ?? '') ||
      tip.ref !== `refs/heads/${target}` ||
      !(tip.authority === 'local' || typeof tip.remote === 'string')
    ) {
      indeterminate = true;
      blockers.push({
        guardId: 'authority-collection',
        code: 'attribution-authority-unavailable',
        args: {},
        noAutomaticRemediation: { reason: 'authority-investigation-required' },
      });
    } else if (attribution.status === 'not-attributed')
      blockers.push(legacy('review-exit-close-gates'));
  }
  if (delivery) {
    const input = delivery.gateInput;
    if (
      input?.issueNumber !== issue ||
      input.repository !== ports.cfg?.repo ||
      input.body !== body ||
      !SHA.test(input.acceptedSha ?? '')
    )
      fail('delivery');
    else {
      try {
        if (delivery.mode === 'evidence-v2')
          requireEvidenceV2DeliveryReceipt(delivery.receiptInput);
        else if (delivery.mode === 'ordinary' || delivery.mode === 'no-commit')
          requireDeliveryReceipt(input);
        else fail('delivery'); // Incorporated close has separate human authorization; never infer it.
      } catch (error) {
        if (
          error?.name === 'CloseDeliveryReceiptError' &&
          !['input', 'malformed'].includes(error.category)
        )
          blockers.push(legacy('verb:close'));
        else fail('delivery');
      }
    }
  }
  if (typeof body === 'string' && SHA.test(head ?? '')) {
    const projection = projectFunctionalDod({
      body,
      head,
      evaluatedAt: ports.evaluatedAt ?? new Date().toISOString(),
    });
    normalizations = projection.normalization ? [projection.normalization] : [];
    if (typeof ports.runGuards !== 'function') fail('local-config');
    else {
      const { guardResult } = await evaluateCompleteGuards({
        fromState: 'review',
        toState: 'done',
        context: {
          issueNumber: issue,
          repo: ports.cfg?.repo,
          cfg: ports.cfg,
          projectDir: ports.projectDir,
          body: projection.body,
          fromState: 'review',
          toState: 'done',
          readOnly: true,
          headSha: head,
          delivery,
          attribution,
          children: children?.children,
          lifecycleEvidence: delivery?.lifecycleEvidence ?? null,
          deps: ports.deps ?? {},
        },
        runGuards: ports.runGuards,
        loadPolicy: ports.loadPolicy ?? (async () => ({ status: 'indeterminate' })),
      });
      indeterminate ||= guardResult.status === 'indeterminate';
      blockers.push(...guardResult.refusals.map(typed));
      warnings = (guardResult.warns ?? []).map(({ code, args }) => ({ code, args }));
      humanDecision = guardResult.humanDecision;
    }
  }
  const seenAuthoritySources = new Set();
  const uniqueBlockers = blockers.filter((blocker) => {
    if (!['authority-read-failed', 'authority-read-skipped'].includes(blocker.code)) return true;
    const source = blocker.args?.source;
    const subject = blocker.args?.subject?.issue;
    const key = `${source}:${subject}`;
    if (seenAuthoritySources.has(key)) return false;
    seenAuthoritySources.add(key);
    return true;
  });
  const orderedBlockers = [
    ...uniqueBlockers.filter((blocker) => blocker.code === 'state-unavailable'),
    ...uniqueBlockers.filter((blocker) => blocker.code !== 'state-unavailable'),
  ];
  return {
    status: indeterminate ? 'indeterminate' : orderedBlockers.length ? 'blocked' : 'ready',
    blockers: orderedBlockers,
    warnings,
    normalizations,
    humanDecision,
    selectedAction: 'close',
    observations,
  };
}

/**
 * Fresh production boundary. Required injectable readers are deliberately explicit:
 * readWorktree(), readDelivery({issue,body,head}), readChildren({issue,body}),
 * and runReadOnlyGuards(from,to,context). Existing effectful close defaults are
 * never substituted. readDelivery supplies the exact receipt/lineage input;
 * attribution is evaluated here against its declared current target.
 */
export async function evaluateCloseReadiness({
  issue,
  cfg,
  projectDir,
  deps = {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!cfg?.repo || typeof projectDir !== 'string')
    throw new TypeError('close-readiness:configuration');
  const production = createCloseReadOnlyPorts({ issue, cfg, projectDir, deps });
  const readIssue = async () => {
    const value = deps.readIssue
      ? await deps.readIssue()
      : JSON.parse(
          (
            await production.run('gh', [
              'issue',
              'view',
              String(issue),
              '-R',
              cfg.repo,
              '--json',
              'number,body,state,stateReason,updatedAt',
            ])
          ).stdout
        );
    if (
      value?.number !== issue ||
      typeof value.body !== 'string' ||
      !['OPEN', 'CLOSED'].includes(value.state) ||
      typeof value.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.updatedAt))
    )
      throw new TypeError('close-readiness:issue-authority-invalid');
    return Object.freeze({
      number: value.number,
      body: value.body,
      state: value.state,
      stateReason: value.stateReason ?? null,
      updatedAt: value.updatedAt,
    });
  };
  const readHead =
    deps.readHead ??
    (async () =>
      (await production.execGit(['rev-parse', 'HEAD'], { cwd: projectDir })).stdout.trim());
  let body;
  let head;
  let scope = `close:${issue}`;
  let initialError;
  let initialIssue;
  try {
    initialIssue = await readIssue();
    body = initialIssue.body;
    head = await readHead();
    scope = computeScopeIdentity({ repository: cfg.repo, issue, body });
  } catch (error) {
    initialError = error;
  }
  let delivery;
  const requireReader = (name) => {
    if (typeof (deps[name] ?? production[name]) !== 'function')
      throw new TypeError(`close-readiness:missing-reader:${name}`);
    return deps[name] ?? production[name];
  };
  const attempt = createObservationAttempt({
    repository: cfg.repo,
    issue,
    boundaryId: `action:close:${issue}`,
    now,
    read: async (request) => {
      if (initialError) throw initialError;
      let value;
      if (request.resource === 'issue-body') {
        if (request.identity === `issue:${issue}:0`) value = initialIssue;
        else {
          value = await readIssue();
          if (
            value.body !== initialIssue.body ||
            value.updatedAt !== initialIssue.updatedAt ||
            value.state !== initialIssue.state ||
            value.stateReason !== initialIssue.stateReason
          )
            throw new TypeError('close-readiness:issue-authority-drift');
          body = value.body;
        }
        return { ...request, value, revision: value.updatedAt };
      } else if (request.resource === 'project-board')
        value = await (deps.fetchBoard ?? fetchAssignmentSnapshot)({ issueNumber: issue, cfg });
      else if (request.resource === 'worktree')
        value = await requireReader('readWorktree')({ issue, projectDir });
      else if (request.identity === `evidence:${issue}:1`) {
        delivery = await requireReader('readDelivery')({ issue, body, head, cfg, projectDir });
        value = delivery;
      } else if (request.identity === `evidence:${issue}:2`) {
        const target = delivery?.gateInput?.lineage?.deliveryTarget;
        if (typeof target !== 'string') throw new TypeError('close-readiness:target');
        let hasAttributingCommit = deps.hasAttributingCommit ?? production.hasAttributingCommit;
        if (!deps.hasAttributingCommit && parseIssueKind(body) === 'epic') {
          hasAttributingCommit = async (_number, { refs }) => {
            const nodes = new Map(delivery.graph ?? []);
            const childSet = nodes.get(issue)?.children;
            if (!Array.isArray(childSet))
              throw new TypeError('close-readiness:epic-child-authority');
            const result = await (deps.execGit ?? production.execGit)(epicTrailLogArgs(refs[0]), {
              cwd: projectDir,
            });
            const commits = parseEpicTrailLog(typeof result === 'string' ? result : result.stdout);
            const { deliveryRequired } = partitionChildrenByDeliveryRequirement(childSet);
            return groupCommitsByChild({ children: deliveryRequired, commits }).every(
              ({ commits: attributed }) => attributed.length > 0
            );
          };
        } else if (!deps.hasAttributingCommit && delivery.mode === 'no-commit') {
          hasAttributingCommit = async () =>
            requireDeliveryReceipt(delivery.gateInput).mode === 'no-commit';
        }
        value = await evaluateExactTrunkAttribution({
          issue,
          cwd: projectDir,
          ...(delivery.authority?.localRef
            ? { localRef: delivery.authority.localRef }
            : { remote: delivery.authority?.remote ?? 'origin', ref: `refs/heads/${target}` }),
          execGit: deps.execGit ?? production.execGit,
          hasAttributingCommit,
        });
      } else if (request.identity === `evidence:${issue}:3`)
        value = await requireReader('readChildren')({ issue, body, cfg });
      else if (request.identity === `evidence:${issue}:4`)
        value = await production.readGuardAuthority({ delivery });
      else if (
        request.resource === 'workflow-policy' &&
        request.identity === `workflow-policy:${issue}`
      ) {
        const runtime =
          deps.workflowPolicyRuntime ??
          createGithubWorkflowBoundaryRuntime({ repository: cfg.repo });
        value = await runtime.listRecords(issue);
        if (!Array.isArray(value)) throw new TypeError('close-readiness:workflow-policy-records');
      } else throw new TypeError('close-readiness:source');
      return { ...request, value };
    },
  });
  await attempt.observe({ resource: 'issue-body', identity: `issue:${issue}:0`, scope });
  const result = await collectCloseReadiness({
    issue,
    attempt,
    ports: {
      scope,
      cfg,
      head,
      projectDir,
      evaluatedAt: now(),
      runGuards:
        deps.runReadOnlyGuards ??
        (async (from, to, context) => {
          const observation = await attempt.observe({
            resource: 'delivery',
            identity: `evidence:${issue}:4`,
            scope,
          });
          if (observation.status !== 'observed')
            return {
              ok: false,
              status: 'indeterminate',
              refusals: [observation.cause],
              humanDecision: null,
            };
          return production.runReadOnlyGuards(from, to, context, observation.value);
        }),
      loadPolicy:
        deps.loadPolicy ??
        (async ({ requirementIds }) => {
          const observation = await attempt.observe({
            resource: 'workflow-policy',
            identity: `workflow-policy:${issue}`,
            scope,
          });
          if (observation.status !== 'observed')
            return { status: 'indeterminate', cause: observation.cause };
          return evaluateWorkflowBoundary({
            repository: cfg.repo,
            issue,
            body,
            records: observation.value,
            requirementIds,
            activity: 'workflow-transition:done',
            state: 'review',
            now: now(),
          });
        }),
      deps: deps.guardDeps,
    },
  });
  return {
    ...result,
    bundle: attempt.finish({
      normalizationInputs: result.normalizations.map(({ normalizerId, inputDigest }) => ({
        normalizerId,
        inputDigest,
      })),
    }),
  };
}
