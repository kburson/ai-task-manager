import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { AprError } from '../errors.mjs';
import { atomicWrite } from '../protocol/store.mjs';
import { hydrateTemplate } from '../templates/index.mjs';
import { resolveContainedPath } from './paths.mjs';

const METADATA_KEYS = Object.freeze([
  'schema',
  'review_id',
  'role',
  'turn',
  'commit_mode',
  'authority_assurance',
  'artifact_path',
  'artifact_commit',
  'artifact_blob',
  'artifact_digest',
  'agent',
  'started_at',
  'submitted_at',
  'finding_ids',
  'answered_finding_ids',
  'acknowledged_supplement_ids',
]);
const AGENT_KEYS = Object.freeze([
  'host',
  'provider',
  'model_id',
  'model_display',
  'session_fingerprint',
  'identity_source',
]);
const SECTION_CATALOG = Object.freeze(
  Object.assign(Object.create(null), {
    reviewer: Object.freeze([
      'Summary',
      'Findings',
      'Required changes',
      'Optional suggestions',
      'Decision',
    ]),
    author: Object.freeze([
      'Summary',
      'Finding dispositions',
      'Changes made',
      'Declined changes and rationale',
      'Verification',
    ]),
  })
);
function fail(code, message, recovery, details = {}) {
  throw new AprError(code, message, { recovery, details });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function protocolOf(review) {
  const protocol = review?.protocol ?? review;
  if (!protocol || typeof protocol !== 'object') {
    fail('APR_RESPONSE_INVALID', 'Review authority is required.', 'Read the review and retry.');
  }
  return protocol;
}

function instant(review) {
  const value = review.now ?? new Date();
  const parsed = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    fail('APR_RESPONSE_INVALID', 'Response time is invalid.', 'Use a valid clock instant.');
  }
  return parsed.toISOString();
}

function agent(identity) {
  return Object.fromEntries(AGENT_KEYS.map((key) => [key, identity[key]]));
}

function responseStartedAt(review, role) {
  const protocol = protocolOf(review);
  const identity = review.participants?.[role];
  const claim = protocol.claims?.[role];
  const parsed = typeof identity?.joined_at === 'string' ? new Date(identity.joined_at) : null;
  if (
    !identity ||
    !claim ||
    claim.session_fingerprint !== identity.session_fingerprint ||
    !parsed ||
    Number.isNaN(parsed.valueOf()) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(identity.joined_at)
  ) {
    fail(
      'APR_RESPONSE_INVALID',
      `The ${role} response start time is unavailable from event participant authority.`,
      `Register and claim the ${role} participant, then retry.`
    );
  }
  return identity.joined_at;
}

function expectedMetadata(review, role, turn) {
  const protocol = protocolOf(review);
  const identity = review.participants?.[role];
  if (!identity) {
    fail(
      'APR_IDENTITY_REQUIRED',
      `The ${role} participant is not registered.`,
      `Register the ${role} participant and retry.`
    );
  }
  const artifact = protocol.artifact;
  return {
    schema: 'ai-peer-review.response/v1',
    review_id: protocol.review_id,
    role,
    turn,
    commit_mode: protocol.commit_mode,
    authority_assurance: protocol.authority?.verifier?.signer_strength ?? 'unavailable',
    artifact_path: artifact?.path,
    artifact_commit: artifact?.head ?? review.artifact_commit ?? null,
    artifact_blob: artifact?.blob ?? null,
    artifact_digest: artifact?.digest,
    agent: agent(identity),
    started_at: responseStartedAt(review, role),
    submitted_at: null,
    finding_ids: [],
    answered_finding_ids: role === 'author' ? [...(review.pending_finding_ids ?? [])] : [],
    acknowledged_supplement_ids: (protocol.supplements ?? [])
      .filter((supplement) => supplement.target_role === role && supplement.target_turn === turn)
      .map((supplement) => supplement.supplement_id),
  };
}

function scalar(value) {
  return JSON.stringify(value);
}

