// @story #1496
import { readFileSync, realpathSync } from 'node:fs';
import {
  containedBy,
  rehearsalRefusal,
} from '../../../task-tracker/lib/evidence-v2/execution-context.mjs';
import { createHash } from 'node:crypto';

export function providerCommand({ provider, context, args, options }) {
  const values = new Map();
  const allowed = new Set([
    '--repo',
    '-R',
    '--json',
    '--jq',
    '-q',
    '--body',
    '-b',
    '--body-file',
    '-F',
  ]);
  for (let i = args[0] === 'issue' ? 3 : 2; i < args.length; i++) {
    const equal = args[i].indexOf('=');
    const key = equal < 0 ? args[i] : args[i].slice(0, equal);
    if (!allowed.has(key) || values.has(key)) throw rehearsalRefusal('unsupported-provider-option');
    const value = equal < 0 ? args[++i] : args[i].slice(equal + 1);
    if (value === undefined) throw rehearsalRefusal('missing-provider-option');
    values.set(key, value);
  }
  const flag = (...names) =>
    names.map((name) => values.get(name)).find((value) => value !== undefined) ?? null;
  if (
    ['--repo', '-R'].some((name) => values.has(name) && values.get(name) !== context.repositoryId)
  )
    throw rehearsalRefusal('production-target');
  const repo = flag('--repo', '-R');
  if (repo !== null && repo !== context.repositoryId) throw rehearsalRefusal('production-target');
  const render = (value) => {
    const jq = flag('--jq', '-q');
    if (!jq) return JSON.stringify(value);
    if (!/^\.[A-Za-z]+$/.test(jq)) throw rehearsalRefusal('unsupported-projection');
    const selected = value[jq.slice(1)];
    if (selected === undefined) throw rehearsalRefusal('unknown-projection');
    return typeof selected === 'string' ? selected : JSON.stringify(selected);
  };
  if (args[0] === 'api' && args[1] === 'user') return render({ login: 'rehearsal-author' });
  if (args[0] === 'auth' && args[1] === 'status')
    return 'Synthetic offline provider; no credentials.';
  if (args[0] === 'issue') {
    const number = Number(String(args[2]).replace(/^#/, ''));
    const issue = provider.issue(number);
    if (args[1] === 'view')
      return render({
        ...issue,
        comments: provider.comments(number),
        projectItems: provider.boardSnapshot(number).repository.issue.projectItems.nodes,
      });
    if (args[1] === 'edit' || args[1] === 'comment') {
      let body = flag('--body', '-b');
      const file = flag('--body-file', '-F');
      if (file === '-') body = options.input;
      else if (file) {
        if (!containedBy(context.root, realpathSync(file)))
          throw rehearsalRefusal('production-path');
        body = readFileSync(file, 'utf8');
      }
      if (typeof body !== 'string') throw rehearsalRefusal('unsupported-issue-edit');
      const kind = args[1] === 'edit' ? 'body' : 'comment';
      const hash = createHash('sha256').update(body).digest('hex');
      return render(
        provider.apply({
          kind,
          issueNumber: number,
          operationId: `${options.operationId || 'transport'}:${kind}:${hash}`,
          payload: { body },
          fault: options.fault,
        })
      );
    }
  }
  throw rehearsalRefusal(`unsupported-provider-command:${args.slice(0, 2).join(':')}`);
}
