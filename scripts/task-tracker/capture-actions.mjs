#!/usr/bin/env node
// @story #1295

import { readFileSync } from 'node:fs';

import { emitSelfDoc, isDirectInvocation, wantsHelp } from '../lib/self-doc.mjs';
import {
  isActionCaptureEnabled,
  setActionCaptureEnabled,
  summarizeActionCorpus,
} from './lib/action-capture.mjs';
import { configPath, statePath } from './paths.mjs';

function targetIssue(args, state) {
  const issueAt = args.indexOf('--issue');
  const value = issueAt >= 0 ? args[issueAt + 1] : state.active;
  const match = String(value || '').match(/^#?(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function runCaptureActions(args, deps = {}) {
  const cwd = deps.cwd || process.cwd();
  const log = deps.log || ((line) => process.stdout.write(`${line}\n`));
  const error = deps.error || ((line) => process.stderr.write(`${line}\n`));
  if (wantsHelp(args)) {
    emitSelfDoc('capture-actions');
    return 0;
  }
  const [action] = args;
  if (!['on', 'off', 'status', 'summary'].includes(action)) {
    error('Usage: npx aitm capture-actions <on|off|status|summary> [--issue N] [--json]');
    return 2;
  }
  try {
    const config = JSON.parse(readFileSync(configPath(cwd), 'utf8'));
    const state = JSON.parse(readFileSync(statePath(cwd), 'utf8'));
    const issue = targetIssue(args, state);
    if (!config.repo || !issue) {
      error('capture-actions: a configured repository and active or explicit issue are required');
      return 2;
    }
    const context = { projectDir: cwd, repository: config.repo, issue };
    if (action === 'on' || action === 'off') {
      const enabled = action === 'on';
      setActionCaptureEnabled({ ...context, enabled });
      log(
        enabled
          ? `Action capture enabled for ${config.repo}#${issue}.`
          : `Action capture disabled for ${config.repo}#${issue}; the existing corpus is preserved.`
      );
      return 0;
    }
    if (action === 'status') {
      const enabled = isActionCaptureEnabled(context);
      const result = { repository: config.repo, issue, enabled };
      log(
        args.includes('--json')
          ? JSON.stringify(result)
          : `Action capture ${enabled ? 'enabled' : 'disabled'} for ${config.repo}#${issue}.`
      );
      return 0;
    }
    const summary = summarizeActionCorpus(context);
    log(
      args.includes('--json')
        ? JSON.stringify(summary)
        : [
            `Action capture summary for ${config.repo}#${issue}:`,
            `  actions: ${summary.actions} (${summary.complete} complete, ${summary.incomplete} incomplete)`,
            `  serialized bytes: ${summary.serializedBytes}`,
            `  payload bytes: ${summary.payloadBytes}`,
            `  by kind: ${JSON.stringify(summary.byKind)}`,
          ].join('\n')
    );
    return 0;
  } catch (caught) {
    error(`capture-actions: ${caught.message}`);
    return 1;
  }
}

if (isDirectInvocation(import.meta.url)) {
  process.exitCode = runCaptureActions(process.argv.slice(2));
}