function renderFrontmatter(metadata, eol = '\n') {
  const lines = ['---'];
  for (const key of METADATA_KEYS) {
    if (key === 'agent') {
      lines.push('agent:');
      for (const agentKey of AGENT_KEYS)
        lines.push(`  ${agentKey}: ${scalar(metadata.agent[agentKey])}`);
    } else {
      lines.push(`${key}: ${scalar(metadata[key])}`);
    }
  }
  lines.push('---');
  return lines.join(eol);
}

function parseFrontmatter(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const start = lines.indexOf('---');
  const end = lines.indexOf('---', start + 1);
  if (start < 0 || end <= start + 1) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response frontmatter is missing.',
      'Recreate the response draft.'
    );
  }
  const metadata = {};
  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index];
    if (line === 'agent:') {
      const value = {};
      for (const key of AGENT_KEYS) {
        index += 1;
        const match = lines[index]?.match(/^  ([a-z_]+): (.+)$/);
        if (!match || match[1] !== key) {
          fail(
            'APR_RESPONSE_INVALID',
            'Response agent metadata is malformed.',
            'Recreate the response draft.'
          );
        }
        try {
          value[key] = JSON.parse(match[2]);
        } catch {
          fail(
            'APR_RESPONSE_INVALID',
            'Response agent metadata is malformed.',
            'Recreate the response draft.'
          );
        }
      }
      metadata.agent = value;
      continue;
    }
    const match = line.match(/^([a-z_]+): (.+)$/);
    if (!match || Object.hasOwn(metadata, match[1])) {
      fail(
        'APR_RESPONSE_INVALID',
        'Response metadata is malformed.',
        'Recreate the response draft.'
      );
    }
    try {
      metadata[match[1]] = JSON.parse(match[2]);
    } catch {
      fail(
        'APR_RESPONSE_INVALID',
        'Response metadata is malformed.',
        'Recreate the response draft.'
      );
    }
  }
  const keys = Object.keys(metadata);
  if (
    keys.length !== METADATA_KEYS.length ||
    keys.some((key, index) => key !== METADATA_KEYS[index])
  ) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response metadata fields are not closed.',
      'Recreate the response draft.'
    );
  }
  return { text, eol, metadata, body: lines.slice(end + 1).join('\n') };
}

function markdownLines(text) {
  const result = [];
  let offset = 0;
  let fence = null;
  let inComment = false;
  for (const raw of text.match(/.*(?:\n|$)/g) ?? []) {
    if (!raw) continue;
    const line = raw.replace(/\n$/, '').replace(/\r$/, '');
    const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const closingFence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
      if (
        closingFence &&
        closingFence[1][0] === fence.character &&
        closingFence[1].length >= fence.length
      ) {
        fence = null;
      }
      result.push({ text: '', source: '', index: offset, end: offset + raw.length });
      offset += raw.length;
      continue;
    }
    if (!inComment && fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length };
      result.push({ text: '', source: '', index: offset, end: offset + raw.length });
      offset += raw.length;
      continue;
    }
    const source = inComment ? '' : line;
    let visible = '';
    let cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const close = line.indexOf('-->', cursor);
        if (close < 0) {
          cursor = line.length;
          break;
        }
        inComment = false;
        cursor = close + 3;
      } else {
        const open = line.indexOf('<!--', cursor);
        if (open < 0) {
          visible += line.slice(cursor);
          break;
        }
        visible += line.slice(cursor, open);
        inComment = true;
        cursor = open + 4;
      }
    }
    result.push({ text: visible, source, index: offset, end: offset + raw.length });
    offset += raw.length;
  }
  return result;
}

