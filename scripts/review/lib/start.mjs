// @story #1269

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { initializeProtocol, renderCliCommand, statusProtocol } from './protocol.mjs';
import { registerProtocol } from './index.mjs';

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

export function deriveHostArchiveDir(issue, artifactKind) {
  const issueText = String(issue ?? '').trim();
  const kind = String(artifactKind ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(issueText) || !Number.isSafeInteger(Number(issueText))) {
    fail('host-context', 'issue must be a positive decimal integer', {
      exitCode: 2,
      noStateChanged: true,
    });
  }
  if (!['spec', 'plan'].includes(kind)) {
    fail('host-context', 'artifact kind must be exactly spec or plan', {
      exitCode: 2,
      noStateChanged: true,
    });
  }
  return path.posix.join('docs/superpowers/reviews', issueText, kind);
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

  const issueText = String(options.issue ?? '').trim();
  const artifactKind = String(options.artifactKind ?? '').trim();
  if (Boolean(issueText) !== Boolean(artifactKind)) {
    fail('host-context', '--issue and --artifact-kind are required together', {
      exitCode: 2,
      noStateChanged: true,
    });
  }
  const hostArchive = issueText
    ? {
        issue: Number(issueText),
        artifactKind,
        archiveDir: deriveHostArchiveDir(issueText, artifactKind),
      }
    : {};

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
    ...hostArchive,
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
${
  model.archiveDir
    ? `- Host issue: ${model.issue}\n- Artifact kind: ${inline(model.artifactKind)}\n- Archive destination: ${inline(model.archiveDir)}`
    : '- Host archive destination: not configured; the human coordinator must supply an explicit valid destination before finalization'
}
- Maximum reviewer handoffs: ${model.maxReviewTurns}
- Waiting episode: at most ${model.waitCycles} separately observed waits of ${model.waitIntervalSeconds} seconds

Treat repository and protocol state as authoritative after chat loss or compaction. Reread this entire handoff, then run:

\`\`\`text
${renderCliCommand(['status', '--dir', model.runtimeDir])}
\`\`\`

An integrity refusal can be transient only during authorized snapshot publication, while a mutation publishes an event and its matching state. If status or wait exits 1 with an integrity diagnostic, run one settled status re-read after the command returns. If that re-read is healthy, continue from its reported state. If the mismatch persists, preserve every protocol file, report the exact diagnostic, and stop. Never steal or delete a protocol lock. Never edit an immutable response, review, supplement, event, manifest, or handoff file.

Response, review, supplement, and archive evidence inputs are Markdown subject to host-repository governance.

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

After every call, record \`wait cycle N/${model.waitCycles}\`. Exit 3 is an ordinary timeout; wait again only while the cycle count remains. Exit 0 is a wake event: run status and act on the reported state. Exit 2 or a non-integrity exit 1 is a refusal: report the exact diagnostic and stop. For an integrity exit 1, follow the one-time settled re-read rule above. After cycle ${model.waitCycles} times out, run status, report it to the human, and stop without starting another batch. A successful handoff starts a new waiting episode for the role that handed off.

After compaction, reread this file, run status, and resume from the last visible wait-cycle marker. If the completed count is uncertain, stop and report the ambiguity instead of resetting it.

Accepted is terminal: verify status and stop forever. Intervention-required is a human decision boundary. Do not adjust the budget, continue/refocus, supplement, or finalize good-enough acceptance unless the authenticated human authorizes the existing command.

Exit handling: 0 means the requested command completed (or a wait woke); 1 means runtime, Git, integrity, lock, role, or protocol refusal; 2 means invalid usage; 3 is only an ordinary bounded-wait timeout; 4 means acceptance is already durable while archive publication is pending. On exit 4, never repeat the terminal handoff—run the exact printed finalize retry.
${
  model.archiveDir
    ? `
## Terminal archive

The repository host configured ${inline(model.archiveDir)} for this ${inline(model.artifactKind)} review. After acceptance, including an exit-code-4 publication failure, use this exact explicit finalization command:

\`\`\`text
${renderCliCommand(['finalize', '--dir', model.runtimeDir, '--archive-dir', model.archiveDir])}
\`\`\`

An existing complete-identical archive is success. A conflicting or mixed destination is a refusal: preserve every file and report it without rewriting evidence. Only an authenticated human may authorize the separate \`--good-enough\` path.
`
    : ''
}
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
    issue: settings.issue,
    artifactKind: settings.artifactKind,
    archiveDir: state.initialization.archiveDir,
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

