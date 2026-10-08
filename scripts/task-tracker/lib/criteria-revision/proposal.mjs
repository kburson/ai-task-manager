import { deriveCanonicalAmendment, canonicalCapsuleWrite } from './canonical.mjs';
import { validateNativeIndividualProofs } from './proof-execution.mjs';
// @story #1851
import {
  reduceRevisionEvents,
  deriveCriteriaAuthorityHistory,
  selectEffectiveRevisionProposalEvents,
} from './reducer.mjs';
import { parseRevisionEvent, revisionRecord, withRevisionValidation } from './records.mjs';
import { parseAcceptanceCriteria } from '../acceptance-criteria.mjs';
import { parseAcEvidenceStructure as parseAcEvidence } from '../ac-evidence.mjs';
import { parseVerificationCommands } from '../verification-commands.mjs';
import { parseProofMarker, hasExecutionProof, serializeProofMarker } from '../proof-marker.mjs';
import { resolveVcListStrict, resolveCitedOrLiteralCommands } from '../vc-ref.mjs';
import { parseBodyVersion, stampBodyVersion } from '../body-version.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { renderDeliveryContract } from '../github-records/delivery-contract.mjs';
import {
  REVISION_SCHEMA,
  REVISION_MODES,
  exactKeys,
  identifier,
  text,
  hashBytes,
  hashRevisionValue,
  revisionError,
  validateExecutor,
  validateDefinitions,
  validateEdits,
  validateRevisionObservation,
  validateRevisionProposal,
} from './schema.mjs';
const sectionNames = new Map([
  ['Acceptance Criteria', 'ac'],
  ['Verification Commands', 'vc'],
  ['Definition of Done', 'dod'],
]);
const comments = /<!--[\s\S]*?-->/g;
const markerKinds = [
  [/^aitm-(?:timing|entered-|stage-entry)/, 'historical'],
  [/^aitm-delivery-/, 'delivery'],
  [/^aitm-(?:plan-approved|plan-approval-binding)\b/, 'plan-approval'],
  [/^aitm-(?:test-receipt|test-verified|test-complete)\b/, 'test'],
  [/^aitm-agent-review\b/, 'agent-review'],
  [/^aitm-(?:review-approved|final-review)\b/, 'final-review'],
  [/^aitm-(?:ac-complete|acs-complete|dod-evidence:?(?:acs|checkboxes))\b/, 'aggregate-proof'],
];
function clone(value) {
  return structuredClone(value);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function hashSemanticContract(definitions) {
  validateDefinitions(definitions);
  return hashRevisionValue(
    definitions.map(
      ({
        identity,
        section,
        rootId,
        text,
        declaration,
        declarationBytes,
        commands,
        sourceBindings,
      }) => ({
        identity,
        section,
        rootId,
        text,
        declaration,
        declarationBytes,
        commands,
        sourceBindings,
      })
    )
  );
}
function unboundHash(definition) {
  return hashSemanticContract([{ ...definition, identity: 'unbound' }]);
}
function declarationBytes(declaration) {
  if (declaration.kind === 'vc-list')
    return serializeProofMarker({ 'vc-list': declaration.vcIds.map((x) => `vc:${x}`).join(' ') });
  if (declaration.kind === 'commands')
    return serializeProofMarker({ cmd: declaration.commands.map((x) => `\`${x}\``).join(' ') });
  return '';
}
function strictProperties(label) {
  const markers = [...label.matchAll(/<!--\s*aitm-verified\s+([\s\S]*?)\s*-->/g)];
  if (markers.length > 1) revisionError('ambiguous-declaration');
  if (markers.length) {
    const source = markers[0][1],
      keys = [...source.matchAll(/([a-zA-Z0-9_-]+)="(?:[^"]|&quot;)*"/g)].map((x) => x[1]);
    if (
      new Set(keys).size !== keys.length ||
      source.replace(/([a-zA-Z0-9_-]+)="(?:[^"]|&quot;)*"/g, '').trim() !== ''
    )
      revisionError('malformed-declaration');
  }
  return parseProofMarker(label);
}
function parseDeclaration(label, vcItems, { required = false } = {}) {
  const props = strictProperties(label);
  if (props && Object.hasOwn(props, 'cmd') && Object.hasOwn(props, 'vc-list'))
    revisionError('ambiguous-declaration');
  if (props && Object.hasOwn(props, 'vc-list')) {
    const resolved = resolveVcListStrict(props['vc-list'], vcItems);
    const ids = props['vc-list']
      .trim()
      .split(/\s+/)
      .map((x) => x.replace(/^vc:/i, ''));
    if (new Set(ids).size !== ids.length) revisionError('duplicate-vc-reference');
    return {
      declaration: { kind: 'vc-list', vcIds: ids },
      commands: resolved,
      bytes: serializeProofMarker({ 'vc-list': props['vc-list'] }),
    };
  }
  if (props && Object.hasOwn(props, 'cmd')) {
    const resolved = resolveCitedOrLiteralCommands(props.cmd, vcItems);
    if (!resolved.length || props.cmd.replace(/`([^`]+)`/g, '').trim() !== '')
      revisionError('malformed-declaration');
    return {
      declaration: { kind: 'commands', commands: resolved },
      commands: resolved,
      bytes: serializeProofMarker({ cmd: props.cmd }),
    };
  }
  if (required) revisionError('missing-declaration');
  return { declaration: { kind: 'none' }, commands: [], bytes: '' };
}
function legacyRows(body) {
  const rows = [],
    seen = new Set();
  let section = null,
    cursor = 0;
  for (const line of body.split('\n')) {
    const start = cursor,
      end = start + line.length;
    cursor = end + 1;
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const kind = sectionNames.get(heading[2]);
      if (kind) {
        if (seen.has(kind)) revisionError('duplicate-section');
        seen.add(kind);
        section = kind;
      } else if (heading[1].length <= 2) section = null;
      continue;
    }
    if (section && /^- \[[ x]\] /.test(line)) rows.push({ section, line, start, end });
  }
  if (!seen.has('ac') || !seen.has('vc') || !seen.has('dod')) revisionError('missing-section');
  return rows;
}
function parseLegacy(observation) {
  const body = observation.body.bytes,
    rows = legacyRows(body),
    vcItems = parseVerificationCommands(body),
    vcRows = rows.filter((x) => x.section === 'vc');
  if (
    vcItems.length !== vcRows.length ||
    vcItems.some((x) => x.id === null) ||
    new Set(vcItems.map((x) => x.id)).size !== vcItems.length
  )
    revisionError('ambiguous-root-VC');
  const ac = parseAcceptanceCriteria(body);
  if (ac && ac.length !== rows.filter((x) => x.section === 'ac').length)
    revisionError('ambiguous-AC');
  const counts = { ac: 0, vc: 0, dod: 0 };
  return rows.map(({ section, line }) => {
    const occurrence = ++counts[section],
      label = line.slice(6),
      rootId = section === 'vc' ? String(vcItems[occurrence - 1].id) : null;
    let parsed =
      section === 'vc'
        ? {
            declaration: { kind: 'commands', commands: [vcItems[occurrence - 1].command] },
            commands: [vcItems[occurrence - 1].command],
            bytes: serializeProofMarker({ cmd: `\`${vcItems[occurrence - 1].command}\`` }),
          }
        : parseDeclaration(label, vcItems, { required: section === 'ac' });
    const visible = label.replace(/\s?<!--[\s\S]*?-->/g, '');
    const proofMarkers = [...label.matchAll(comments)]
      .map((x) => x[0])
      .filter((x) => hasExecutionProof(x) || /aitm-(?:ac|dod)-evidence/.test(x));
    if (proofMarkers.some((x) => /aitm-ac-evidence/.test(x) && !parseAcEvidence(x)))
      revisionError('malformed-proof');
    const definition = {
      identity: `legacy-${hashRevisionValue([hashBytes(body), section, occurrence, line]).slice(7)}`,
      section,
      rootId,
      occurrence,
      text: section === 'vc' ? vcItems[occurrence - 1].command : visible,
      declaration: parsed.declaration,
      declarationBytes: parsed.bytes,
      commands: parsed.commands,
      sourceBindings: clone(observation.protectedSourceBindings),
      originalBytes: line,
      checked: line[3] === 'x',
      proof: proofMarkers.length
        ? {
            identity: `proof-${hashRevisionValue([section, occurrence, proofMarkers]).slice(7)}`,
            bytes: proofMarkers.join(' '),
          }
        : null,
    };
    if (observation.identities !== null) {
      const matches = observation.identities.filter(
        (x) =>
          x.section === section &&
          x.rootId === rootId &&
          x.definitionHash === unboundHash(definition)
      );
      if (matches.length !== 1) revisionError('unmappable-survivor');
      definition.identity = matches[0].identity;
    }
    return definition;
  });
}
function parseCanonical(observation) {
  const contract = observation.contract.value,
    defs = [];
  for (const [kind, section] of [
    ['acceptanceCriteria', 'ac'],
    ['verificationCommands', 'vc'],
    ['definitionOfDone', 'dod'],
  ])
    contract[kind].forEach((item, index) => {
      const binding = observation.criterionBindings.find(
        (x) => x.criterionIdentity === item.logicalId
      );
      if (section === 'ac' && (!binding || !binding.vcIds.length))
        revisionError('unresolved-canonical-declaration');
      const command = section === 'vc' ? item.command : null,
        declaration = command
          ? { kind: 'commands', commands: [command] }
          : binding?.vcIds.length
            ? { kind: 'vc-list', vcIds: clone(binding.vcIds) }
            : { kind: 'none' };
      const commands = command
        ? [command]
        : (binding?.vcIds ?? []).map((id) => {
            const vc = contract.verificationCommands.find((x) => x.logicalId === id);
            if (!vc) revisionError('missing-root-VC');
            return vc.command;
          });
      const record = observation.proofRecords.find((x) => x.criterionIdentity === item.logicalId);
      defs.push({
        identity: item.logicalId,
        section,
        rootId: section === 'vc' ? item.logicalId : null,
        occurrence: index + 1,
        text: command ?? item.text,
        declaration,
        declarationBytes: declarationBytes(declaration),
        commands,
        sourceBindings: clone(binding?.sourceBindings ?? observation.protectedSourceBindings),
        originalBytes: canonicalRecordJson(item),
        checked: contract.lifecycleProjection[kind][item.logicalId] === true,
        proof: record ? { identity: record.identity, bytes: record.bytes } : null,
      });
    });
  return defs;
}
// Data-only retained legacy parser. It uses the same grammar as live collection
// without fabricating a complete authority observation from partial history.
export function readLegacyProofDefinitions(input) {
  exactKeys(
    input,
    ['body', 'identities', 'protectedSourceBindings'],
    'legacy-proof-definition-input'
  );
  exactKeys(input.body, ['bytes', 'version'], 'legacy-proof-body');
  if (
    typeof input.body.bytes !== 'string' ||
    !Number.isSafeInteger(input.body.version) ||
    input.body.version < 0 ||
    parseBodyVersion(input.body.bytes) !== input.body.version
  )
    revisionError('legacy-proof-body');
  if (input.identities !== null) {
    if (!Array.isArray(input.identities)) revisionError('legacy-proof-identities');
    for (const item of input.identities) {
      exactKeys(item, ['identity', 'section', 'rootId', 'definitionHash'], 'legacy-proof-identity');
      if (
        typeof item.identity !== 'string' ||
        !item.identity ||
        !['ac', 'vc', 'dod'].includes(item.section) ||
        (item.rootId !== null && typeof item.rootId !== 'string') ||
        !/^sha256:[0-9a-f]{64}$/.test(item.definitionHash)
      )
        revisionError('legacy-proof-identity');
    }
  }
  const definitions = parseLegacy(input);
  resolveCommands(definitions);
  validateDefinitions(definitions);
  if (
    input.identities &&
    (input.identities.length !== definitions.length ||
      new Set(input.identities.map((d) => d.identity)).size !== input.identities.length)
  )
    revisionError('legacy-proof-identities');
  return definitions;
}
export function readRevisionDefinitions(observation) {
  validateRevisionObservation(observation);
  if (observation.sourceKind === 'legacy-body')
    return readLegacyProofDefinitions({
      body: observation.body,
      identities: observation.identities,
      protectedSourceBindings: observation.protectedSourceBindings,
    });
  const definitions = parseCanonical(observation);
  resolveCommands(definitions);
  validateDefinitions(definitions);
  return definitions;
}