function markdownHeadings(text, level) {
  return markdownLines(text).flatMap((line) => {
    const match = line.source.match(/^[ \t]{0,3}(#{2,3})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/);
    if (!match || match[1].length !== level) return [];
    return [{ heading: match[2], index: line.index, contentStart: line.end }];
  });
}

function parseSections(body, role) {
  if (!Object.hasOwn(SECTION_CATALOG, role)) {
    fail('APR_RESPONSE_INVALID', 'Response role is invalid.', 'Use author or reviewer.');
  }
  const matches = markdownHeadings(body, 2);
  const headings = matches.map((match) => match.heading);
  const expected = SECTION_CATALOG[role];
  if (
    headings.length !== expected.length ||
    headings.some((heading, index) => heading !== expected[index])
  ) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response prose sections do not match the role contract.',
      'Restore the generated role-specific section headings.'
    );
  }
  return matches.map((match, index) => ({
    heading: match.heading,
    content: body.slice(match.contentStart, matches[index + 1]?.index ?? body.length).trim(),
  }));
}

export function parseResponse(bytes) {
  const parsed = parseFrontmatter(bytes);
  return Object.freeze({
    metadata: parsed.metadata,
    sections: Object.freeze(parseSections(parsed.body, parsed.metadata.role)),
  });
}

function responsePath(review, role, turn) {
  if (!Number.isSafeInteger(turn) || turn <= 0 || !['author', 'reviewer'].includes(role)) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response role or turn is invalid.',
      'Use the current role and positive turn.'
    );
  }
  const resolver = review.paths?.[`${role}Response`];
  if (typeof resolver !== 'function') {
    fail(
      'APR_RESPONSE_INVALID',
      'Resolved review paths are required.',
      'Resolve review paths and retry.'
    );
  }
  return resolver(turn).absolute;
}

function registryPath(review, role, turn) {
  const scratch = review.paths?.scratch?.absolute;
  if (!scratch) {
    fail(
      'APR_RESPONSE_INVALID',
      'Resolved scratch path is required.',
      'Resolve review paths and retry.'
    );
  }
  return path.join(scratch, 'responses', `${role}-${turn}.json`);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameDraftMetadata(candidate, expected) {
  return (
    candidate?.agent?.session_fingerprint === expected.agent.session_fingerprint &&
    same({ ...candidate, agent: expected.agent }, expected)
  );
}

function draftVariables(role, frontmatter, protocol) {
  const assurance = protocol.authority?.verifier?.signer_strength ?? 'unavailable';
  const modeBanner =
    protocol.commit_mode === 'no-commit'
      ? `> **NO-COMMIT TEST MODE** — authority assurance: \`${assurance}\``
      : 'Mode: `normal`';
  if (role === 'reviewer') {
    return {
      frontmatter,
      mode_banner: modeBanner,
      summary: '<!-- Write the review summary. -->',
      findings: '<!-- List numbered findings or write None. -->',
      required_changes: '<!-- List required changes or write None. -->',
      optional_suggestions: '<!-- List numbered optional suggestions or write None. -->',
      decision: '<!-- Write revisions-requested or accepted. -->',
    };
  }
  return {
    frontmatter,
    mode_banner: modeBanner,
    summary: '<!-- Summarize the revision. -->',
    finding_dispositions: '<!-- Disposition every sealed finding ID. -->',
    changes_made: '<!-- Describe changes made. -->',
    declined_changes: '<!-- Explain declined changes or write None. -->',
    verification: '<!-- Record verification performed. -->',
  };
}

function collision(file) {
  fail(
    'APR_OUTPUT_COLLISION',
    'Tracked response path is occupied by conflicting content.',
    `Preserve ${file}, inspect the collision, and choose explicit recovery.`,
    { file }
  );
}

function pathEntryExists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (cause) {
    if (cause?.code === 'ENOENT') return false;
    throw cause;
  }
}

