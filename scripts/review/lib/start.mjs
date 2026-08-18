// @story #1269

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { initializeProtocol, renderCliCommand } from './protocol.mjs';

export const START_DEFAULTS = Object.freeze({
  maxReviewTurns: 10,
  waitCycles: 20,
  waitIntervalSeconds: 60,
});

const START_SCHEMA = 'aitm.co-review-start/v1';
const FILES = Object.freeze({
  author: 'author-handoff.md',
  reviewer: 'reviewer-handoff.md',
  manifest: 'start-manifest.json',
});

function fail(category, detail, { exitCode = 1, noStateChanged = false } = {}) {
  const error = new Error(
    `co-review:start-${category}${detail ? `: ${detail}` : ''}${
      noStateChanged ? '; no state changed' : ''
    }`
  );
  error.exitCode = exitCode;
  throw error;
}

function inline(value) {
  return `\`${JSON.stringify(String(value)).replaceAll('`', '\\u0060')}\``;
}

function positiveInteger(value, category, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail(category, `expected an integer from 1 through ${maximum}`, {
      exitCode: 2,
      noStateChanged: true,
    });
  }
  return value;
}

export function deriveRuntimeDir(artifact, creationId) {
  const stem = path.parse(String(artifact)).name;
  const slug =
    stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'artifact';
  const id = String(creationId || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(id)) {
    fail('creation-id', 'expected letters, digits, or hyphens', {
      exitCode: 2,
      noStateChanged: true,
    });
  }
  return path.posix.join('.tmp/co-review', `${slug}-${id}`);
}

export function resolveStartOptions(options = {}, dependencies = {}) {
  const artifact = String(options.artifact || '').trim();
  const owner = String(options.owner || '').trim();
  const reviewer = String(options.reviewer || '').trim();
  if (!artifact) fail('artifact', 'artifact is required', { exitCode: 2, noStateChanged: true });
  if (!owner) fail('owner', 'author identity is required', { exitCode: 2, noStateChanged: true });
  if (!reviewer)
    fail('reviewer', 'reviewer identity is required', { exitCode: 2, noStateChanged: true });
  if (owner === reviewer)
    fail('roles', 'author and reviewer must be distinct', {
      exitCode: 2,
      noStateChanged: true,
    });

  const maxReviewTurns = positiveInteger(
    options.maxReviewTurns ?? START_DEFAULTS.maxReviewTurns,
    'max-turns'
  );
  const waitCycles = positiveInteger(
    options.waitCycles ?? START_DEFAULTS.waitCycles,
    'wait-cycles'
  );
  const waitIntervalSeconds = positiveInteger(
    options.waitIntervalSeconds ?? START_DEFAULTS.waitIntervalSeconds,
    'wait-interval',
    60
  );
  const creationId = dependencies.creationId ?? (() => randomUUID());
  const dir = String(options.dir || '').trim() || deriveRuntimeDir(artifact, creationId());
  return {
    artifact,
    owner,
    reviewer,
    dir,
    maxReviewTurns,
    waitCycles,
    waitIntervalSeconds,
  };
}

function sharedHandoff(model) {
  return `## Authority and recovery

- Repository root: ${inline(model.repositoryRoot)}
- Worktree: ${inline(model.worktree)}
- Branch: ${inline(model.branch)}
- Protocol directory: ${inline(model.runtimeDir)}
- Absolute protocol directory: ${inline(model.runtimeAbsolute)}
- Protocol ID: ${inline(model.protocolId)}
- Authoritative artifact: ${inline(model.artifact)}
- Author identity: ${inline(model.owner)}
- Reviewer identity: ${inline(model.reviewer)}
- Maximum reviewer handoffs: ${model.maxReviewTurns}
- Waiting episode: at most ${model.waitCycles} separately observed waits of ${model.waitIntervalSeconds} seconds

Treat repository and protocol state as authoritative after chat loss or compaction. Reread this entire handoff, then run:

\`\`\`text
${renderCliCommand(['status', '--dir', model.runtimeDir])}
\`\`\`

Stop and report any integrity drift. Never steal or delete a protocol lock. Never edit an immutable response, review, supplement, event, manifest, or handoff file.

## Bounded wait discipline

When the other role owns the turn, make each wait a separate observed tool call:

\`\`\`text
${renderCliCommand([
  'wait',
  '--dir',
  model.runtimeDir,
  '--actor',
  model.actor,
  '--timeout',
  model.waitIntervalSeconds,
])}
\`\`\`

After every call, record \`wait cycle N/${model.waitCycles}\`. Exit 3 is an ordinary timeout; wait again only while the cycle count remains. Exit 0 is a wake event: run status and act on the reported state. Exit 1 or 2 is a refusal: report the exact diagnostic and stop. After cycle ${model.waitCycles} times out, run status, report it to the human, and stop without starting another batch. A successful handoff starts a new waiting episode for the role that handed off.

After compaction, reread this file, run status, and resume from the last visible wait-cycle marker. If the completed count is uncertain, stop and report the ambiguity instead of resetting it.

Accepted is terminal: verify status and stop forever. Intervention-required is a human decision boundary. Do not adjust the budget, continue/refocus, supplement, or finalize good-enough acceptance unless the authenticated human authorizes the existing command.
`;
}