function resolveCommands(definitions) {
  const roots = definitions.filter((x) => x.section === 'vc');
  for (const d of definitions) {
    if (d.declaration.kind === 'vc-list')
      d.commands = d.declaration.vcIds.map((id) => {
        const vc = roots.find((x) => x.rootId === id);
        if (!vc) revisionError('missing-root-VC-reference');
        return vc.text;
      });
  }
}
function replacementIdentity(transaction, kind, ordinal) {
  return `cr-${hashRevisionValue([transaction, kind, ordinal]).slice(7, 67)}`;
}
function buildAfter({ definitions, edits, observation, transactionId }) {
  const after = [],
    changed = new Set(),
    needed = new Set(),
    newRootIds = new Map();
  let ordinal = 0;
  const freshIdentity = (kind) => {
    const identity = replacementIdentity(transactionId, kind, ++ordinal);
    if (
      observation.retiredIdentities.includes(identity) ||
      definitions.some((x) => x.identity === identity) ||
      after.some((x) => x.identity === identity)
    )
      revisionError('retired-identity');
    return identity;
  };
  const selected = new Map(edits.acceptanceCriteria.map((x) => [x.occurrence, x]));
  for (const d of definitions) {
    const edit = d.section === 'ac' ? selected.get(d.occurrence) : null;
    if (!edit) {
      after.push(clone(d));
      continue;
    }
    if (d.originalBytes !== edit.oldBytes || hashBytes(edit.oldBytes) !== edit.oldHash)
      revisionError('stale-AC-occurrence');
    changed.add(d.identity);
    (d.declaration.vcIds ?? []).forEach((id) => needed.add(id));
    for (const r of edit.replacements) {
      r.declaration.vcIds.forEach((id) => needed.add(id));
      const identity = freshIdentity('ac');
      after.push({
        ...clone(d),
        identity,
        text: r.text,
        declaration: clone(r.declaration),
        declarationBytes: declarationBytes(r.declaration),
        commands: [],
        checked: false,
        proof: null,
        originalBytes: `- [ ] ${r.text} ${declarationBytes(r.declaration)}`,
      });
    }
  }
  if (
    [...selected.keys()].some(
      (n) => !definitions.some((d) => d.section === 'ac' && d.occurrence === n)
    )
  )
    revisionError('missing-AC-occurrence');
  for (const edit of edits.verificationCommands) {
    if (!needed.has(edit.id)) revisionError('unneeded-VC-change');
    const index = after.findIndex((d) => d.section === 'vc' && d.rootId === edit.id),
      old = after[index];
    if (edit.operation === 'add') {
      if (old) revisionError('duplicate-root-VC');
      const identity = freshIdentity('vc');
      const rootId = observation.sourceKind === 'canonical-contract' ? identity : edit.id;
      if (observation.sourceKind === 'canonical-contract') newRootIds.set(edit.id, identity);
      after.push({
        identity,
        section: 'vc',
        rootId,
        occurrence: after.filter((x) => x.section === 'vc').length + 1,
        text: edit.command,
        declaration: { kind: 'commands', commands: [edit.command] },
        declarationBytes: declarationBytes({ kind: 'commands', commands: [edit.command] }),
        commands: [edit.command],
        sourceBindings: clone(observation.protectedSourceBindings),
        originalBytes: `- [ ] \`${edit.command}\` <!-- id=${edit.id} -->`,
        checked: false,
        proof: null,
      });
      continue;
    }
    if (!old || old.text !== edit.oldCommand || hashBytes(edit.oldCommand) !== edit.oldHash)
      revisionError('stale-VC');
    changed.add(old.identity);
    if (edit.operation === 'delete') {
      after.splice(index, 1);
      continue;
    }
    after[index] = {
      ...old,
      identity:
        observation.sourceKind === 'canonical-contract' ? old.identity : freshIdentity('vc'),
      text: edit.command,
      declaration: { kind: 'commands', commands: [edit.command] },
      declarationBytes: declarationBytes({ kind: 'commands', commands: [edit.command] }),
      commands: [edit.command],
      originalBytes: `- [ ] \`${edit.command}\` <!-- id=${edit.id} -->`,
      checked: false,
      proof: null,
    };
  }
  // Keep contract order AC → roots → DoD; replacements are ordered by selected occurrence.
  after.sort(
    (a, b) => ['ac', 'vc', 'dod'].indexOf(a.section) - ['ac', 'vc', 'dod'].indexOf(b.section)
  );
  if (newRootIds.size)
    for (const d of after) {
      if (d.declaration.kind !== 'vc-list') continue;
      d.declaration.vcIds = d.declaration.vcIds.map((id) => newRootIds.get(id) ?? id);
      d.declarationBytes = declarationBytes(d.declaration);
    }
  resolveCommands(after);
  if (observation.sourceKind === 'canonical-contract')
    after.forEach((d) => {
      d.checked = false;
      d.proof = null;
    });
  return { after, changed };
}
function classifyMarkers(body) {
  const result = [];
  let ordinal = 0;
  for (const match of body.matchAll(comments)) {
    const bytes = match[0],
      inner = bytes.slice(4, -3).trim(),
      kind = markerKinds.find(([pattern]) => pattern.test(inner))?.[1];
    if (kind)
      result.push({
        kind,
        identity: `marker-${hashRevisionValue([++ordinal, bytes]).slice(7)}`,
        bytes,
        criterionIdentity: null,
        start: match.index,
        end: match.index + bytes.length,
      });
  }
  return result;
}
function eligibleLegacyProof(definition) {
  const proof =
    definition.section === 'ac'
      ? parseAcEvidence(definition.proof?.bytes)
      : parseProofMarker(definition.proof?.bytes);
  return (
    proof !== null &&
    proof.exit !== undefined &&
    String(proof.exit) === '0' &&
    typeof proof.sha === 'string' &&
    /^[0-9a-f]{7,64}$/i.test(proof.sha) &&
    typeof proof.ts === 'string' &&
    Number.isFinite(Date.parse(proof.ts))
  );
}
function manifest({
  definitions,
  after,
  changed,
  observation,
  transactionId,
  nativeIndividualProofs,
}) {
  const records = observation.revisionRecords.records;
  const history = deriveCriteriaAuthorityHistory(
    records.map((r) => parseRevisionEvent(r.bytes, { records }))
  );
  const appliedId = history.terminals.at(-1)?.authorityEventId;
  const applied = history.chain.events.find((event) => event.eventId === appliedId);
  const previous =
    nativeIndividualProofs === undefined
      ? (history.chain.effective?.proposal ?? null)
      : applied
        ? history.chain.events.find((event) => event.eventId === applied.predecessorEventId)
            .proposal
        : null;
  function preservedDependency(definition) {
    if (!previous) return observation.revision === 0;
    const prior = previous.after.definitions.find((d) => d.identity === definition.identity);
    return (
      prior &&
      prior.proof?.bytes === definition.proof?.bytes &&
      hashSemanticContract([prior]) === hashSemanticContract([definition]) &&
      previous.invalidation.some(
        (item) =>
          item.criterionIdentity === definition.identity &&
          item.disposition === 'preserved-individual' &&
          item.bytesHash === hashBytes(definition.proof.bytes)
      )
    );
  }
  const entries = [],
    changedCommands = new Set(
      definitions.filter((d) => d.section === 'vc' && changed.has(d.identity)).map((d) => d.text)
    );
  for (const d of definitions) {
    if (!d.proof && !d.checked) continue;
    const next = after.find((x) => x.identity === d.identity),
      kind =
        d.section === 'ac'
          ? 'ac-proof'
          : d.section === 'vc'
            ? 'vc-proof'
            : /^Agent Review Passed$/.test(d.text)
              ? 'agent-review'
              : /^Final Review Passed$/.test(d.text)
                ? 'final-review'
                : 'dod-proof';
    const preserve =
      observation.sourceKind === 'legacy-body' &&
      d.proof &&
      eligibleLegacyProof(d) &&
      (preservedDependency(d) ||
        nativeIndividualProofs?.some(
          (witness) =>
            witness.criterionIdentity === d.identity && witness.after.proof.bytes === d.proof.bytes
        )) &&
      next &&
      d.declaration.kind !== 'none' &&
      hashSemanticContract([d]) === hashSemanticContract([next]) &&
      !d.commands.some((c) => changedCommands.has(c)) &&
      !changed.has(d.identity);
    const bytes = d.proof?.bytes ?? d.originalBytes,
      identity = d.proof?.identity ?? `checkbox-${hashBytes(d.originalBytes).slice(7)}`;
    entries.push({
      kind: d.proof
        ? kind
        : ['agent-review', 'final-review'].includes(kind)
          ? kind
          : 'checkbox-assertion',
      identity,
      criterionIdentity: d.identity,
      bytesHash: hashBytes(bytes),
      disposition: preserve ? 'preserved-individual' : 'retired',
      dependencyHash: preserve ? hashSemanticContract([next]) : null,
      destinationRevision: transactionId,
    });
    if (!preserve && next) {
      next.checked = false;
      next.proof = null;
    }
  }
  for (const record of [...classifyMarkers(observation.body.bytes), ...observation.proofRecords]) {
    if (entries.some((x) => x.identity === record.identity)) continue;
    entries.push({
      kind: record.kind,
      identity: record.identity,
      criterionIdentity: record.criterionIdentity,
      bytesHash: hashBytes(record.bytes),
      disposition: ['historical', 'delivery'].includes(record.kind) ? 'historical' : 'retired',
      dependencyHash: null,
      destinationRevision: transactionId,
    });
  }
  return entries;
}
function stripProof(line) {
  return line
    .replace(comments, (marker) => {
      if (/^<!--\s*aitm-verified\s/.test(marker)) {
        const p = parseProofMarker(marker);
        return p?.['vc-list'] !== undefined
          ? serializeProofMarker({ 'vc-list': p['vc-list'] })
          : p?.cmd !== undefined
            ? serializeProofMarker({ cmd: p.cmd })
            : '';
      }
      if (/aitm-(?:ac|dod)-evidence/.test(marker)) return '';
      return marker;
    })
    .replace(/- \[x\]/, '- [ ]');
}
function projectLegacy(
  observation,
  definitions,
  after,
  edits,
  invalidation,
  digest,
  transactionId,
  preserveRevisionHistory = false
) {
  let body = observation.body.bytes;
  const sourceRows = legacyRows(body),
    patches = [],
    coveredMarkers = new Set(),
    retiredMarkers = classifyMarkers(body).filter((marker) =>
      invalidation.some((x) => x.identity === marker.identity && x.disposition === 'retired')
    );
  for (const d of definitions) {
    const source = sourceRows.filter((x) => x.section === d.section)[d.occurrence - 1];
    if (!source || source.line !== d.originalBytes) revisionError('stale-projection-occurrence');
    const mapping = after.filter(
      (x) => x.section === d.section && (x.identity === d.identity || x.occurrence === d.occurrence)
    );
    const edit =
      d.section === 'ac'
        ? edits.acceptanceCriteria.find((x) => x.occurrence === d.occurrence)
        : null;
    let next = d.originalBytes;
    // Compose contained marker removals before replacing this original criterion range.
    const rowMarkers = retiredMarkers.filter(
      (marker) => marker.start >= source.start && marker.end <= source.end
    );
    for (const marker of rowMarkers.reverse()) {
      next = next.slice(0, marker.start - source.start) + next.slice(marker.end - source.start);
      coveredMarkers.add(marker.identity);
    }
    if (edit)
      next = edit.replacements
        .map((r) => `- [ ] ${r.text} ${declarationBytes(r.declaration)}`)
        .join('\n');
    else if (d.section === 'vc') {
      const vc = edits.verificationCommands.find((x) => x.id === d.rootId);
      if (vc)
        next = vc.operation === 'delete' ? '' : `- [ ] \`${vc.command}\` <!-- id=${vc.id} -->`;
      else if (
        invalidation.some((x) => x.criterionIdentity === d.identity && x.disposition === 'retired')
      )
        next = stripProof(next);
    } else if (
      invalidation.some((x) => x.criterionIdentity === d.identity && x.disposition === 'retired')
    )
      next = stripProof(next);
    if (mapping.length === 0 && d.section === 'vc') next = '';
    if (next !== d.originalBytes)
      patches.push({ start: source.start, end: source.end, bytes: next });
  }
  const additions = edits.verificationCommands.filter((x) => x.operation === 'add');
  if (additions.length) {
    const last = sourceRows.filter((x) => x.section === 'vc').at(-1);
    if (!last) revisionError('missing-VC-insertion-root');
    patches.push({
      start: last.end,
      end: last.end,
      bytes: additions.map((edit) => `\n- [ ] \`${edit.command}\` <!-- id=${edit.id} -->`).join(''),
    });
  }
  // Keep original marker identities/ranges; changing earlier criteria must not renumber them.
  for (const marker of retiredMarkers) {
    if (coveredMarkers.has(marker.identity)) continue;
    if (sourceRows.some((row) => marker.start < row.end && marker.end > row.start))
      revisionError('ambiguous-marker-range');
    patches.push({ start: marker.start, end: marker.end, bytes: '' });
  }
  // Criterion, insertion and non-overlapping marker ranges all refer to the original body.
  for (const patch of patches.sort((a, b) => b.start - a.start))
    body = body.slice(0, patch.start) + patch.bytes + body.slice(patch.end);
  if (preserveRevisionHistory) return stampBodyVersion(body, observation.body.version + 1);
  const marker = `<!-- aitm-criteria-revision schema="${REVISION_SCHEMA}" revision="${observation.revision + 1}" transaction-id="${transactionId}" semantic-digest="${digest}" -->`;
  body = body.replace(/<!--\s*aitm-criteria-revision\s[\s\S]*?-->\n?/g, '');
  return stampBodyVersion(
    `${body.replace(/\s+$/, '')}\n\n${marker}\n`,
    observation.body.version + 1
  );
}
export function deriveResourceVector(observation) {
  const hashes = [
    {
      kind: 'body',
      identity: `${observation.repository}#${observation.issue}`,
      hash: hashBytes(observation.body.bytes),
    },
    ...observation.protectedSourceBindings.map((x) => ({
      kind: 'source-binding',
      identity: x.identity,
      hash: x.hash,
    })),
  ];
  if (observation.grant)
    hashes.push({
      kind: 'coordinator-grant',
      identity: observation.grant.identity,
      hash: hashBytes(observation.grant.bytes),
    });
  for (const record of observation.proofRecords)
    hashes.push({
      kind: 'proof-record',
      identity: record.identity,
      hash: hashRevisionValue(record),
    });
  for (const record of observation.delivery.records)
    hashes.push({
      kind: 'delivery-record',
      identity: record.identity,
      hash: hashBytes(record.bytes),
    });
  if (observation.capsule)
    hashes.push({
      kind: 'capsule',
      identity: observation.capsule.head,
      hash: hashBytes(observation.capsule.bytes),
    });
  if (observation.canonicalArchive) {
    const archive = observation.canonicalArchive;
    hashes.push({
      kind: 'criterion-bindings',
      identity: 'declarations',
      hash: hashRevisionValue(observation.criterionBindings),
    });
    hashes.push(
      ...archive.records.map((r) => ({
        kind: 'canonical-record',
        identity: r.recordId,
        hash: hashBytes(r.bytes),
      }))
    );
    hashes.push({
      kind: 'canonical-hierarchy',
      identity: 'hierarchy',
      hash: hashRevisionValue(archive.issueHierarchy),
    });
    hashes.push({
      kind: 'coordination-projection',
      identity: 'coordination',
      hash: hashBytes(archive.coordinationProjectionBytes),
    });
  }
  const seen = new Set();
  for (const entry of hashes) {
    const key = canonicalRecordJson([entry.kind, entry.identity]);
    if (seen.has(key)) revisionError('duplicate-resource-authority');
    seen.add(key);
  }
  hashes.sort((a, b) => {
    const left = canonicalRecordJson([a.kind, a.identity]),
      right = canonicalRecordJson([b.kind, b.identity]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return {
    revisionEventHead: observation.revisionRecords.records.at(-1)?.eventId ?? null,
    capsuleHead: observation.capsule?.head ?? null,
    contractHash: observation.contract ? hashBytes(observation.contract.bytes) : null,
    projectionHash: hashBytes(observation.body.bytes),
    terminalObservation: {
      stage: observation.stage,
      issueState: observation.issueState,
      deliveryState: observation.delivery.state,
    },
    authorityIdentities: hashes,
  };
}
export function deriveProposal(input) {
  return withRevisionValidation(() => deriveScopedProposal(input));
}
function deriveScopedProposal(input) {
  canonicalRecordJson(input);
  exactKeys(input, [
    'observation',
    'edits',
    'reason',
    'mode',
    'priorTransaction',
    'executor',
    'operationId',
    'transactionId',
    ...(Object.hasOwn(input, 'nativeIndividualProofs') ? ['nativeIndividualProofs'] : []),
  ]);
  const {
    observation,
    edits,
    reason,
    mode,
    priorTransaction,
    executor,
    operationId,
    transactionId,
  } = input;
  validateRevisionObservation(observation);
  validateEdits(edits);
  validateExecutor(executor);
  identifier(operationId);
  identifier(transactionId);
  text(reason);
  if (!REVISION_MODES.includes(mode)) revisionError('mode');
  if (canonicalRecordJson(executor) !== canonicalRecordJson(observation.executor))
    revisionError('foreign-executor');
  if (parseBodyVersion(observation.body.bytes) !== observation.body.version)
    revisionError('body-version');
  const records = observation.revisionRecords.records;
  if (mode === 'revision') {
    if (priorTransaction !== null) revisionError('prior');
    if (records.some((x) => x.transactionId === transactionId))
      revisionError('transaction-conflict');
  } else {
    exactKeys(priorTransaction, ['transactionId', 'eventId'], 'prior');
    if (
      priorTransaction.transactionId !== transactionId ||
      !records.some(
        (x) => x.eventId === priorTransaction.eventId && x.transactionId === transactionId
      )
    )
      revisionError('prior-reference');
  }
  // Recovery target authority comes only from the complete validated archived
  // chain. The engine must independently match this chain to fresh remote reads.
  if (mode === 'resume') {
    const chain = reduceRevisionEvents(
      records.map((r) => {
        const event = parseRevisionEvent(r.bytes, { records });
        if (
          !event ||
          event.eventId !== r.eventId ||
          event.transactionId !== r.transactionId ||
          event.operationId !== r.operationId ||
          event.proposalDigest !== r.proposalDigest
        )
          revisionError('recovery-record-binding');
        return event;
      })
    );
    if (
      chain.status !== 'pending' ||
      chain.head !== priorTransaction.eventId ||
      chain.root.transactionId !== transactionId ||
      chain.effective.proposal.mode === 'abort'
    )
      revisionError('resume-chain');
    if (edits.acceptanceCriteria.length || edits.verificationCommands.length)
      revisionError('resume-edits');
    const effective = chain.effective.proposal;
    const vector = deriveResourceVector(observation);
    const proposal = {
      ...clone(effective),
      operationId,
      reason,
      mode,
      priorTransaction: clone(priorTransaction),
      observedResourceVector: hashRevisionValue(vector),
      executor: clone(executor),
      writerDomain: clone(observation.writerDomain),
      edits: clone(edits),
      before: {
        ...clone(effective.before),
        stage: observation.stage,
        issueState: observation.issueState,
        bodyVersion: observation.body.version,
        bodyHash: hashBytes(observation.body.bytes),
        protectedSourceBindings: clone(observation.protectedSourceBindings),
      },
      authority: {
        ...clone(effective.authority),
        hashes: vector.authorityIdentities.map((x) => ({
          identity: `${x.kind}:${x.identity}`,
          hash: x.hash,
        })),
      },
      archive: {
        observation: clone(observation),
        definitions: clone(effective.archive.definitions),
        resourceVector: vector,
        ...(Object.hasOwn(effective.archive, 'nativeIndividualProofs')
          ? { nativeIndividualProofs: clone(effective.archive.nativeIndividualProofs) }
          : {}),
      },
    };
    delete proposal.proposalDigest;
    proposal.proposalDigest = hashRevisionValue(proposal);
    validateRevisionProposal(proposal);
    if (records.some((r) => r.operationId === operationId)) revisionError('operation-conflict');
    return freeze(proposal);
  }
  const nativeIndividualProofs = Object.hasOwn(input, 'nativeIndividualProofs')
    ? validateNativeIndividualProofs({
        witnesses: input.nativeIndividualProofs,
        observation,
        chain: reduceRevisionEvents(records.map((r) => parseRevisionEvent(r.bytes, { records }))),
      })
    : undefined;
  if (mode === 'abort' && nativeIndividualProofs?.length) revisionError('abort-native-proof');
  const definitions =
    observation.sourceKind === 'legacy-body'
      ? parseLegacy(observation)
      : parseCanonical(observation);
  validateDefinitions(definitions);
  if (observation.identities && observation.identities.length !== definitions.length)
    revisionError('unmappable-survivor');
  const { after, changed } =
    mode === 'abort'
      ? { after: clone(definitions), changed: new Set() }
      : buildAfter({
          definitions,
          edits,
          observation,
          transactionId:
            mode === 'forward-repair' ? `${transactionId}-${operationId}` : transactionId,
        });
  if (!edits.acceptanceCriteria.length && !edits.verificationCommands.length && mode !== 'abort')
    revisionError('empty-edits');
  const invalidation =
    mode === 'abort'
      ? []
      : manifest({
          definitions,
          after,
          changed,
          observation,
          transactionId,
          nativeIndividualProofs,
        });
  validateDefinitions(after);
  const semanticContractDigest = hashSemanticContract(after),
    vector = deriveResourceVector(observation);
  const identityMap = definitions.map((d) => ({
    section: d.section,
    beforeIdentity: d.identity,
    beforeHash: hashBytes(d.originalBytes),
    afterIdentities: after
      .filter(
        (x) =>
          x.identity === d.identity ||
          (d.section === 'ac' && x.section === 'ac' && x.occurrence === d.occurrence) ||
          (d.section === 'vc' && x.section === 'vc' && x.rootId === d.rootId)
      )
      .map((x) => x.identity),
  }));
  const writeSet = [];
  if (mode !== 'abort' && observation.sourceKind === 'legacy-body') {
    const afterBytes = projectLegacy(
      observation,
      definitions,
      after,
      edits,
      invalidation,
      semanticContractDigest,
      transactionId
    );
    writeSet.push({
      resource: 'issue-body',
      beforeHash: hashBytes(observation.body.bytes),
      afterHash: hashBytes(afterBytes),
      recordId: `${operationId}-body`,
      afterBytes,
    });
  } else if (mode !== 'abort') {
    const contract = deriveCanonicalAmendment(observation, after),
      afterBytes = canonicalRecordJson(contract),
      oldProjection = renderDeliveryContract({ contract: observation.contract.value }).markdown;
    if (observation.body.bytes.split(oldProjection).length !== 2)
      revisionError('ambiguous-contract-projection');
    let projectedBody = observation.body.bytes;
    const retiredMarkers = classifyMarkers(projectedBody).filter((marker) =>
      invalidation.some(
        (item) => item.identity === marker.identity && item.disposition === 'retired'
      )
    );
    for (const marker of retiredMarkers.sort((a, b) => b.start - a.start))
      projectedBody = projectedBody.slice(0, marker.start) + projectedBody.slice(marker.end);
    if (projectedBody.split(oldProjection).length !== 2)
      revisionError('ambiguous-contract-projection');
    const bodyBytes = stampBodyVersion(
      projectedBody.replace(oldProjection, () => renderDeliveryContract({ contract }).markdown),
      observation.body.version + 1
    );
    const proofBytes = canonicalRecordJson({
      proofRecords: [],
      criterionBindings: after
        .filter((d) => d.section !== 'vc')
        .map((d) => ({
          criterionIdentity: d.identity,
          vcIds: d.declaration.kind === 'vc-list' ? d.declaration.vcIds : [],
          sourceBindings: d.sourceBindings,
        })),
    });
    writeSet.push(
      canonicalCapsuleWrite(observation, contract, operationId),
      {
        resource: 'delivery-contract',
        beforeHash: hashBytes(observation.contract.bytes),
        afterHash: hashBytes(afterBytes),
        recordId: `${operationId}-contract`,
        afterBytes,
      },
      {
        resource: 'proof-projection',
        beforeHash: hashRevisionValue({
          proofRecords: observation.proofRecords,
          criterionBindings: observation.criterionBindings,
        }),
        afterHash: hashBytes(proofBytes),
        recordId: `${operationId}-proof`,
        afterBytes: proofBytes,
      },
      {
        resource: 'issue-body',
        beforeHash: hashBytes(observation.body.bytes),
        afterHash: hashBytes(bodyBytes),
        recordId: `${operationId}-body`,
        afterBytes: bodyBytes,
      }
    );
  }
  const recordBytes = canonicalRecordJson({
    schema: 'aitm.criteria-revision-record-plan/v1',
    transactionId,
    operationId,
    mode,
    beforeContractDigest: hashSemanticContract(definitions),
    afterContractDigest: semanticContractDigest,
  });
  writeSet.push({
    resource: 'revision-record',
    beforeHash: null,
    afterHash: hashBytes(recordBytes),
    recordId: `${operationId}-prepared`,
    afterBytes: recordBytes,
  });
  const proposal = {
    schema: REVISION_SCHEMA,
    repository: observation.repository,
    issue: observation.issue,
    transactionId,
    operationId,
    reason,
    mode,
    priorTransaction: clone(priorTransaction),
    observedResourceVector: mode === 'revision' ? null : hashRevisionValue(vector),
    executor: clone(executor),
    writerDomain: clone(observation.writerDomain),
    authority: {
      kind: observation.sourceKind,
      locator: `${observation.repository}#${observation.issue}${observation.contract ? `/contract/${observation.contract.value.recordId}` : ''}`,
      coordinator: clone(observation.grant?.coordinator ?? null),
      epoch: observation.grant?.epoch ?? null,
      hashes: vector.authorityIdentities.map((x) => ({
        identity: `${x.kind}:${x.identity}`,
        hash: x.hash,
      })),
    },
    before: {
      stage: observation.stage,
      issueState: observation.issueState,
      bodyVersion: observation.body.version,
      bodyHash: hashBytes(observation.body.bytes),
      contractEpoch: observation.contract?.value.contractEpoch ?? null,
      contractHash: vector.contractHash,
      capsuleHead: vector.capsuleHead,
      protectedSourceBindings: clone(observation.protectedSourceBindings),
    },
    edits: clone(edits),
    identityMap,
    invalidation,
    archive: {
      observation: clone(observation),
      definitions,
      resourceVector: vector,
      ...(nativeIndividualProofs === undefined
        ? {}
        : { nativeIndividualProofs: clone(nativeIndividualProofs) }),
    },
    writeSet,
    after: {
      semanticContractDigest,
      revisionId: mode === 'abort' ? observation.revisionId : transactionId,
      revision: mode === 'abort' ? observation.revision : observation.revision + 1,
      definitions: after,
    },
  };
  proposal.proposalDigest = hashRevisionValue(proposal);
  validateRevisionProposal(proposal);
  const conflict = records.find((x) => x.operationId === operationId);
  if (conflict && conflict.proposalDigest !== proposal.proposalDigest)
    revisionError('operation-conflict');
  return freeze(proposal);
}
export function renderApprovalStatement(proposal) {
  validateRevisionProposal(proposal);
  return `Approve criteria-revise ${proposal.mode} for ${proposal.repository}#${proposal.issue}, transaction ${proposal.transactionId}, proposal ${proposal.proposalDigest}, executor ${proposal.executor.sessionId}.`;
}

// Source corrections preserve criterion identity and transaction history while
// retiring every claim whose protected source dependency has changed.
export function deriveLegacySourceRetirement({ observation, definitions, sourceBindings }) {
  if (observation.sourceKind !== 'legacy-body') revisionError('source-correction-kind');
  const actual = readRevisionDefinitions({
    ...observation,
    identities: definitions.map((d) => ({
      identity: d.identity,
      section: d.section,
      rootId: d.rootId,
      definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
    })),
  });
  if (hashSemanticContract(actual) !== hashSemanticContract(definitions))
    revisionError('source-correction-definitions');
  const after = clone(actual).map((d) => ({ ...d, sourceBindings: clone(sourceBindings) }));
  const invalidation = manifest({
    definitions: actual,
    after,
    changed: new Set(actual.map((d) => d.identity)),
    observation,
    transactionId: observation.revisionId,
  });
  const body = projectLegacy(
    observation,
    actual,
    after,
    { acceptanceCriteria: [], verificationCommands: [] },
    invalidation,
    hashSemanticContract(after),
    observation.revisionId,
    true
  );
  return { body, definitions: after, invalidation };
}

// Data-only projection shared by live collection and sealed historical boundaries.
// It cannot alter any observed resource or confer readiness/write authority.
export function projectCollectedRevisionObservation(input) {
  return withRevisionValidation(() => projectCollectedObservation(input));
}
function projectCollectedObservation(input) {
  exactKeys(input, ['observation', 'chain', 'currentContract'], 'collector-projection-input');
  const { observation, chain, currentContract } = input;
  validateRevisionObservation(observation);
  const { chain: verified, terminals } = deriveCriteriaAuthorityHistory(chain.events);
  if (
    canonicalRecordJson(verified) !== canonicalRecordJson(chain) ||
    !['empty', 'applied', 'aborted'].includes(verified.status)
  )
    revisionError('collector-projection-chain');
  const authorityId = terminals.at(-1)?.authorityEventId ?? null;
  if (currentContract === null) {
    if (authorityId !== null) revisionError('collector-projection-contract');
  } else {
    exactKeys(
      currentContract,
      ['semanticContractDigest', 'revisionId', 'revision', 'definitions'],
      'collector-contract'
    );
    validateDefinitions(currentContract.definitions);
    const terminal = verified.events.find((event) => event.eventId === authorityId);
    if (
      !terminal ||
      hashSemanticContract(currentContract.definitions) !==
        currentContract.semanticContractDigest ||
      currentContract.revision !== terminal.outcome.revision ||
      currentContract.revisionId !== terminal.outcome.revisionId
    )
      revisionError('collector-projection-contract');
  }
  const result = clone(observation);
  result.revisionRecords = { complete: true, records: chain.events.map(revisionRecord) };
  result.identities =
    currentContract === null
      ? null
      : currentContract.definitions.map((definition) => {
          const d = { ...definition, sourceBindings: observation.protectedSourceBindings };
          return {
            identity: d.identity,
            section: d.section,
            rootId: d.rootId,
            definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]),
          };
        });
  result.revision = currentContract?.revision ?? 0;
  result.revisionId = currentContract?.revisionId ?? null;
  result.retiredIdentities = [
    ...new Set(
      selectEffectiveRevisionProposalEvents(chain.events).flatMap((e) =>
        e.proposal.identityMap
          .filter((m) => !m.afterIdentities.includes(m.beforeIdentity))
          .map((m) => m.beforeIdentity)
      )
    ),
  ];
  validateRevisionObservation(result);
  return result;
}