function regularFile(file) {
  try {
    const status = lstatSync(file);
    return status.isFile() && !status.isSymbolicLink();
  } catch (cause) {
    if (cause?.code === 'ENOENT') return false;
    throw cause;
  }
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, 'r');
    fsyncSync(descriptor);
  } catch (cause) {
    const unsupported = new Set(['EINVAL', 'EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM']);
    if (!unsupported.has(cause?.code)) throw cause;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeExclusiveAtomic(file, bytes) {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
  let descriptor;
  let linking = false;
  try {
    mkdirSync(directory, { recursive: true });
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linking = true;
    linkSync(temporary, file);
    linking = false;
    unlinkSync(temporary);
    syncDirectory(directory);
  } catch (cause) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original failure.
      }
    }
    try {
      if (pathEntryExists(temporary)) unlinkSync(temporary);
    } catch {
      // Cleanup is limited to this operation's random sibling.
    }
    if (cause?.code === 'EEXIST' && linking) collision(file);
    const error = new AprError(
      'APR_RESPONSE_WRITE_FAILED',
      'Response draft could not be created durably.',
      {
        recovery: `Inspect ${directory} and retry after correcting the filesystem failure.`,
        details: { file },
      }
    );
    error.cause = cause;
    throw error;
  }
}

function currentTurn(review, role) {
  const protocol = protocolOf(review);
  const validState =
    (role === 'reviewer' && protocol.state === 'reviewer-turn') ||
    (role === 'author' && protocol.state === 'author-revision');
  const turn = role === 'reviewer' ? protocol.turns_used + 1 : protocol.turns_used;
  if (!validState || !Number.isSafeInteger(turn) || turn <= 0 || turn > protocol.max_turns) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response role or turn is not current in event authority.',
      'Read status and create or submit only the current participant response.'
    );
  }
  return turn;
}

function requireCurrentTurn(review, role, turn) {
  if (turn !== currentTurn(review, role)) {
    fail(
      'APR_RESPONSE_INVALID',
      'Response turn does not match event authority.',
      'Read status and use the event-derived current turn.'
    );
  }
}

function allCollateralPaths(review, paths = review.paths) {
  const maximum = protocolOf(review).max_turns;
  if (!Number.isSafeInteger(maximum) || maximum <= 0) {
    fail(
      'APR_RESPONSE_INVALID',
      'Review turn budget is unavailable for collateral reservation.',
      'Start the review with a positive maximum turn budget.'
    );
  }
  const values = [];
  for (let turn = 1; turn <= maximum; turn += 1) {
    values.push(paths.reviewerResponse(turn), paths.authorResponse(turn));
  }
  values.push(paths.humanDecision, paths.manifest);
  return values;
}

function recoveryPaths(review) {
  const current = review.paths;
  const reviewId = protocolOf(review).review_id;
  if (typeof reviewId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reviewId)) {
    fail('APR_RESPONSE_INVALID', 'Review ID is invalid.', 'Use the event-authorized review ID.');
  }
  const destination = resolveContainedPath(
    current.root,
    `${current.destination.relative}-recovery-${reviewId}`,
    'review recovery'
  );
  const shift = (value) => {
    const relative = path.relative(current.destination.absolute, value.absolute);
    return resolveContainedPath(
      current.root,
      path.join(destination.relative, relative),
      'response'
    );
  };
  return Object.freeze({
    ...current,
    destination,
    reviewerResponse: (turn) => shift(current.reviewerResponse(turn)),
    authorResponse: (turn) => shift(current.authorResponse(turn)),
    humanDecision: shift(current.humanDecision),
    manifest: shift(current.manifest),
  });
}