function modelFor(state, settings, actor) {
  return Object.freeze({
    repositoryRoot: state.repositoryRoot,
    worktree: state.worktree,
    branch: state.branch,
    protocolId: state.protocolId,
    runtimeDir: state.initialization.runtimeDir,
    runtimeAbsolute: path.resolve(state.repositoryRoot, state.initialization.runtimeDir),
    artifact: state.artifact.path,
    owner: state.roles.owner,
    reviewer: state.roles.reviewer,
    maxReviewTurns: state.maxReviewTurns,
    waitCycles: settings.waitCycles,
    waitIntervalSeconds: settings.waitIntervalSeconds,
    actor,
  });
}

export function renderAuthorHandoff(state, settings) {
  const model = modelFor(state, settings, state.roles.owner);
  return `# Co-Review Author Handoff

You are the configured author ${inline(model.owner)}. You alone may edit and commit the authoritative artifact. The configured reviewer is ${inline(model.reviewer)} and must remain independent.

${sharedHandoff(model)}
## Author turn

Run status, then claim only when the owner role is available:

\`\`\`text
${renderCliCommand(['claim', '--dir', model.runtimeDir, '--actor', model.owner])}
\`\`\`

Read the complete immutable reviewer document for the current round. Verify every finding against repository evidence. Write one response marker and an allowed disposition for every finding: accepted, accepted-with-modification, rejected, or deferred. Rejection requires an evidence marker. Deferral requires a governed follow-up issue and a safe-boundary marker.

Use these exact Markdown marker shapes:

- \`[finding:F-001] [disposition:accepted]\`
- rejected also requires \`[evidence:repository-path-or-command]\`
- deferred also requires \`[follow-up:#123] [safe-boundary:why current delivery remains safe]\`

When changes are required, edit and commit only ${inline(model.artifact)}. Before handoff, verify the artifact, index, committed blob, and response bytes. Then use the concrete current response path, commit, optional answers file, and message with:

\`\`\`text
${renderCliCommand([
  'handoff',
  '--dir',
  model.runtimeDir,
  '--actor',
  model.owner,
  '--response',
  `${model.runtimeDir}/round-N-author-response.md`,
  '--artifact',
  model.artifact,
  '--commit',
  'COMMIT_SHA',
  '--message',
  'author response complete',
])}
\`\`\`

After a successful handoff, follow the bounded wait discipline above.
`;
}

