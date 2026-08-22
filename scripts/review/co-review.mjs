#!/usr/bin/env node
// @story #1266

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import {
  deriveRecoveryArchiveDir,
  prepareArchive,
  publishPreparedArchive,
} from './lib/archive.mjs';
import { helpRequest, renderHelp } from './lib/help.mjs';
import {
  START_DEFAULTS,
  deriveHostArchiveDir,
  deriveRuntimeDir,
  startProtocol,
} from './lib/start.mjs';
import { detectProvider } from '../providers/index.mjs';
import { FALLBACK_SESSION_ID, resolveSessionId } from '../task-tracker/lib/session-id.mjs';
import { markProtocolLifecycle, recordReviewerClaim, registerProtocol } from './lib/index.mjs';

const STATUS_PROJECTED_MUTATIONS = new Set([
  'init',
  'claim',
  'handoff',
  'set-max-turns',
  'supplement',
  'continue',
]);

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const writeOut = io.stdout ?? ((value) => process.stdout.write(value));
  const writeError = io.stderr ?? ((value) => process.stderr.write(value));
  const help = helpRequest(argv);
  if (help.requested) {
    writeOut(renderHelp(help.command));
    return 0;
  }
  try {
    const [name, ...args] = argv;
    const { values, booleans } = parseArguments(args);
    const protocol = await import('./lib/protocol.mjs');
    const repositoryOptions = io.repository ? { repository: io.repository } : {};
    let result;
    let exitCode = 0;
    if (name === 'start') {
      assertAllowed(values, booleans, [
        'dir',
        'artifact',
        'owner',
        'reviewer',
        'max-turns',
        'wait-cycles',
        'wait-interval',
        'issue',
        'artifact-kind',
      ]);
      const collected = await collectStartValues(values, io, writeOut);
      if (collected.cancelled) {
        writeOut('Co-review startup cancelled; no state changed.\n');
        return 0;
      }
      result = startProtocol({
        cwd: io.cwd ?? process.cwd(),
        dir: collected.values.dir,
        artifact: collected.values.artifact,
        owner: collected.values.owner,
        reviewer: collected.values.reviewer,
        maxReviewTurns: positiveInteger(collected.values, 'max-turns'),
        waitCycles: positiveInteger(collected.values, 'wait-cycles'),
        waitIntervalSeconds: positiveInteger(collected.values, 'wait-interval'),
        issue: collected.values.issue,
        artifactKind: collected.values['artifact-kind'],
        ...repositoryOptions,
      });
      writeOut(result.output);
      return 0;
    } else if (name === 'init') {
      assertAllowed(values, booleans, [
        'dir',
        'artifact',
        'owner',
        'reviewer',
        'max-turns',
        'import-review',
        'review-of',
        'archive-dir',
      ]);
      result = protocol.initializeProtocol({
        cwd: io.cwd ?? process.cwd(),
        dir: required(values, 'dir'),
        artifact: required(values, 'artifact'),
        owner: required(values, 'owner'),
        reviewer: required(values, 'reviewer'),
        maxReviewTurns: positiveInteger(values, 'max-turns'),
        importReview: values['import-review'],
        reviewOf: values['review-of'],
        archiveDir: values['archive-dir'],
        ...repositoryOptions,
      });
    } else if (name === 'status') {
      assertAllowed(values, booleans, ['dir', 'json']);
      result = protocol.statusProtocol({
        cwd: io.cwd ?? process.cwd(),
        dir: required(values, 'dir'),
        ...repositoryOptions,
      });
      if (!booleans.has('json')) {
        writeOut(formatStatus(result));
        return result.integrity.ok ? 0 : 1;
      }
      if (!result.integrity.ok) exitCode = 1;
    } else if (name === 'claim') {
      assertAllowed(values, booleans, ['dir', 'actor']);
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      const actor = required(values, 'actor');
      const state = protocol.statusProtocol({ cwd, dir, ...repositoryOptions });
      const role = Object.entries(state.roles).find(([, identity]) => identity === actor)?.[0];
      if (role === 'reviewer') {
        const env = io.env ?? process.env;
        const provider = detectProvider({ env });
        const sid = resolveSessionId({ env });
        if (!sid || sid === FALLBACK_SESSION_ID) {
          const error = new Error(
            `${provider.name} requires a real provider session id for a reviewer claim`
          );
          error.code = 'provider-session-id-required';
          throw error;
        }
        (io.recordReviewerClaim ?? recordReviewerClaim)({
          projectDir: cwd,
          protocolId: state.protocolId,
          provider: provider.name,
          sid,
          round: state.round,
        });
      }
      result = protocol.claimTurn({
        cwd,
        dir,
        actor,
        ...repositoryOptions,
      });
    } else if (name === 'wait') {
      assertAllowed(values, booleans, ['dir', 'actor', 'timeout']);
      result = await protocol.waitForTurn({
        cwd: io.cwd ?? process.cwd(),
        dir: required(values, 'dir'),
        actor: required(values, 'actor'),
        timeoutSeconds: values.timeout === undefined ? 55 : number(values, 'timeout'),
        ...repositoryOptions,
      });
      if (result.status === 'timeout') exitCode = 3;
    } else if (name === 'handoff') {
      assertAllowed(values, booleans, [
        'dir',
        'actor',
        'response',
        'artifact',
        'commit',
        'answers',
        'review',
        'review-of',
        'decision',
        'summary',
        'message',
      ]);
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      const actor = required(values, 'actor');
      const state = protocol.statusProtocol({ cwd, dir, ...repositoryOptions });
      const role = Object.entries(state.roles).find(([, identity]) => identity === actor)?.[0];
      if (!role) throw usage(`--actor is not a configured identity: ${actor}`);
      if (role === 'owner') {
        assertAllowed(values, booleans, [
          'dir',
          'actor',
          'response',
          'artifact',
          'commit',
          'answers',
          'message',
        ]);
        result = protocol.handoffOwner({
          cwd,
          dir,
          actor,
          response: required(values, 'response'),
          artifact: required(values, 'artifact'),
          commit: required(values, 'commit'),
          answers: values.answers,
          message: required(values, 'message'),
          ...repositoryOptions,
        });
      } else {
        assertAllowed(values, booleans, [
          'dir',
          'actor',
          'review',
          'review-of',
          'decision',
          'summary',
          'message',
        ]);
        result = protocol.handoffReviewer({
          cwd,
          dir,
          actor,
          review: required(values, 'review'),
          reviewOf: required(values, 'review-of'),
          decision: required(values, 'decision'),
          summary: values.summary,
          message: required(values, 'message'),
          ...repositoryOptions,
        });
        if (result.lifecycle === 'accepted') {
          let prepared;
          try {
            const snapshot = protocol.validatedArchiveSnapshot({
              cwd,
              dir,
              ...repositoryOptions,
            });
            try {
              prepared = prepareArchive({
                ...snapshot,
                archiveDir: result.initialization.archiveDir,
                ...repositoryOptions,
              });
            } catch (configuredError) {
              const configuredArchiveDir = result.initialization.archiveDir;
              if (!configuredArchiveDir) throw configuredError;
              prepared = prepareArchive({
                ...snapshot,
                archiveDir: deriveRecoveryArchiveDir(configuredArchiveDir, result.protocolId),
                ...repositoryOptions,
              });
            }
            result = {
              ...result,
              archivePublication: publishPreparedArchive(prepared, {
                hooks: io.archiveHooks,
                ...repositoryOptions,
              }),
            };
          } catch (error) {
            exitCode = 4;
            writeError(
              archivePendingMessage({
                state: result,
                error,
                prepared,
                shellArgument: protocol.shellArgument,
              })
            );
          }
        }
      }
    } else if (name === 'finalize') {
      assertAllowed(values, booleans, ['dir', 'archive-dir', 'good-enough', 'json']);
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      let state;
      let publication;
      if (booleans.has('good-enough')) {
        const resolveIdentity =
          io.resolveGitHubLoginImpl ??
          (await import('./lib/github-identity.mjs')).resolveGitHubLogin;
        const humanLogin = resolveIdentity({
          cwd,
          recoveryCommand: protocol.renderCliCommand(argv),
        });
        const snapshot = protocol.prepareGoodEnoughSnapshot({
          cwd,
          dir,
          humanLogin,
          ...repositoryOptions,
        });
        const prepared = prepareArchive({
          ...snapshot,
          archiveDir: values['archive-dir'],
          ...repositoryOptions,
        });
        state = protocol.acceptGoodEnough({
          cwd,
          dir,
          humanLogin,
          expectedRevision: snapshot.expectedRevision,
          acceptedAt: snapshot.acceptance.at,
          ...repositoryOptions,
        });
        try {
          publication = publishPreparedArchive(prepared, {
            hooks: io.archiveHooks,
            ...repositoryOptions,
          });
        } catch (error) {
          writeError(
            archivePendingMessage({
              state,
              error,
              prepared,
              shellArgument: protocol.shellArgument,
            })
          );
          return 4;
        }
      } else {
        const snapshot = protocol.validatedArchiveSnapshot({ cwd, dir, ...repositoryOptions });
        const prepared = prepareArchive({
          ...snapshot,
          archiveDir: values['archive-dir'],
          ...repositoryOptions,
        });
        state = snapshot.state;
        publication = publishPreparedArchive(prepared, {
          hooks: io.archiveHooks,
          ...repositoryOptions,
        });
      }
      result = { state, archivePublication: publication };
      if (!booleans.has('json')) {
        writeOut(formatFinalization(result));
        return 0;
      }
    } else if (name === 'set-max-turns') {
      assertAllowed(values, booleans, ['dir', 'max-turns']);
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      const requestedMax = nonnegativeInteger(values, 'max-turns');
      const resolveIdentity =
        io.resolveGitHubLoginImpl ?? (await import('./lib/github-identity.mjs')).resolveGitHubLogin;
      const humanLogin = resolveIdentity({
        cwd,
        recoveryCommand: protocol.renderCliCommand(argv),
      });
      result = protocol.setMaxReviewTurns({
        cwd,
        dir,
        requestedMax,
        humanLogin,
        ...repositoryOptions,
      });
    } else if (name === 'supplement') {
      assertAllowed(values, booleans, ['dir', 'file']);
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      const file = required(values, 'file');
      const resolveIdentity =
        io.resolveGitHubLoginImpl ?? (await import('./lib/github-identity.mjs')).resolveGitHubLogin;
      const humanLogin = resolveIdentity({
        cwd,
        recoveryCommand: protocol.renderCliCommand(argv),
      });
      result = protocol.registerSupplement({ cwd, dir, file, humanLogin, ...repositoryOptions });
    } else if (name === 'continue') {
      assertAllowed(values, booleans, [
        'dir',
        'max-turns',
        'additional-turns',
        'approved-by',
        'focus',
      ]);
      if (values['max-turns'] !== undefined && values['additional-turns'] !== undefined) {
        throw usage('--max-turns and --additional-turns are mutually exclusive');
      }
      const cwd = io.cwd ?? process.cwd();
      const dir = required(values, 'dir');
      const maxReviewTurns =
        values['max-turns'] === undefined ? undefined : nonnegativeInteger(values, 'max-turns');
      const additionalTurns =
        values['additional-turns'] === undefined
          ? undefined
          : positiveInteger(values, 'additional-turns');
      const resolveIdentity =
        io.resolveGitHubLoginImpl ?? (await import('./lib/github-identity.mjs')).resolveGitHubLogin;
      const humanLogin = resolveIdentity({
        cwd,
        recoveryCommand: protocol.renderCliCommand(argv),
      });
      if (values['approved-by'] !== undefined) {
        writeError(
          'co-review: --approved-by is deprecated and ignored; authenticated GitHub login is recorded\n'
        );
      }
      result = protocol.continueProtocol({
        cwd,
        dir,
        maxReviewTurns,
        additionalTurns,
        humanLogin,
        focus: values.focus,
        ...repositoryOptions,
      });
    } else {
      throw usage(`unknown command ${String(name)}`);
    }
    if (STATUS_PROJECTED_MUTATIONS.has(name)) {
      const archivePublication = result?.archivePublication;
      result = protocol.statusProtocol({
        cwd: io.cwd ?? process.cwd(),
        dir: required(values, 'dir'),
        ...repositoryOptions,
      });
      if (archivePublication) result = { ...result, archivePublication };
      if (name === 'init') {
        (io.registerProtocol ?? registerProtocol)({
          projectDir: result.repositoryRoot,
          state: result,
        });
      } else {
        (io.registerProtocol ?? registerProtocol)({
          projectDir: result.repositoryRoot,
          state: result,
        });
        (io.markProtocolLifecycle ?? markProtocolLifecycle)({
          projectDir: result.repositoryRoot,
          protocolId: result.protocolId,
          lifecycle: result.lifecycle,
        });
      }
    }
    writeOut(`${JSON.stringify(result, null, 2)}\n`);
    return exitCode;
  } catch (error) {
    writeError(`${error.message}\n`);
    return error.exitCode ?? 1;
  }
}