export function reserveCollateral(review, { validateForeignManifest, write = true } = {}) {
  const registry = path.join(review.paths?.scratch?.absolute ?? '', 'collateral-reservation.json');
  if (!review.paths?.scratch?.absolute) {
    fail(
      'APR_RESPONSE_INVALID',
      'Resolved scratch path is required.',
      'Resolve review paths and retry.'
    );
  }
  const select = (paths, recoveredFrom = null) => {
    const expected = allCollateralPaths(review, paths);
    const record = {
      schema: 'ai-peer-review.collateral-reservation/v1',
      review_id: protocolOf(review).review_id,
      destination: paths.destination.relative,
      paths: expected.map((value) => value.relative),
      recovered_from: recoveredFrom,
    };
    if (pathEntryExists(registry)) {
      if (!regularFile(registry)) collision(registry);
      let prior;
      try {
        prior = JSON.parse(readFileSync(registry, 'utf8'));
      } catch {
        collision(registry);
      }
      if (!same(prior, record)) collision(registry);
      return Object.freeze({ paths, reservation: Object.freeze(record) });
    }
    const occupied = expected.filter((value) => pathEntryExists(value.absolute));
    if (occupied.length) {
      if (recoveredFrom !== null || typeof validateForeignManifest !== 'function') {
        collision(paths.destination.absolute);
      }
      if (!regularFile(paths.manifest.absolute)) collision(paths.destination.absolute);
      let inspection;
      try {
        inspection = validateForeignManifest({
          bytes: readFileSync(paths.manifest.absolute),
          occupied: occupied.map((value) => value.relative),
          expected: expected.map((value) => value.relative),
        });
      } catch {
        inspection = null;
      }
      if (
        !inspection ||
        inspection.complete !== true ||
        typeof inspection.review_id !== 'string' ||
        inspection.review_id === protocolOf(review).review_id
      ) {
        collision(paths.destination.absolute);
      }
      return select(recoveryPaths({ ...review, paths }), inspection.review_id);
    }
    if (write) {
      mkdirSync(path.dirname(registry), { recursive: true });
      atomicWrite(registry, Buffer.from(`${JSON.stringify(record, null, 2)}\n`));
    }
    return Object.freeze({ paths, reservation: Object.freeze(record) });
  };
  return select(review.paths);
}

export function createResponseDraft(review, role, turn) {
  requireCurrentTurn(review, role, turn);
  const file = responsePath(review, role, turn);
  const registry = registryPath(review, role, turn);
  if (pathEntryExists(file)) {
    if (!regularFile(file) || !regularFile(registry)) collision(file);
    let registered;
    let parsed;
    try {
      registered = JSON.parse(readFileSync(registry, 'utf8'));
      parsed = parseResponse(readFileSync(file));
    } catch {
      collision(file);
    }
    const metadata = expectedMetadata(review, role, turn);
    if (parsed.metadata.submitted_at !== null) {
      const prior = (review.sealed_responses ?? []).find((item) => item.path === file);
      if (!prior || prior.digest !== sha256(readFileSync(file))) collision(file);
      return Object.freeze({ path: file, bytes: readFileSync(file), metadata: parsed.metadata });
    }
    if (!same(registered, metadata) || !same(parsed.metadata, metadata)) collision(file);
    return Object.freeze({ path: file, bytes: readFileSync(file), metadata });
  }
  const metadata = expectedMetadata(review, role, turn);
  const bytes = hydrateTemplate(
    `${role}-response`,
    draftVariables(role, renderFrontmatter(metadata), protocolOf(review))
  );
  mkdirSync(path.dirname(file), { recursive: true });
  mkdirSync(path.dirname(registry), { recursive: true });
  atomicWrite(registry, Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`));
  writeExclusiveAtomic(file, bytes);
  return Object.freeze({ path: file, bytes, metadata });
}

function validateIdentity(review, role, identity) {
  const pinned = review.participants?.[role];
  if (
    !identity ||
    identity.role !== role ||
    identity.host !== pinned?.host ||
    identity.provider !== pinned?.provider ||
    identity.session_fingerprint !== pinned?.session_fingerprint ||
    identity.identity_source !== pinned?.identity_source
  ) {
    fail(
      'APR_IDENTITY_CONFLICT',
      'Response identity does not match the registered participant.',
      'Submit from the registered participant session.'
    );
  }
}

function findingIds(sections, turn, prior) {
  const selected = sections.filter(({ heading }) =>
    ['Findings', 'Optional suggestions'].includes(heading)
  );
  const ids = [];
  for (const section of selected) {
    for (const heading of markdownHeadings(section.content, 3)) {
      const match = heading.heading.match(/^R([1-9][0-9]*)-F([0-9]{3}) — (.*)$/);
      if (!match || Number(match[1]) !== turn || !match[3].trim()) {
        fail(
          'APR_RESPONSE_INVALID',
          'Reviewer finding heading is invalid.',
          `Use headings like ### R${turn}-F001 — Title.`
        );
      }
      ids.push(`R${match[1]}-F${match[2]}`);
    }
  }
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => prior.includes(id)) ||
    ids.some((id, index) => id !== `R${turn}-F${String(index + 1).padStart(3, '0')}`)
  ) {
    fail(
      'APR_RESPONSE_INVALID',
      'Reviewer finding IDs are duplicated, reused, or out of sequence.',
      `Number this turn's findings once from R${turn}-F001 in document order.`
    );
  }
  return ids;
}

