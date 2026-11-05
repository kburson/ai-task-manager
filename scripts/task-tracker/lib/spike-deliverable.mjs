// @story #2156
// Publication evidence validation; no source acceptance or provider effects.
import { parseMarker } from './marker-grammar.mjs';
import { parseDeliverablePosted, parseIssueKind } from './issue-kind.mjs';
import { parseFromCommentArg } from './deep-dive.mjs';
import { fingerprint } from './resident-action-ledger-codec.mjs';
import { markdownViews, openingFenceFor, isClosingFence } from './plan-markdown-views.mjs';

export function spikeDeliverableRefusal(category) {
  return new TypeError(`spike-deliverable:${category}`);
}

function positiveId(value, category) {
  const text = String(value ?? '');
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)))
    throw spikeDeliverableRefusal(category);
  return text;
}

function commentUrl(value) {
  if (typeof value !== 'string') throw spikeDeliverableRefusal('comment-url');
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(
      value
    );
  if (!match || new URL(value).href !== value) throw spikeDeliverableRefusal('comment-url');
  positiveId(match[3], 'comment-url');
  positiveId(match[4], 'comment-url');
  return { repository: `${match[1]}/${match[2]}`, issue: match[3], id: match[4] };
}

export function parseSpikeDeliverableArgs(argv = []) {
  let issueNumber = null;
  let commentReference = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = String(argv[index]);
    if (/^#?\d+$/.test(arg)) {
      if (issueNumber !== null) throw spikeDeliverableRefusal('usage');
      issueNumber = Number(positiveId(arg.replace(/^#/, ''), 'usage'));
    } else if (arg === '--from-comment' || arg.startsWith('--from-comment=')) {
      if (commentReference !== null) throw spikeDeliverableRefusal('usage');
      const inline = arg.startsWith('--from-comment=');
      commentReference = inline ? arg.slice('--from-comment='.length) : argv[++index];
      if (typeof commentReference !== 'string') throw spikeDeliverableRefusal('usage');
    } else throw spikeDeliverableRefusal('usage');
  }
  if (issueNumber === null || commentReference === null) throw spikeDeliverableRefusal('usage');
  if (/^[1-9]\d*$/.test(commentReference)) positiveId(commentReference, 'usage');
  else if (commentUrl(commentReference).issue !== String(issueNumber))
    throw spikeDeliverableRefusal('usage');
  return { issueNumber, commentReference };
}

function providerInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))
    return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    (new Date(parsed).toISOString() === value ||
      new Date(parsed).toISOString().replace('.000Z', 'Z') === value)
  );
}

export function validateSpikeDeliverableComment({
  repository,
  issueNumber,
  commentId,
  currentUser,
  comment,
} = {}) {
  const expectedId = positiveId(commentId, 'comment-id');
  if (!comment || positiveId(comment.id, 'comment-id') !== expectedId)
    throw spikeDeliverableRefusal('comment-id');
  const location = commentUrl(comment.html_url);
  if (
    location.repository.toLowerCase() !== String(repository).toLowerCase() ||
    location.issue !== positiveId(issueNumber, 'issue') ||
    location.id !== expectedId
  )
    throw spikeDeliverableRefusal('comment-location');
  if (typeof comment.body !== 'string' || !comment.body.trim())
    throw spikeDeliverableRefusal('comment-body');
  const author = comment.user?.login;
  if (
    comment.user?.type !== 'User' ||
    typeof author !== 'string' ||
    !author ||
    author !== author.trim() ||
    typeof currentUser !== 'string' ||
    !currentUser ||
    currentUser !== currentUser.trim() ||
    author.toLowerCase() !== currentUser.toLowerCase()
  )
    throw spikeDeliverableRefusal('comment-author');
  if (
    !providerInstant(comment.created_at) ||
    !providerInstant(comment.updated_at) ||
    Date.parse(comment.updated_at) < Date.parse(comment.created_at)
  )
    throw spikeDeliverableRefusal('comment-time');
  return Object.freeze({
    id: expectedId,
    url: comment.html_url,
    body: comment.body,
    author,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  });
}

export function spikeDeliverableCommentIdentity(observation) {
  return fingerprint(observation);
}

export function spikeDeliverableCommentId(reference) {
  // The caller has already checked the closed numeric/URL grammar.
  return parseFromCommentArg(reference);
}

function progressSection(body) {
  const { originalLines, structuralLines } = markdownViews(String(body));
  const heading = /^##[ \t]+AITM Progress Markers[ \t]*$/i;
  const matches = originalLines.flatMap((line, index) => (heading.test(line) ? [index] : []));
  if (matches.length !== 1 || !heading.test(structuralLines[matches[0]] ?? ''))
    throw spikeDeliverableRefusal('marker-section');
  const start = matches[0] + 1;
  let end = originalLines.findIndex((line, index) => index >= start && /^##\s+/.test(line));
  if (end < 0) end = originalLines.length;
  const structuralEnd = structuralLines.findIndex(
    (line, index) => index >= start && /^##\s+/.test(line)
  );
  if (structuralEnd !== (end === originalLines.length ? -1 : end))
    throw spikeDeliverableRefusal('marker-section-boundary');
  return originalLines.slice(start, end).join('\n');
}

function claims(section, name) {
  const starts = [...section.matchAll(new RegExp(`<!--\\s*aitm-${name}(?![\\w-])`, 'gi'))];
  let fence = null;
  let offset = 0;
  const fenced = [];
  for (const line of section.split('\n')) {
    const opening = fence ? null : openingFenceFor(line);
    if (fence || opening) fenced.push([offset, offset + line.length]);
    if (fence && isClosingFence(line, fence)) fence = null;
    else if (!fence) fence = opening;
    offset += line.length + 1;
  }
  if (fence) throw spikeDeliverableRefusal('marker-section-boundary');
  return starts.map((match) => {
    const end = section.indexOf('-->', match.index);
    return {
      raw: end < 0 ? null : section.slice(match.index, end + 3),
      fenced: fenced.some(([start, stop]) => match.index >= start && match.index <= stop),
    };
  });
}

export function assertSpikeDeliverableKind(body) {
  const all = claims(progressSection(body), 'issue-kind');
  const parsed = all.length === 1 && !all[0].fenced && parseMarker(all[0].raw);
  if (
    !parsed ||
    parsed.name !== 'issue-kind' ||
    Object.keys(parsed.props).join(',') !== 'kind' ||
    parseIssueKind(body) !== 'spike'
  )
    throw spikeDeliverableRefusal('kind');
}

export function readSpikeDeliverableMarker(body) {
  const all = claims(progressSection(body), 'deliverable-posted');
  if (all.length > 1) throw spikeDeliverableRefusal('marker-duplicate');
  if (!all.length) return null;
  const claim = all[0];
  const parsed = claim.raw && !claim.fenced && parseMarker(claim.raw);
  const attributes = claim.raw ? [...claim.raw.matchAll(/([A-Za-z0-9_-]+)="[^"]*"/g)] : [];
  const projected = parsed && parseDeliverablePosted(body);
  if (
    !parsed ||
    parsed.name !== 'deliverable-posted' ||
    attributes.length !== 2 ||
    Object.keys(parsed.props).sort().join(',') !== 'ts,url' ||
    !projected ||
    projected.url !== parsed.props.url ||
    projected.ts !== parsed.props.ts
  )
    throw spikeDeliverableRefusal('marker-malformed');
  return projected;
}