async function collectStartValues(values, io, writeOut) {
  const requiredMissing = ['artifact', 'owner', 'reviewer'].some(
    (name) => !String(values[name] ?? '').trim()
  );
  if (!requiredMissing) {
    return {
      cancelled: false,
      values: {
        ...values,
        'max-turns': values['max-turns'] ?? String(START_DEFAULTS.maxReviewTurns),
        'wait-cycles': values['wait-cycles'] ?? String(START_DEFAULTS.waitCycles),
        'wait-interval': values['wait-interval'] ?? String(START_DEFAULTS.waitIntervalSeconds),
      },
    };
  }

  const interactive = io.prompt || io.isTTY === true || (io.isTTY !== false && process.stdin.isTTY);
  if (!interactive) {
    throw usage(
      'start requires --artifact, --owner, and --reviewer without an interactive terminal'
    );
  }

  let readline;
  const ask = io.prompt
    ? async (question) => String(await io.prompt(question))
    : async (question) => {
        readline ??= createInterface({
          input: io.stdin ?? process.stdin,
          output: io.output ?? process.stdout,
        });
        return readline.question(question);
      };
  const answer = async (name, label, fallback = '') => {
    if (String(values[name] ?? '').trim()) return String(values[name]).trim();
    const suffix = fallback ? ` [${fallback}]` : '';
    const entered = String(await ask(`${label}${suffix}: `)).trim();
    return entered || fallback;
  };

  try {
    const artifact = await answer('artifact', 'Authoritative tracked artifact');
    if (!artifact) throw usage('artifact is required; no state changed');
    const derivedDir = deriveRuntimeDir(artifact, randomUUID());
    const collected = {
      artifact,
      dir: await answer('dir', 'Protocol directory', derivedDir),
      owner: await answer('owner', 'Author identity'),
      reviewer: await answer('reviewer', 'Reviewer identity'),
      issue: await answer('issue', 'Host issue number (optional; requires artifact kind)'),
      'artifact-kind': await answer(
        'artifact-kind',
        'Artifact kind (spec or plan; requires host issue)'
      ),
      'max-turns': await answer(
        'max-turns',
        'Maximum reviewer turns',
        String(START_DEFAULTS.maxReviewTurns)
      ),
      'wait-cycles': await answer('wait-cycles', 'Wait cycles', String(START_DEFAULTS.waitCycles)),
      'wait-interval': await answer(
        'wait-interval',
        'Wait interval seconds',
        String(START_DEFAULTS.waitIntervalSeconds)
      ),
    };
    const hostArchive =
      collected.issue || collected['artifact-kind']
        ? deriveHostArchiveDir(collected.issue, collected['artifact-kind'])
        : null;
    writeOut(
      [
        'Resolved co-review startup:',
        `  Artifact: ${collected.artifact}`,
        `  Protocol directory: ${collected.dir}`,
        `  Author: ${collected.owner}`,
        `  Reviewer: ${collected.reviewer}`,
        `  Host issue: ${collected.issue || 'not configured'}`,
        `  Artifact kind: ${collected['artifact-kind'] || 'not configured'}`,
        `  Archive destination: ${hostArchive || 'not configured'}`,
        `  Maximum reviewer turns: ${collected['max-turns']}`,
        `  Wait cycles: ${collected['wait-cycles']}`,
        `  Wait interval seconds: ${collected['wait-interval']}`,
        '',
      ].join('\n')
    );
    const confirmation = String(await ask('Create this co-review? [y/N]: ')).trim();
    return { cancelled: !/^(?:y|yes)$/i.test(confirmation), values: collected };
  } finally {
    readline?.close();
  }
}

