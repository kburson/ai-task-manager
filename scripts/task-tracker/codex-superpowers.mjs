import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const SUPERPOWER_SKILLS = [
  'using-superpowers',
  'brainstorming',
  'systematic-debugging',
  'test-driven-development',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'dispatching-parallel-agents',
  'using-git-worktrees',
  'verification-before-completion',
  'finishing-a-development-branch',
  'requesting-code-review',
  'receiving-code-review',
];

const START_MARKER = '<!-- ai-task-manager:codex-superpowers:start -->';
const END_MARKER = '<!-- ai-task-manager:codex-superpowers:end -->';

function versionParts(version) {
  return version.split('.').map((part) => {
    const match = part.match(/^\d+/);
    return match ? Number(match[0]) : 0;
  });
}

function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i += 1) {
    const delta = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return a.localeCompare(b);
}

function sameTree(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  const aStat = statSync(a);
  const bStat = statSync(b);
  if (aStat.isDirectory() !== bStat.isDirectory()) return false;
  if (!aStat.isDirectory()) return readFileSync(a).equals(readFileSync(b));

  const aNames = readdirSync(a).sort();
  const bNames = readdirSync(b).sort();
  if (aNames.length !== bNames.length) return false;
  for (let i = 0; i < aNames.length; i += 1) {
    if (aNames[i] !== bNames[i]) return false;
    if (!sameTree(join(a, aNames[i]), join(b, bNames[i]))) return false;
  }
  return true;
}

export function findSuperpowersSkillRoot({ home = homedir() } = {}) {
  const base = join(home, '.claude', 'plugins', 'cache', 'claude-plugins-official', 'superpowers');
  if (!existsSync(base)) return null;
  const versions = readdirSync(base)
    .filter((name) => {
      const skillsRoot = join(base, name, 'skills');
      return existsSync(join(skillsRoot, 'using-superpowers', 'SKILL.md'));
    })
    .sort(compareVersions)
    .reverse();
  if (versions.length === 0) return null;
  return join(base, versions[0], 'skills');
}

export function availableSuperpowerSkills(sourceRoot, skills = SUPERPOWER_SKILLS) {
  const present = [];
  const missing = [];
  for (const skill of skills) {
    if (sourceRoot && existsSync(join(sourceRoot, skill, 'SKILL.md'))) present.push(skill);
    else missing.push(skill);
  }
  return { present, missing };
}

export function mirrorSuperpowerSkills({
  sourceRoot,
  destRoot = join(homedir(), '.codex', 'skills'),
  skills = SUPERPOWER_SKILLS,
} = {}) {
  const copied = [];
  const unchanged = [];
  const missing = [];
  mkdirSync(destRoot, { recursive: true });

  for (const skill of skills) {
    const src = join(sourceRoot ?? '', skill);
    const dest = join(destRoot, skill);
    if (!sourceRoot || !existsSync(join(src, 'SKILL.md'))) {
      missing.push(skill);
      continue;
    }
    if (sameTree(src, dest)) {
      unchanged.push(skill);
      continue;
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    copied.push(skill);
  }

  return { copied, unchanged, missing, destRoot };
}

export function codexBootstrapBlock({ scope = 'repo' } = {}) {
  const location = scope === 'global' ? '~/.codex/AGENTS.md' : 'this workspace AGENTS.md';
  return [
    START_MARKER,
    '## AI Task Manager: Codex Superpowers Bootstrap',
    '',
    `AITM added this ${location} block to approximate Claude Code Superpowers startup behavior in Codex.`,
    '',
    '- At the start of a new Codex conversation in this workspace, if the `using-superpowers` skill is available, load it before acting.',
    '- Before planning, debugging, testing, implementing, dispatching agents, using worktrees, finishing a branch, or handling review, check whether a matching Superpowers skill is available and follow it.',
    '- Treat Superpowers skills as optional mirrored Codex skills under `~/.codex/skills`; AITM does not install Superpowers as a package dependency.',
    '- Keep AI Task Manager task workflow instructions separate at `.agents/skills/task/SKILL.md`.',
    '',
    '**FORBIDDEN — breaks the issue workflow, must never be done:**',
    '',
    '- Never call `gh issue create` directly. Always use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>`. Direct calls skip project tether, `aitm-fields` injection, placeholder substitution, and assignee/priority gates — the resulting issue cannot be closed via the normal workflow.',
    END_MARKER,
    '',
  ].join('\n');
}

export function upsertManagedBlock(content, block) {
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);
  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + END_MARKER.length;
    const tail = content.slice(afterEnd).replace(/^\n+/, '\n');
    return content.slice(0, start).replace(/\s*$/, '\n\n') + block.trimEnd() + tail;
  }
  const prefix = content.trimEnd();
  return (prefix ? `${prefix}\n\n` : '') + block;
}

export function updateAgentsFile(file, block) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const next = upsertManagedBlock(current, block);
  mkdirSync(dirname(file), { recursive: true });
  if (next === current) return false;
  writeFileSync(file, next, 'utf8');
  return true;
}
