#!/usr/bin/env node
// @story #309
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..', '../../..');
const body = readFileSync(path.join(root, 'templates', 'definition-of-done.md'), 'utf8');
const pickupDirective = readFileSync(path.join(root, 'templates', 'pickup-directive.md'), 'utf8');
const runtimePickupDirectivePath = path.join(root, '.ai-task-manager', 'pickup-directive.md');
const runtimePickupDirective = existsSync(runtimePickupDirectivePath)
  ? readFileSync(runtimePickupDirectivePath, 'utf8')
  : null;
const codexAdapter = readFileSync(
  path.join(root, 'skill', 'adapters', 'codex', 'SKILL.md'),
  'utf8'
);
const claudeAdapter = readFileSync(
  path.join(root, 'skill', 'adapters', 'claude', 'SKILL.md'),
  'utf8'
);
const taskIssueForm = readFileSync(
  path.join(root, '.github', 'ISSUE_TEMPLATE', 'task.yml'),
  'utf8'
);
const bugIssueForm = readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'bug.yml'), 'utf8');
const preflightBlock = execFileSync(
  'node',
  [path.join(root, 'scripts', 'task-tracker', 'preflight-issue.mjs')],
  { cwd: root, encoding: 'utf8' }
);

// DoD template uses Functional/Lifecycle split (#139). Verification commands
// now live in the consolidated `aitm-verified cmd="..."` declarations on each
// Functional item (#419) rather than as standalone DoD lines.
for (const fragment of [
  '#### Functional (verified at Test)',
  'aitm-verified cmd="`npm run test:all`"',
  'aitm-verified cmd="`npm run lint` `npm run format:check`"',
  '- [ ] Acceptance criteria met',
  '- [ ] Issue body checkboxes ticked',
  '#### Lifecycle (auto-ticked at Review/Close)',
  '- [ ] Passed final human review',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
]) {
  assert.ok(body.includes(fragment), `template includes ${fragment}`);
}

assert.ok(
  !body.includes('Tests pass; new coverage committed'),
  'standard DoD uses the concrete npm test command instead of prose'
);
assert.ok(
  !body.includes('Pre-commit hooks pass'),
  'standard DoD uses concrete lint/format commands instead of prose'
);

// ── pickup directive: status contract ──────────────────────────────────────
for (const status of ['CODE_COMPLETE', 'ISSUE_READY_FOR_REVIEW', 'BLOCKED']) {
  assert.ok(pickupDirective.includes(status), `pickup directive defines status: ${status}`);
}
assert.ok(
  pickupDirective.includes('Do not use `DONE`') || pickupDirective.includes('Do not report `DONE`'),
  'pickup directive forbids DONE status'
);
assert.ok(
  pickupDirective.includes('ISSUE_READY_FOR_REVIEW') && pickupDirective.includes('/task review'),
  'pickup directive links ISSUE_READY_FOR_REVIEW to /task review'
);
assert.ok(
  pickupDirective.includes('CODE_COMPLETE') && pickupDirective.includes('unchecked'),
  'pickup directive links CODE_COMPLETE to unchecked items'
);
assert.ok(
  pickupDirective.includes('DONE_WITH_CONCERNS'),
  'pickup directive explicitly addresses DONE_WITH_CONCERNS (to forbid it)'
);
assert.ok(
  (pickupDirective.includes('ready for human review') &&
    (pickupDirective.includes('not permission to close') ||
      pickupDirective.includes('NOT permission to close') ||
      pickupDirective.includes('NOT an automated step'))) ||
    pickupDirective.includes('All checkboxes checked means'),
  'pickup directive contains core warning: checkboxes checked ≠ permission to close'
);
assert.ok(
  pickupDirective.includes('Agents MUST NOT run') ||
    pickupDirective.includes('terminal agent action is `/task review`'),
  'pickup directive contains Hard Rule 5: agents must not run /task close'
);
assert.doesNotMatch(
  pickupDirective,
  /docs\/agent-context\/file-index\.yaml/,
  'pickup directive must not reference the removed/nonexistent file-index.yaml'
);