function usage(detail) {
  const error = new Error(
    `co-review:usage: ${detail}; no state changed; next: npx aitm co-review --help`
  );
  error.exitCode = 2;
  return error;
}

function parseArguments(args) {
  const values = {};
  const booleans = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw usage(`unexpected positional argument ${token}`);
    const name = token.slice(2);
    if (!name || Object.hasOwn(values, name) || booleans.has(name)) {
      throw usage(`duplicate or empty option ${token}`);
    }
    if (name === 'json' || name === 'good-enough') {
      booleans.add(name);
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw usage(`${token} requires a value`);
    values[name] = value;
    index += 1;
  }
  return { values, booleans };
}

function assertAllowed(values, booleans, names) {
  const allowed = new Set(names);
  for (const name of [...Object.keys(values), ...booleans]) {
    if (!allowed.has(name)) throw usage(`option --${name} is not valid for this command`);
  }
}

function required(values, name) {
  if (!String(values[name] ?? '').trim()) throw usage(`--${name} is required`);
  return values[name];
}

function nonnegativeInteger(values, name) {
  const value = required(values, name);
  if (!/^[0-9]+$/.test(value)) throw usage(`--${name} must be a nonnegative integer`);
  return Number(value);
}

function positiveInteger(values, name) {
  const value = nonnegativeInteger(values, name);
  if (value < 1) throw usage(`--${name} must be a positive integer`);
  return value;
}

