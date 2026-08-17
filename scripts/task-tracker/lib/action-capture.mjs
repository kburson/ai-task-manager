// @story #1295

export const ACTION_CAPTURE_SCHEMA = 'aitm.github-action-capture/v1';

const mutation = (mutationKind) => ({ operationClass: 'mutation', mutationKind });
const read = () => ({ operationClass: 'read', mutationKind: null });

function hasAny(args, flags) {
  return flags.some((flag) => args.includes(flag));
}

function classifyIssueEdit(args) {
  if (hasAny(args, ['--body', '--body-file'])) return mutation('issue-body');
  if (args.includes('--title')) return mutation('issue-title');
  if (hasAny(args, ['--add-label', '--remove-label'])) return mutation('issue-labels');
  if (hasAny(args, ['--add-assignee', '--remove-assignee'])) return mutation('issue-ownership');
  return mutation('issue-edit');
}

function graphqlDocument(args, stdin) {
  try {
    const parsed = JSON.parse(Buffer.from(stdin || []).toString('utf8'));
    if (typeof parsed?.query === 'string') return parsed.query;
  } catch {
    // Non-JSON stdin is handled by the argument forms below.
  }
  for (let index = 0; index < args.length; index += 1) {
    if (['-f', '-F', '--field', '--raw-field'].includes(args[index])) {
      const value = args[index + 1] || '';
      if (value.startsWith('query=')) return value.slice('query='.length);
    }
    if (args[index].startsWith('query=')) return args[index].slice('query='.length);
  }
  return '';
}

function classifyApi(args, stdin) {
  const isGraphql = args[1] === 'graphql';
  if (isGraphql) {
    const document = graphqlDocument(args, stdin);
    return /^\s*mutation\b/i.test(document) ? mutation('graphql') : read();
  }

  const methodFlag = args.findIndex((arg) => arg === '-X' || arg === '--method');
  const method = methodFlag >= 0 ? String(args[methodFlag + 1] || '').toUpperCase() : 'GET';
  const hasFields = hasAny(args, ['-f', '-F', '--field', '--raw-field']);
  return method !== 'GET' || hasFields ? mutation('rest') : read();
}

export function classifyGhCall(inputArgs = [], stdin = Buffer.alloc(0)) {
  const args = inputArgs.map(String);
  const [command, subcommand] = args;

  if (command === 'issue') {
    if (subcommand === 'create') return mutation('issue-create');
    if (subcommand === 'edit') return classifyIssueEdit(args);
    if (subcommand === 'comment') return mutation('issue-comment');
    if (subcommand === 'close') return mutation('issue-close');
    if (subcommand === 'reopen') return mutation('issue-reopen');
  }
  if (
    command === 'project' &&
    ['item-add', 'item-archive', 'item-delete', 'item-edit'].includes(subcommand)
  ) {
    return mutation('project');
  }
  if (command === 'api') return classifyApi(args, stdin);
  return read();
}