function dispositionIds(sections) {
  const section = sections.find(({ heading }) => heading === 'Finding dispositions');
  const ids = [];
  for (const line of markdownLines(section.content)) {
    for (const match of line.text.matchAll(/\bR[1-9][0-9]*-F[0-9]{3}\b/g)) ids.push(match[0]);
  }
  return ids;
}

function sealedResult(file, bytes, metadata) {
  return Object.freeze({
    path: file,
    digest: sha256(bytes),
    role: metadata.role,
    turn: metadata.turn,
    submitted_at: metadata.submitted_at,
    finding_ids: Object.freeze([...metadata.finding_ids]),
    answered_finding_ids: Object.freeze([...metadata.answered_finding_ids]),
    acknowledged_supplement_ids: Object.freeze([...(metadata.acknowledged_supplement_ids ?? [])]),
  });
}

function replaceSectionContent(text, heading, content, eol) {
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  if (!pattern.test(text)) {
    fail(
      'APR_RESPONSE_INVALID',
      `Response section ${heading} is unavailable.`,
      'Restore the generated response headings and retry.'
    );
  }
  return text.replace(pattern, `$1${String(content).replaceAll('\n', eol)}`);
}

export function sealResponse(review, file, identity, { declinedReason = null } = {}) {
  if (!regularFile(file)) collision(file);
  const input = readFileSync(file);
  const parsed = parseFrontmatter(input);
  const { metadata } = parsed;
  const sections = parseSections(parsed.body, metadata.role);
  const expectedFile = responsePath(review, metadata.role, metadata.turn);
  if (path.resolve(file) !== path.resolve(expectedFile)) collision(file);
  validateIdentity(review, metadata.role, identity);
  if (metadata.submitted_at !== null) {
    const prior = (review.sealed_responses ?? []).find((item) => item.path === file);
    const result = sealedResult(file, input, metadata);
    if (prior?.digest === result.digest) return result;
    requireCurrentTurn(review, metadata.role, metadata.turn);
    const registry = registryPath(review, metadata.role, metadata.turn);
    let registeredMetadata;
    try {
      if (!regularFile(registry)) throw new Error('response registry is not a regular file');
      registeredMetadata = JSON.parse(readFileSync(registry, 'utf8'));
    } catch {
      fail(
        'APR_PROTECTED_METADATA_CHANGED',
        'Sealed response recovery authority is unavailable.',
        'Restore the response registry and retry the exact submission.'
      );
    }
    const expected = expectedMetadata(review, metadata.role, metadata.turn);
    const unsealed = {
      ...metadata,
      submitted_at: null,
      finding_ids: metadata.role === 'reviewer' ? [] : metadata.finding_ids,
    };
    const submitted = new Date(metadata.submitted_at);
    if (
      !sameDraftMetadata(registeredMetadata, expected) ||
      !same(unsealed, expected) ||
      Number.isNaN(submitted.valueOf()) ||
      submitted.valueOf() < Date.parse(metadata.started_at)
    ) {
      fail(
        'APR_PROTECTED_METADATA_CHANGED',
        'Sealed response bytes do not match recoverable draft authority.',
        'Restore the exact generated response and retry the original submission.'
      );
    }
    if (metadata.role === 'reviewer') {
      const decision = sections.find(({ heading }) => heading === 'Decision').content;
      if (
        !['revisions-requested', 'accepted'].includes(decision) ||
        !same(
          metadata.finding_ids,
          findingIds(sections, metadata.turn, review.prior_finding_ids ?? [])
        )
      ) {
        fail(
          'APR_RESPONSE_INVALID',
          'Recovered reviewer response content differs from sealed metadata.',
          'Restore the exact decision and finding IDs from the interrupted submission.'
        );
      }
    } else {
      const pending = review.pending_finding_ids ?? [];
      const recoveredReason = sections.find(
        ({ heading }) => heading === 'Declined changes and rationale'
      )?.content;
      if (
        !same(dispositionIds(sections), pending) ||
        (declinedReason !== null && recoveredReason !== String(declinedReason).trim())
      ) {
        fail(
          'APR_RESPONSE_INVALID',
          'Recovered author response differs from the exact interrupted submission.',
          'Restore every finding disposition and declined-change rationale exactly.'
        );
      }
    }
    return result;
  }
  requireCurrentTurn(review, metadata.role, metadata.turn);
  const registry = registryPath(review, metadata.role, metadata.turn);
  let registeredMetadata;
  try {
    if (!regularFile(registry)) throw new Error('response registry is not a regular file');
    registeredMetadata = JSON.parse(readFileSync(registry, 'utf8'));
  } catch {
    fail(
      'APR_PROTECTED_METADATA_CHANGED',
      'Response draft authority is unavailable.',
      'Restore the response registry or recreate the draft.'
    );
  }
  const protectedMetadata = expectedMetadata(review, metadata.role, metadata.turn);
  if (
    !sameDraftMetadata(metadata, protectedMetadata) ||
    !sameDraftMetadata(registeredMetadata, protectedMetadata)
  ) {
    fail(
      'APR_PROTECTED_METADATA_CHANGED',
      'Protected response metadata changed after draft creation.',
      'Restore the generated frontmatter and edit only prose sections.'
    );
  }
  const updated = {
    ...metadata,
    agent: agent(identity),
    submitted_at: instant(review),
  };
  if (metadata.role === 'reviewer') {
    const decision = sections.find(({ heading }) => heading === 'Decision').content;
    if (!['revisions-requested', 'accepted'].includes(decision)) {
      fail(
        'APR_RESPONSE_INVALID',
        'Reviewer decision is invalid.',
        'Use exactly revisions-requested or accepted.'
      );
    }
    updated.finding_ids = findingIds(sections, metadata.turn, review.prior_finding_ids ?? []);
  } else {
    const pending = review.pending_finding_ids ?? [];
    const dispositions = dispositionIds(sections);
    if (
      !same(metadata.answered_finding_ids, pending) ||
      !same(dispositions, pending) ||
      new Set(dispositions).size !== dispositions.length
    ) {
      fail(
        'APR_RESPONSE_INVALID',
        'Author response does not disposition the preceding sealed finding set exactly once.',
        'Reference every pending finding ID exactly once and do not add unknown IDs.'
      );
    }
  }
  const frontmatter = renderFrontmatter(updated, parsed.eol);
  let text = input.toString('utf8');
  if (declinedReason !== null) {
    if (
      metadata.role !== 'author' ||
      typeof declinedReason !== 'string' ||
      !declinedReason.trim()
    ) {
      fail(
        'APR_RESPONSE_INVALID',
        'Declined-change rationale is invalid.',
        'Use a non-empty rationale only for the current author response.'
      );
    }
    text = replaceSectionContent(
      text,
      'Declined changes and rationale',
      declinedReason.trim(),
      parsed.eol
    );
  }
  const frontmatterPattern = /(^|\r?\n)---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
  const sealed = Buffer.from(
    text.replace(frontmatterPattern, (_match, prefix) => `${prefix}${frontmatter}`)
  );
  atomicWrite(file, sealed);
  return sealedResult(file, sealed, updated);
}
