#!/usr/bin/env node
// @story #1266

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { helpRequest, renderHelp } from './lib/help.mjs';

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
    if (name === 'init') {
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
      result = protocol.claimTurn({
        cwd: io.cwd ?? process.cwd(),
        dir: required(values, 'dir'),
        actor: required(values, 'actor'),
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
        recoveryCommand: `npx aitm co-review ${argv.join(' ')}`,
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
        recoveryCommand: `npx aitm co-review ${argv.join(' ')}`,
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
        recoveryCommand: `npx aitm co-review ${argv.join(' ')}`,
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
    writeOut(`${JSON.stringify(result, null, 2)}\n`);
    return exitCode;
  } catch (error) {
    writeError(`${error.message}\n`);
    return error.exitCode ?? 1;
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
    if (name === 'json') {
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
  return [
    `Lifecycle: ${state.lifecycle}`,
    `Turn: ${state.currentRole ?? 'none'} (${actor}) / ${state.turnState ?? 'terminal'}`,
    `Round: ${state.round}`,
    `Branch: ${state.branch}`,
    `Claim: ${claim}`,
    `Artifact: ${state.artifact.path} @ ${state.artifact.commit}`,
    `Last handoff: ${lastHandoff}`,
    `Budget: ${state.reviewTurnsUsed} used / ${state.maxReviewTurns} max / ${state.remainingReviewTurns} remaining`,
    `Supplements: ${supplementStatus}`,
    `Integrity: ${state.integrity.ok ? 'ok' : 'DRIFT'}`,
    `Next: ${state.nextAction}`,
    '',
  ].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exitCode = await runCli();