export function renderReviewerHandoff(state, settings) {
  const model = modelFor(state, settings, state.roles.reviewer);
  return `# Co-Review Reviewer Handoff

You are the configured reviewer ${inline(model.reviewer)}. Preserve role separation: never edit or commit the authoritative artifact. The configured author is ${inline(model.owner)}.

${sharedHandoff(model)}
## Reviewer turn

Run status, then claim only when the reviewer role is available:

\`\`\`text
${renderCliCommand(['claim', '--dir', model.runtimeDir, '--actor', model.reviewer])}
\`\`\`

Review the exact artifact commit recorded by the author handoff. Read every required supplement. Write a new immutable Markdown review with unique finding identifiers and an explicit accepted or changes-requested decision. When the final allowed review requests changes, include the required exhaustion summary evidence.

Write each finding as \`[finding:F-001]\` using an identifier unique within the review. Acknowledge every required supplement with its exact \`[supplement:S-1]\` marker. Do not reuse or edit a prior review file.

Use the concrete current review path, reviewed commit, decision, optional summary, and message with:

\`\`\`text
${renderCliCommand([
  'handoff',
  '--dir',
  model.runtimeDir,
  '--actor',
  model.reviewer,
  '--review',
  `${model.runtimeDir}/round-N-reviewer-review.md`,
  '--review-of',
  'COMMIT_SHA',
  '--decision',
  'accepted',
  '--message',
  'review complete',
])}
\`\`\`

If the lifecycle remains active after a successful handoff, follow the bounded wait discipline above.
`;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function exactJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicPublish(destination, bytes, dependencies, label) {
  if (existsSync(destination)) {
    if (!lstatSync(destination).isFile() || lstatSync(destination).isSymbolicLink()) {
      fail('conflict', `${destination} is not a regular generated file`);
    }
    if (readFileSync(destination, 'utf8') !== bytes) fail('conflict', destination);
    return;
  }
  dependencies.beforePublish?.(label);
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${randomUUID()}.tmp`
  );
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx');
    writeFileSync(descriptor, bytes, 'utf8');
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, destination);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (
        !lstatSync(destination).isFile() ||
        lstatSync(destination).isSymbolicLink() ||
        readFileSync(destination, 'utf8') !== bytes
      ) {
        fail('conflict', destination);
      }
    }
    unlinkSync(temporary);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary may already have been renamed or never created.
    }
    throw error;
  }
}

function assertStartupState(state) {
  if (
    state.lifecycle !== 'active' ||
    state.revision !== 1 ||
    state.currentRole !== 'owner' ||
    state.turnState !== 'available' ||
    state.round !== 1 ||
    state.lastHandoff !== null
  ) {
    fail('lifecycle', 'existing protocol has progressed beyond startup');
  }
}

function resultOutput(authorAbsolute, reviewerAbsolute) {
  return (
    `AUTHOR PROMPT\nRead and follow this handoff completely, then begin:\n${authorAbsolute}\n\n` +
    `REVIEWER PROMPT\nRead and follow this handoff completely, then begin:\n${reviewerAbsolute}\n`
  );
}

export function startProtocol(options = {}, dependencies = {}) {
  const resolved = resolveStartOptions(options, dependencies);
  const cwd = options.cwd ?? process.cwd();
  const initialize = dependencies.initialize ?? initializeProtocol;
  const retry = renderCliCommand([
    'start',
    '--artifact',
    resolved.artifact,
    '--owner',
    resolved.owner,
    '--reviewer',
    resolved.reviewer,
    '--dir',
    resolved.dir,
    '--max-turns',
    resolved.maxReviewTurns,
    '--wait-cycles',
    resolved.waitCycles,
    '--wait-interval',
    resolved.waitIntervalSeconds,
  ]);
  let state;
  try {
    state = initialize({
      cwd,
      dir: resolved.dir,
      artifact: resolved.artifact,
      owner: resolved.owner,
      reviewer: resolved.reviewer,
      maxReviewTurns: resolved.maxReviewTurns,
      ...(options.repository ? { repository: options.repository } : {}),
    });
    assertStartupState(state);

    const runtimeAbsolute = path.resolve(state.repositoryRoot, state.initialization.runtimeDir);
    const authorAbsolute = path.join(runtimeAbsolute, FILES.author);
    const reviewerAbsolute = path.join(runtimeAbsolute, FILES.reviewer);
    const manifestAbsolute = path.join(runtimeAbsolute, FILES.manifest);
    const authorBytes = renderAuthorHandoff(state, resolved);
    const reviewerBytes = renderReviewerHandoff(state, resolved);
    const authorRelative = path.posix.join(state.initialization.runtimeDir, FILES.author);
    const reviewerRelative = path.posix.join(state.initialization.runtimeDir, FILES.reviewer);
    const manifest = {
      schema: START_SCHEMA,
      protocolId: state.protocolId,
      runtimeDir: state.initialization.runtimeDir,
      artifact: state.artifact.path,
      owner: state.roles.owner,
      reviewer: state.roles.reviewer,
      maxReviewTurns: state.maxReviewTurns,
      waitCycles: resolved.waitCycles,
      waitIntervalSeconds: resolved.waitIntervalSeconds,
      handoffs: {
        author: { path: authorRelative, sha256: digest(authorBytes) },
        reviewer: { path: reviewerRelative, sha256: digest(reviewerBytes) },
      },
      createdAt: state.createdAt,
    };
    const manifestBytes = exactJson(manifest);

    atomicPublish(authorAbsolute, authorBytes, dependencies, FILES.author);
    atomicPublish(reviewerAbsolute, reviewerBytes, dependencies, FILES.reviewer);
    atomicPublish(manifestAbsolute, manifestBytes, dependencies, FILES.manifest);

    if (
      readFileSync(authorAbsolute, 'utf8') !== authorBytes ||
      readFileSync(reviewerAbsolute, 'utf8') !== reviewerBytes ||
      readFileSync(manifestAbsolute, 'utf8') !== manifestBytes
    ) {
      fail('verification', 'published startup files do not match rendered bytes');
    }

    return {
      state,
      manifest,
      authorHandoff: { relative: authorRelative, absolute: authorAbsolute },
      reviewerHandoff: { relative: reviewerRelative, absolute: reviewerAbsolute },
      output: resultOutput(authorAbsolute, reviewerAbsolute),
    };
  } catch (error) {
    if (error.message.includes(`next: ${retry}`)) throw error;
    error.message = `${error.message}; resolved directory: ${resolved.dir}; next: ${retry}`;
    throw error;
  }
}
