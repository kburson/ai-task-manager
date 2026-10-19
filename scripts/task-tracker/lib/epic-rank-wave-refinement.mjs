// @story #1872 #2009
import { parseRefinementSnapshot } from './refinement-snapshot.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseProofMarker, serializeProofMarker } from './proof-marker.mjs';
import {
  freezeRankGraph,
  isStrictCompletedDone,
  rankWaveDigest,
} from './epic-rank-wave-policy.mjs';
import { parsePointer, refuse, stripReviewedPointer } from './reviewed-scope/model.mjs';

import { isEligibleNarrativeScopeTarget, liveLines } from './reviewed-scope/targets.mjs';

// Retain historical snapshot identity and semantic inputs across lifecycle ticks.
export function rankWaveRefinementIdentity(body, { labels } = {}) {
  return refinementIdentity(body, labels, false);
}

// Compare original reviewed pointers only against retained completed history.
export function rankWaveLegacyRefinementIdentity(body, { labels } = {}) {
  return refinementIdentity(body, labels, true);
}

function refinementIdentity(body, labels, retainReviewedPointers) {
  const snapshot = parseRefinementSnapshot(body),
    fields = parseIssueFieldDb(body);
  if (
    !snapshot ||
    !fields.ok ||
    !Array.isArray(labels) ||
    !labels.length ||
    Number(fields.values.rank) !== snapshot.fields.rank ||
    fields.values.priority !== snapshot.fields.priority
  )
    return null;
  const section = (name) => {
    const match = String(body).match(
      new RegExp(`^##\\s+${name}\\s*$([\\s\\S]*?)(?=^##\\s+|$(?![\\s\\S]))`, 'im')
    );
    if (!match) throw new Error('rank-wave: refinement section missing');
    let semanticText = match[1];
    if (name === 'Scope') {
      const normalizedLines = new Map();
      const comments = new Set(),
        lineages = new Set();
      for (const { lineIndex, raw } of liveLines(match[1])) {
        const pointer = parsePointer(raw);
        if (!pointer || !isEligibleNarrativeScopeTarget(raw)) continue;
        if (comments.has(pointer.commentId) || lineages.has(pointer.lineage))
          refuse('reviewed-scope-pointer-duplicate');
        comments.add(pointer.commentId);
        lineages.add(pointer.lineage);
        normalizedLines.set(lineIndex, stripReviewedPointer(raw));
      }
      if (!retainReviewedPointers)
        semanticText = match[1]
          .split('\n')
          .map((line, index) => normalizedLines.get(index) ?? line)
          .join('\n');
    }
    return semanticText
      .trim()
      .replace(/^- \[[x ]\]/gm, '- [ ]')
      .replace(/<!--\s*aitm-ac-evidence(?::[^\s]+)?\s[\s\S]*?-->/g, '')
      .replace(/<!--\s*aitm-verified\s[\s\S]*?-->/g, (marker) => {
        const props = parseProofMarker(marker);
        for (const key of [
          'exit',
          'sha',
          'ts',
          'key',
          'issue',
          'repository',
          'run-id',
          'head-sha',
          'verified-at',
          'evidence',
          'proof',
          'worktree',
          'branch',
          'bound-issue',
        ])
          delete props[key];
        return serializeProofMarker(props);
      })
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
  };
  return rankWaveDigest({
    schema: snapshot.schema,
    snapshotDigest: snapshot.digest,
    provenance: snapshot.provenance,
    fields: snapshot.fields,
    scope: section('Scope'),
    acceptanceCriteria: section('Acceptance Criteria'),
    labels: [...new Set(labels.map((l) => l.toLowerCase()).filter((l) => l !== 'blocked'))].sort(),
  });
}

function matchesCompleteMember(child, member, refinementDigest) {
  try {
    return (
      rankWaveDigest(freezeRankGraph([{ ...child, refinementDigest }])) ===
      rankWaveDigest(freezeRankGraph([member]))
    );
  } catch {
    return false;
  }
}

export function reconcileRankWaveRefinement(children, records) {
  return children.map((child) => {
    if (
      isStrictCompletedDone(child) &&
      matchesCompleteMember(child, child, child.refinementDigest) &&
      child.legacyRefinementDigest
    ) {
      const members = records.flatMap((record) =>
        Array.isArray(record.graph) ? record.graph : []
      );
      // A normalized retained identity always wins over an older legacy record.
      if (
        !members.some((member) => matchesCompleteMember(child, member, child.refinementDigest)) &&
        members.some((member) => matchesCompleteMember(child, member, child.legacyRefinementDigest))
      )
        return { ...child, refinementDigest: child.legacyRefinementDigest };
    }
    if (
      child.childEvidenceError !== 'stale refinement snapshot' ||
      !['plan', 'develop', 'test', 'review'].includes(child.boardState) ||
      !records.some((record) =>
        record.graph.some(
          (g) => g.number === child.number && g.refinementDigest === child.refinementDigest
        )
      )
    )
      return child;
    const { childEvidenceError: _historical, ...current } = child;
    return { ...current, hasCurrentRefinement: true };
  });
}
