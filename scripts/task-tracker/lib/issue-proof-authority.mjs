// @story #2096
// cspell:ignore optout
import { createHash } from 'node:crypto';
import { parseProofMarker } from './proof-marker.mjs';
import { removeFullAutoFootnote, removeLegacyFullAutoFootnote } from './markers.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';
// Ephemeral comparison of existing R0 proof authority, never a persistent store.
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import {
  parseVerificationReceipt,
  parseVerificationReceipts,
  hasMalformedVerificationReceiptClaim,
} from './verification-receipt.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { parseEntryMarkers } from './stage-entry-grammar.mjs';
import { parseTestStartedMarker, parseDodVerifiedMarker } from './markers.mjs';
const SECTIONS = [
  'User Story',
  'Scope',
  'Story Origin',
  'Acceptance Criteria',
  'Verification Commands',
  'Definition of Done',
];

function protectedSections(body) {
  const lines = stripBodyVersion(body).split(/\r?\n/);
  const sections = Object.fromEntries(
    SECTIONS.map((heading) => {
      const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
      let end = start + 1;
      while (start >= 0 && end < lines.length && !/^##\s+/.test(lines[end])) end++;
      return [
        heading,
        start < 0
          ? ''
          : lines
              .slice(start + 1, end)
              .map((line) => line.trimEnd())
              .join('\n')
              .trim(),
      ];
    })
  );
  return sections;
}

export function captureIssueProofAuthority(body) {
  const sections = protectedSections(body);
  const state = readLastKnownState(body).state ?? null;
  return canonicalRecordJson({
    sections,
    state,
    visit:
      parseEntryMarkers(body)
        .filter((entry) => entry.state === state)
        .at(-1) ?? null,
    receipts: parseVerificationReceipts(body),
    malformedReceipt: hasMalformedVerificationReceiptClaim(body),
    testStarted: parseTestStartedMarker(body),
    dodVerified: parseDodVerifiedMarker(body),
  });
}

export function assertIssueProofAuthority(body, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(captureIssueProofAuthority(body)))
    throw new Error(
      'artifact: issue proof authority changed before write; refresh and verify again'
    );
}

export function reviewDeclarationDigest(body) {
  const sections = protectedSections(removeLegacyFullAutoFootnote(removeFullAutoFootnote(body)));
  for (const key of Object.keys(sections)) {
    sections[key] = sections[key]
      .replace(/<!--[\s\S]*?-->/g, (marker) => {
        const properties = parseProofMarker(marker);
        if (properties) {
          const declaration = Object.fromEntries(
            ['cmd', 'vc-list', 'key']
              .filter((name) => properties[name] !== undefined)
              .map((name) => [name, properties[name]])
          );
          return Object.keys(declaration).length ? canonicalRecordJson(declaration) : '';
        }
        return /^<!--\s*(?:dod:functional:|dod:kinds\b|aitm-non-demonstrable\b|aitm-lifecycle-optout:|aitm-verified-by\b)/.test(
          marker
        )
          ? marker.trim()
          : '';
      })
      .replace(/^(\s*- )\[[ xX]\]/gm, '$1[ ]')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return (
    'sha256:' +
    createHash('sha256')
      .update(
        canonicalRecordJson({ sections, testReceipt: parseVerificationReceipt(body, 'test') })
      )
      .digest('hex')
  );
}

export function assertReviewedDeclarations(body) {
  const line = String(body || '')
    .split('\n')
    .find((line) => /^- \[x\] Agent Review Passed\b/.test(line));
  const proof = line ? parseProofMarker(line) : null;
  if (
    proof?.gate !== 'agent-review' ||
    proof?.result !== 'pass' ||
    proof?.declarations !== reviewDeclarationDigest(body)
  )
    throw new Error(
      'artifact: accepted Review declarations changed or are missing; run native Review again'
    );
}