function number(values, name) {
  const value = required(values, name);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw usage(`--${name} must be a number`);
  return parsed;
}

function formatStatus(state) {
  const claim = state.claim
    ? `${state.claim.actor} as ${state.claim.role} at ${state.claim.at}`
    : 'none';
  const lastHandoff = state.lastHandoff
    ? `${state.lastHandoff.from} -> ${state.lastHandoff.to ?? 'terminal'} at ${state.lastHandoff.at}${
        state.lastHandoff.decision ? ` (${state.lastHandoff.decision})` : ''
      }`
    : 'none';
  const actor = state.currentRole ? state.roles[state.currentRole] : 'none';
  const supplements = state.activeSupplements ?? [];
  const supplementStatus = supplements.length
    ? supplements
        .map(
          (supplement) =>
            `${supplement.id} (${supplement.status}): ${supplement.path} ${supplement.sha256} Target round: ${supplement.targetRound}`
        )
        .join('\n  ')
    : 'none';
  const actions = (state.availableActions ?? [])
    .map(({ kind, command }) => `${kind}: ${command ?? 'make no mutation; return later'}`)
    .join('\n  ');
  const acceptanceActor = state.acceptance?.approvedBy ?? state.acceptance?.reviewer;
  const acceptance = state.decisionBasis
    ? `${state.decisionBasis}${acceptanceActor ? ` by ${acceptanceActor}` : ''}${
        state.acceptance?.at ? ` at ${state.acceptance.at}` : ''
      }`
    : 'none';
  return [
    `Lifecycle: ${state.lifecycle}`,
    `Turn: ${state.currentRole ?? 'none'} (${actor}) / ${state.turnState ?? 'terminal'}`,
    `Round: ${state.round}`,
    `Branch: ${state.branch}`,
    `Claim: ${claim}`,
    `Artifact: ${state.artifact.path} @ ${state.artifact.commit}`,
    `Last handoff: ${lastHandoff}`,
    `Budget: ${state.reviewTurnsUsed} used / ${state.maxReviewTurns} max / ${state.remainingReviewTurns} remaining`,
    `Decision basis: ${state.decisionBasis ?? 'none'}`,
    `Acceptance: ${acceptance}`,
    `Archive: ${state.archive?.destination ?? 'unknown'} / ${state.archive?.completion ?? 'unknown'}`,
    `Closing owner complete: ${state.closingOwnerComplete ? 'yes' : 'no'}`,
    `Unresolved findings: ${state.unresolvedFindingIds?.join(', ') || 'none'}`,
    `Terminal review: ${state.terminalEvidence?.reviewerReview?.path ?? 'none'}`,
    `Terminal response: ${state.terminalEvidence?.ownerResponse?.path ?? 'none'}`,
    `Latest budget adjustment: ${
      state.latestBudgetAdjustment ? JSON.stringify(state.latestBudgetAdjustment) : 'none'
    }`,
    `Supplements: ${supplementStatus}`,
    `Integrity: ${state.integrity.ok ? 'ok' : 'DRIFT'}`,
    `Available actions: ${actions || 'none'}`,
    ...(state.lifecycle === 'intervention-required' && !state.closingOwnerComplete
      ? ['Good enough unavailable: a two-sided evidence pair does not exist.']
      : []),
    `Next: ${state.nextAction}`,
    '',
  ].join('\n');
}

function archivePendingMessage({ state, error, prepared, shellArgument }) {
  const destination = prepared?.destination.relative ?? state.initialization?.archiveDir;
  const runtimeDir = path.resolve(state.repositoryRoot, state.initialization.runtimeDir);
  const retry = `npx aitm co-review finalize --dir ${shellArgument(runtimeDir)}${
    destination
      ? ` --archive-dir ${shellArgument(destination)}`
      : ' --archive-dir <tracked-repo-path>'
  }`;
  const cause = String(error.message).replace(/; no state changed(?:; next:.*)?$/, '');
  return [
    'ACCEPTED: protocol state is durable; archive publication is pending',
    `Cause: ${cause}`,
    `Retry: ${retry}`,
    '',
  ].join('\n');
}

function formatFinalization({ archivePublication }) {
  return [
    `Archive: ${archivePublication.destination.relative}`,
    ...archivePublication.paths.map(
      (entry) => `Produced: ${archivePublication.destination.relative}/${entry}`
    ),
    'Verify the generated files, then stage and commit them through the repository workflow.',
    '',
  ].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exitCode = await runCli();
