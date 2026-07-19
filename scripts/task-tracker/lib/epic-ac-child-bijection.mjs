// @story #889
// AC↔child bijection report (#889, parent epic #883).
//
// An epic's decomposition claims two things at once: every promise it made has a
// child to deliver it, and every child it carries exists to deliver a promise.
// The `**Cn · #NNN**` convention records that claim on the AC line —
//
//   - [x] **C1 · #872** — Canonical `discoverTestFiles()` module: one recursive walker…
//
// — but nothing has ever verified it, so two drift modes are invisible:
//
//   * a defect child spawned mid-flight joins the epic mapped to no AC — work
//     nobody promised and nobody accepts;
//   * an AC added or reworded after decomposition has no child to deliver it — a
//     promise with no vehicle.
//
// Both directions are reported in ONE pass. They share a cause (a single
// decomposition edit that adds a child and rewords an AC), so failing fast on
// the first would make the operator run the same investigation twice.
//
// The report is ADVISORY. It names offenders; it refuses nothing. Of the epics
// on this board only #860 declares a mapping at all — #883, #859 and #820 carry
// none — so a gate here would refuse nearly every epic for a convention it never
// adopted, and a gate that fires on everything gets waived on everything.
// Sibling #888 is the gate; this is the thing that tells you what to look at.

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;

// The bold lead ONLY — `**C1 · #872**` or the `Cn`-less `**#872**`. Never a bare
// `#N` from AC prose: #860's own C2 text reads "(**supersedes #862**)", and a
// prose scan would bind that AC to an unrelated issue and then report clean.
// Reporting clean on a rotted mapping is the one failure mode that makes this
// check worthless, so the parse is deliberately narrow — a missed exotic form
// shows up as "unmapped", which is loud and correctable.
const AC_CHILD_RE = /\*\*\s*(?:C\d+\s*[·:-]\s*)?#(\d+)\s*\*\*/g;

export function parseAcChildRefs(text) {
  const src = String(text || '');
  const out = [];
  AC_CHILD_RE.lastIndex = 0;
  let m;
  while ((m = AC_CHILD_RE.exec(src)) !== null) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// Every AC checkbox with the child numbers its bold lead cites, in body order.
// Section location mirrors `ac-strike.mjs` and `epic-ac-commit-citation.mjs`
// deliberately — same heading grammar, same `###`-terminates-the-section trap —
// so all three agree on what "the AC section" means.
export function parseAcChildMap(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const out = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    out.push({
      lineIndex: i,
      checked: box[2] === 'x',
      children: parseAcChildRefs(box[4]),
      label: String(box[4])
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return out;
}

// Both drift directions plus the distinction that keeps the report actionable.
//
// `declared` separates an epic that wrote a mapping and let it rot from one that
// never wrote one. Without it, #883 reports "6 unmapped ACs, 6 unmapped
// children" — literally true, and indistinguishable from total collapse.
export function bijectionReport({ body, children = [] } = {}) {
  const acs = parseAcChildMap(body);
  const declared = acs.some((ac) => ac.children.length > 0);

  const cited = new Set();
  for (const ac of acs) for (const n of ac.children) cited.add(n);

  const unmappedAcs = acs.filter((ac) => ac.children.length === 0);
  const unmappedChildren = (children || []).filter((c) => c && !cited.has(Number(c.number)));

  return {
    declared,
    acs,
    unmappedAcs,
    unmappedChildren,
    ok: unmappedAcs.length === 0 && unmappedChildren.length === 0,
  };
}

// Operator-facing rendering. Returns null when the mapping is total — a clean
// report printing nothing is what makes the noisy one worth reading.
export function formatBijectionReport(report, { issueNumber } = {}) {
  if (!report || report.ok) return null;
  const head = `AC↔child bijection — epic #${issueNumber ?? '?'}`;
  const lines = [];

  if (!report.declared) {
    lines.push(
      `${head}: no \`**Cn · #NNN**\` mapping declared on any AC. ` +
        `${report.acs.length} AC(s) and ${report.unmappedChildren.length} child(ren) are ` +
        `related only by convention, so neither drift direction can be detected here. ` +
        `Declaring the mapping is optional — knowing it is absent is not.`
    );
    return lines.join('\n');
  }

  lines.push(`${head}: the declared mapping is not total.`);
  if (report.unmappedAcs.length) {
    lines.push(`  ACs with no child (promise, no vehicle):`);
    for (const ac of report.unmappedAcs) lines.push(`    - "${ac.label}"`);
  }
  if (report.unmappedChildren.length) {
    lines.push(`  Children with no AC (work nobody promised):`);
    for (const c of report.unmappedChildren) lines.push(`    - #${c.number}`);
  }
  lines.push(
    `  Advisory only — nothing is blocked. Either cite the child in the AC's bold ` +
      `lead (\`**Cn · #NNN**\`), or decide the AC or the child does not belong.`
  );
  return lines.join('\n');
}