On owner rounds after a review, inspect the structured status and read the exact preceding immutable review path from \`lastHandoff.artifacts.review.path\`:

\`\`\`text
${renderCliCommand(['status', '--dir', model.runtimeDir, '--json'])}
\`\`\`

Assign that value to \`REVIEW_PATH\`, then add it to the handoff command:

\`\`\`text
${renderCliCommand([
  'handoff',
  '--dir',
  model.runtimeDir,
  '--actor',
  model.owner,
  '--response',
  `${model.runtimeDir}/round-N-author-response.md`,
  '--answers',
  'REVIEW_PATH',
  '--artifact',
  model.artifact,
  '--commit',
  'COMMIT_SHA',
  '--message',
  'author response complete',
])}
\`\`\`

Omit \`--answers\` only on the opening owner round.
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

Review the exact artifact commit recorded by the author handoff. Read every required supplement. Write a new immutable Markdown review with unique finding identifiers and an explicit accepted or changes-requested decision. When the final allowed review requests changes, you may include optional exhaustion summary evidence.

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

For changes requested, replace the decision with \`changes-requested\`. On the final allowed reviewer handoff, you may additionally provide optional \`--summary\` with an immutable exhaustion-summary path.
`;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function exactJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isExactRegularFile(destination, bytes) {
  try {
    const stat = lstatSync(destination);
    return stat.isFile() && !stat.isSymbolicLink() && readFileSync(destination, 'utf8') === bytes;
  } catch {
    return false;
  }
}

function captureRuntimeIdentity(runtimeAbsolute, repositoryRoot) {
  const rootReal = realpathSync(repositoryRoot);
  const stat = lstatSync(runtimeAbsolute);
  const runtimeReal = realpathSync(runtimeAbsolute);
  const relative = path.relative(rootReal, runtimeReal);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail('runtime-drift', `${runtimeAbsolute} is not a stable repository directory`);
  }
  return Object.freeze({ rootReal, runtimeReal, device: stat.dev, inode: stat.ino });
}

function assertRuntimeStable(runtimeAbsolute, identity) {
  try {
    const stat = lstatSync(runtimeAbsolute);
    const runtimeReal = realpathSync(runtimeAbsolute);
    const relative = path.relative(identity.rootReal, runtimeReal);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== identity.device ||
      stat.ino !== identity.inode ||
      runtimeReal !== identity.runtimeReal ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      fail('runtime-drift', `${runtimeAbsolute} changed during startup publication`);
    }
  } catch (error) {
    if (error.message?.startsWith('co-review:start-runtime-drift')) throw error;
    fail('runtime-drift', `${runtimeAbsolute} changed during startup publication`);
  }
}

function preflightPublications(publications) {
  for (const { destination, bytes } of publications) {
    if (existsSync(destination) && !isExactRegularFile(destination, bytes)) {
      fail('conflict', `${destination} is conflicting or non-regular generated content`);
    }
  }
}

function atomicPublish(destination, bytes, dependencies, label, validateRuntime) {
  if (existsSync(destination)) {
    if (!isExactRegularFile(destination, bytes)) {
      fail('conflict', `${destination} is conflicting or non-regular generated content`);
    }
    return;
  }
  dependencies.beforePublish?.(label);
  validateRuntime();
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
      validateRuntime();
      linkSync(temporary, destination);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!isExactRegularFile(destination, bytes)) fail('conflict', destination);
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
  const status = dependencies.status ?? statusProtocol;
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
    ...(resolved.archiveDir
      ? ['--issue', resolved.issue, '--artifact-kind', resolved.artifactKind]
      : []),
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
      archiveDir: resolved.archiveDir,
      ...(options.repository ? { repository: options.repository } : {}),
    });
    state = status({
      cwd,
      dir: resolved.dir,
      ...(options.repository ? { repository: options.repository } : {}),
    });
    if (!state.integrity.ok) fail('integrity', state.integrity.errors.join('; '));
    assertStartupState(state);

    const runtimeAbsolute = path.resolve(state.repositoryRoot, state.initialization.runtimeDir);
    const runtimeIdentity = captureRuntimeIdentity(runtimeAbsolute, state.repositoryRoot);
    const validateRuntime = () => assertRuntimeStable(runtimeAbsolute, runtimeIdentity);
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
      ...(resolved.archiveDir
        ? {
            hostArchive: {
              issue: resolved.issue,
              artifactKind: resolved.artifactKind,
              archiveDir: resolved.archiveDir,
            },
          }
        : {}),
      handoffs: {
        author: { path: authorRelative, sha256: digest(authorBytes) },
        reviewer: { path: reviewerRelative, sha256: digest(reviewerBytes) },
      },
      createdAt: state.createdAt,
    };
    const manifestBytes = exactJson(manifest);
    const publications = [
      { destination: authorAbsolute, bytes: authorBytes, label: FILES.author },
      { destination: reviewerAbsolute, bytes: reviewerBytes, label: FILES.reviewer },
      { destination: manifestAbsolute, bytes: manifestBytes, label: FILES.manifest },
    ];

    validateRuntime();
    preflightPublications(publications);
    for (const publication of publications) {
      atomicPublish(
        publication.destination,
        publication.bytes,
        dependencies,
        publication.label,
        validateRuntime
      );
    }

    if (
      !isExactRegularFile(authorAbsolute, authorBytes) ||
      !isExactRegularFile(reviewerAbsolute, reviewerBytes) ||
      !isExactRegularFile(manifestAbsolute, manifestBytes)
    ) {
      fail('verification', 'published startup files do not match rendered bytes');
    }

    (dependencies.registerProtocol ?? registerProtocol)({
      projectDir: state.repositoryRoot,
      state,
    });

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