const referencedRepoPaths = [
  ...pickupDirective.matchAll(
    /`((?:\.\/)?(?:docs|templates|scripts|skill|\.ai-task-manager)\/[^`\s]+)`/g
  ),
]
  .map((match) => match[1].replace(/^\.\//, ''))
  .filter((repoPath) => !repoPath.startsWith('.ai-task-manager/'));
for (const repoPath of referencedRepoPaths) {
  assert.ok(
    existsSync(path.join(root, repoPath)),
    `pickup directive references missing repo path: ${repoPath}`
  );
}

assert.ok(
  !body.includes('Issue moved to Done'),
  'template does not include close-action Done checkbox'
);
assert.ok(
  !body.includes('/task close` run'),
  'template does not include close-action task close checkbox'
);
assert.ok(
  !body.includes('close parent if all siblings Done'),
  'template does not include automatic parent close checkbox'
);

for (const form of [taskIssueForm, bugIssueForm]) {
  assert.ok(
    form.includes('id: acceptance-criteria'),
    'manual issue form includes acceptance criteria'
  );
  assert.ok(
    form.includes('label: Estimate'),
    'manual issue form exposes Estimate section for DB healing'
  );
  assert.ok(
    form.includes('label: Sequence'),
    'manual issue form exposes Sequence section for DB healing'
  );
  assert.ok(
    !form.includes('Engaged Time'),
    'manual issue form does not ask for task-event managed Engaged Time'
  );
  assert.ok(
    !form.includes('Session Time'),
    'manual issue form does not ask for task-event managed Session Time'
  );
  assert.ok(
    !form.includes('Context Length'),
    'manual issue form does not ask for task-event managed Context Length'
  );
  assert.ok(
    !form.includes('ai-task-manager:fields:start'),
    'manual issue form leaves hidden field DB to AITM healer'
  );
}

const dodIdx = preflightBlock.indexOf('### Definition of Done');
const pickupIdx = preflightBlock.indexOf('## Pickup Directive');
assert.ok(dodIdx !== -1, 'preflight block includes Definition of Done');
assert.ok(pickupIdx !== -1, 'preflight block includes Pickup Directive after DoD');
assert.ok(dodIdx < pickupIdx, 'Definition of Done appears before Pickup Directive');
assert.ok(
  !preflightBlock.includes('- [ ] Deep dive complete'),
  'preflight block must NOT include the visible Deep dive checkbox — completion is recorded via the <!-- aitm-deep-dive-complete: <ts> --> marker'
);

// ---------------------------------------------------------------------------
// Bash-fence lint: no > redirect or inline # comments in pickup-directive or
// skill/shared/SKILL.md bash fences.
// ---------------------------------------------------------------------------

function bashFenceContents(text) {
  const fences = [];
  const lines = text.split('\n');
  let inBash = false;
  let current = [];
  for (const line of lines) {
    if (line.trim() === '```bash') {
      inBash = true;
      current = [];
    } else if (line.trim() === '```' && inBash) {
      inBash = false;
      fences.push(current.join('\n'));
    } else if (inBash) {
      current.push(line);
    }
  }
  return fences;
}

const pdFences = bashFenceContents(pickupDirective);
for (const fence of pdFences) {
  assert.ok(
    !/> \.\//.test(fence) && !/>> \.\//.test(fence),
    `pickup-directive bash fence must not contain '> ./' or '>> ./' redirect:\n${fence}`
  );
  const lines = fence.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    assert.ok(
      !trimmed.startsWith('# '),
      `pickup-directive bash fence must not contain inline '# ...' comment:\n${line}`
    );
  }
}

const sharedSkill = readFileSync(path.join(root, 'skill', 'shared', 'SKILL.md'), 'utf8');
const auditedBashFenceFiles = [
  ['skill/shared/SKILL.md', sharedSkill],
  ['skill/adapters/codex/SKILL.md', codexAdapter],
  ['skill/adapters/claude/SKILL.md', claudeAdapter],
];
for (const [file, text] of auditedBashFenceFiles) {
  const fences = bashFenceContents(text);
  for (const fence of fences) {
    assert.ok(
      !/> \.\//.test(fence) && !/>> \.\//.test(fence),
      `${file} bash fence must not contain '> ./' or '>> ./' redirect:\n${fence}`
    );
    const lines = fence.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      assert.ok(
        !trimmed.startsWith('# '),
        `${file} bash fence must not contain inline '# ...' comment:\n${line}`
      );
    }
  }
}

