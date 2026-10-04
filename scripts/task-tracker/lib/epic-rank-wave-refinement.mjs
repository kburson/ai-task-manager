// @story #1872
import { parseRefinementSnapshot } from './refinement-snapshot.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';
import { parseProofMarker, serializeProofMarker } from './proof-marker.mjs';
import { rankWaveDigest } from './epic-rank-wave-policy.mjs';

// Retain historical snapshot identity and semantic inputs across lifecycle ticks.
export function rankWaveRefinementIdentity(body, { labels } = {}) {
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
    return match[1]
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

export function reconcileRankWaveRefinement(children, records) {
  return children.map((child) => {
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
