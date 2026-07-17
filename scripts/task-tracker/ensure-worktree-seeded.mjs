#!/usr/bin/env node
// INTERNAL — SessionStart seed check for git worktrees (#869).
//
// A fresh `git worktree add` creates no node_modules. This runs at SessionStart
// (via the candidate-list shim so it resolves in a node_modules-less worktree),
// classifies the seed state, and heals the healable ones by delegating to
// ensureSelfLink (#791). Loud, NEVER fatal: a throwing SessionStart hook would
// take the session with it, so every path ends exit 0; failures surface via
// stderr and SessionStart additionalContext.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectSeed } from './lib/worktree-seed.mjs';
import { ensureSelfLink } from './lib/ensure-self-link.mjs';

function remedyFor(status, cwd) {
  if (status === 'deps-missing') return `Run \`npm ci\` in ${cwd} to install ai-task-manager.`;
  if (status === 'foreign-link' || status === 'missing-link')
    return `Seed heal did not converge; run \`npm run link:self\` in ${cwd}.`;
  return `Worktree seed state: ${status}.`;
}

export async function runSeedCheck({
  cwd = process.cwd(),
  stdin = null,
  stdout = (s) => process.stdout.write(s),
  stderr = (s) => process.stderr.write(s),
  heal = true,
} = {}) {
  let payload = {};
  try {
    payload = JSON.parse(stdin ?? readFileSync(0, 'utf8') ?? '{}');
  } catch {
    payload = {};
  }
  const event = payload.hook_event_name || payload.hookEventName || 'SessionStart';

  let state = inspectSeed({ projectRoot: cwd });

  if (heal && (state.status === 'missing-link' || state.status === 'foreign-link')) {
    try {
      ensureSelfLink({ pkgRoot: cwd });
    } catch (err) {
      stderr(`[aitm seed] heal threw: ${err.message}\n`);
    }
    state = inspectSeed({ projectRoot: cwd }); // re-inspect to confirm convergence
  }

  if (state.status === 'seeded' || state.status === 'not-applicable') {
    return 0; // silent: nothing to say
  }

  const additionalContext = `aitm worktree seed check: status=${state.status} (${state.detail}). ${remedyFor(state.status, cwd)}`;
  stderr(additionalContext + '\n');
  stdout(
    JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext } }) + '\n'
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const heal = !process.argv.includes('--check');
  runSeedCheck({ heal })
    .then((code) => process.exit(code))
    .catch(() => process.exit(0)); // never fatal
}