const auditedAgentFiles = [
  ['templates/pickup-directive.md', pickupDirective],
  ['skill/shared/SKILL.md', sharedSkill],
  ['skill/adapters/codex/SKILL.md', codexAdapter],
  ['skill/adapters/claude/SKILL.md', claudeAdapter],
];
if (runtimePickupDirective !== null) {
  auditedAgentFiles.push(['.ai-task-manager/pickup-directive.md', runtimePickupDirective]);
}

if (runtimePickupDirective !== null) {
  assert.equal(
    runtimePickupDirective,
    pickupDirective,
    '.ai-task-manager/pickup-directive.md must stay byte-identical with templates/pickup-directive.md'
  );
}

for (const [file, text] of auditedAgentFiles) {
  assert.ok(
    !text.includes('git rev-parse --show-toplevel'),
    `${file} must not contain $(git rev-parse --show-toplevel) — use plain node node_modules/... invocations instead`
  );
}

const pickupDirectiveFiles = [['templates/pickup-directive.md', pickupDirective]];
if (runtimePickupDirective !== null) {
  pickupDirectiveFiles.push(['.ai-task-manager/pickup-directive.md', runtimePickupDirective]);
}

for (const [file, text] of pickupDirectiveFiles) {
  assert.ok(
    text.includes(
      'node node_modules/ai-task-manager/scripts/gh/move-state.mjs <this-issue-#> in-progress'
    ),
    `${file} must invoke move-state.mjs through node`
  );
  assert.ok(
    !text.includes(
      '\n   node_modules/ai-task-manager/scripts/gh/move-state.mjs <this-issue-#> in-progress'
    ),
    `${file} must not invoke move-state.mjs directly`
  );
}

for (const [file, text] of pickupDirectiveFiles) {
  assert.ok(
    !text.includes('Edit or Write tool'),
    `${file} must use agent-neutral file-editing wording, not Claude-specific "Edit or Write tool"`
  );
}

for (const [file, text] of [
  ['skill/adapters/codex/SKILL.md', codexAdapter],
  ['skill/adapters/claude/SKILL.md', claudeAdapter],
]) {
  assert.ok(
    text.includes(
      'node node_modules/ai-task-manager/scripts/task-tracker/task-tracker.mjs <verb> [args...]'
    ),
    `${file} must document the portable task-tracker command`
  );
}

assert.ok(
  claudeAdapter.includes(
    'node node_modules/ai-task-manager/scripts/gh/move-state.mjs <N> in-progress'
  ),
  'skill/adapters/claude/SKILL.md must invoke move-state.mjs through node'
);

// ── references/ byte-identity (#204) ───────────────────────────────────────
// Every checked-in templates/references/*.md must (a) exist and (b) — if the
// runtime mirror under .ai-task-manager/references/ is present — be
// byte-identical to it. installTemplates() copies references at install time;
// drift means a downstream consumer would see stale rationale text relative
// to the directive that links to it.
{
  const refsSrcRoot = path.join(root, 'templates', 'references');
  const refsRuntimeRoot = path.join(root, '.ai-task-manager', 'references');
  if (existsSync(refsSrcRoot)) {
    const walk = (dir, rel) => {
      const out = [];
      for (const entry of readdirSync(dir)) {
        const p = path.join(dir, entry);
        const r = rel ? `${rel}/${entry}` : entry;
        const st = statSync(p);
        if (st.isDirectory()) out.push(...walk(p, r));
        else if (st.isFile()) out.push(r);
      }
      return out;
    };
    for (const rel of walk(refsSrcRoot, '')) {
      const src = readFileSync(path.join(refsSrcRoot, rel), 'utf8');
      assert.ok(
        src.startsWith('<!-- aitm-skill-version:'),
        `templates/references/${rel} must start with the aitm-skill-version stamp`
      );
      const runtimePath = path.join(refsRuntimeRoot, rel);
      if (existsSync(runtimePath)) {
        const runtime = readFileSync(runtimePath, 'utf8');
        assert.equal(
          runtime,
          src,
          `.ai-task-manager/references/${rel} must stay byte-identical with templates/references/${rel}`
        );
      }
    }
  }
}

console.log('templates.test.mjs: all passed');
