// @story #2165 — strict synthetic provider; production Git and lifecycle stay real.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseSelection, selectResponse } from '../helpers/refinement-query-selection.mjs';

const connection = (nodes) => ({
  nodes,
  totalCount: nodes.length,
  pageInfo: { hasNextPage: false, endCursor: null },
});
export function runCumulativeProvider(file, args) {
  const state = JSON.parse(readFileSync(file, 'utf8'));
  const input =
    args.includes('--input') || (args.includes('--body-file') && args.at(-1) === '-')
      ? readFileSync(0, 'utf8')
      : '';
  appendFileSync(file + '.requests.jsonl', JSON.stringify({ args, input }) + '\n');
  const refuse = (message) => {
    throw Error('cumulative-provider: ' + message);
  };
  const at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const issue = (number) => state.issues[number] ?? refuse('unknown issue ' + number);
  const all = () => [
    state.project,
    ...state.project.fields.nodes,
    ...Object.values(state.issues).flatMap((row) => [
      row,
      ...row.comments.nodes,
      ...row.projectItems.nodes,
    ]),
  ];
  const find = (id) => all().find((row) => row.id === id) ?? refuse('unknown node ' + id);
  const save = (effect) => {
    state.effects.push(effect);
    writeFileSync(file, JSON.stringify(state));
  };
  const createComment = (target, body) => {
    if (typeof body !== 'string' || !body) refuse('empty comment');
    const id = ++state.nextComment;
    const now = new Date().toISOString();
    const comment = {
      __typename: 'IssueComment',
      id: 'IC_fixture_' + id,
      databaseId: id,
      body,
      url: target.url + '#issuecomment-' + id,
      html_url: target.url + '#issuecomment-' + id,
      author: { login: 'fixture' },
      user: { login: 'fixture', type: 'User' },
      authorAssociation: 'OWNER',
      createdAt: now,
      updatedAt: now,
      created_at: now,
      updated_at: now,
      issue: { number: target.number, repository: { nameWithOwner: state.repo } },
    };
    target.comments.nodes.push(comment);
    target.comments.totalCount = target.comments.nodes.length;
    save('comment:' + target.number);
    return comment;
  };
  const restComment = (comment) => ({ ...comment, id: comment.databaseId, node_id: comment.id });
  if (JSON.stringify(args) === JSON.stringify(['api', 'user', '--jq', '.login'])) return 'fixture';
  if (JSON.stringify(args) === JSON.stringify(['api', 'user']))
    return JSON.stringify({ login: 'fixture' });
  if (args[0] === 'project' && args[1] === 'item-edit') {
    if (
      args.length !== 10 ||
      args[2] !== '--project-id' ||
      args[4] !== '--id' ||
      args[6] !== '--field-id' ||
      args[8] !== '--single-select-option-id' ||
      at('--project-id') !== state.project.id ||
      at('--field-id') !== 'STATUS'
    )
      refuse('invalid board write');
    const item = find(at('--id')),
      definition = find('STATUS'),
      option =
        definition.options.find((row) => row.id === at('--single-select-option-id')) ??
        refuse('unknown status');
    const entry =
      item.fieldValues.nodes.find((row) => row.field.id === 'STATUS') ?? refuse('missing status');
    Object.assign(entry, { name: option.name, optionId: option.id });
    save('board:' + item.id);
    return JSON.stringify({ id: item.id });
  }
  if (args[0] === 'issue') {
    const target = issue(Number(args[2]));
    if (at('-R') !== state.repo && at('--repo') !== state.repo) refuse('foreign repo');
    if (args[1] === 'view') {
      const fields = at('--json').split(',');
      const value = {};
      for (const field of fields) {
        if (!Object.hasOwn(target, field)) refuse('unavailable issue field ' + field);
        value[field] = ['comments', 'labels', 'assignees'].includes(field)
          ? target[field].nodes
          : target[field];
      }
      if (args.includes('--jq') || args.includes('-q')) {
        const selection = at('--jq') ?? at('-q');
        if (selection === '.labels[].name' && fields.join(',') === 'labels')
          return value.labels.map((row) => row.name).join('\n');
        if (selection === '.comments' && fields.join(',') === 'comments')
          return JSON.stringify(value.comments);
        if (selection !== '.body') refuse('unsupported jq ' + selection);
        return value.body;
      }
      return JSON.stringify(value);
    }
    if (args[1] === 'edit' && args.length === 7 && at('--body-file') === '-') {
      if (!input) refuse('empty body');
      target.body = input;
      target.updatedAt = target.updated_at = new Date().toISOString();
      save('body:' + target.number);
      return target.url;
    }
    if (args[1] === 'comment' && args.includes('--body'))
      return createComment(target, at('--body')).url;
    refuse('unsupported issue command');
  }
  const endpoint = args.find((arg) => arg.startsWith('repos/'));
  if (args[0] === 'api' && endpoint) {
    if (!endpoint.startsWith('repos/' + state.repo + '/')) refuse('foreign endpoint');
    const suffix = endpoint.slice(('repos/' + state.repo + '/').length);
    let match = suffix.match(/^issues\/(\d+)\/comments(?:\?per_page=100)?$/);
    if (match) {
      const target = issue(Number(match[1]));
      if (at('--method') === 'POST' && args.includes('-f') && at('-f')?.startsWith('body='))
        return JSON.stringify(restComment(createComment(target, at('-f').slice(5))));
      if (args.includes('--input'))
        return JSON.stringify(restComment(createComment(target, JSON.parse(input).body)));
      if (args.some((arg) => ['-X', '--method'].includes(arg)))
        refuse('unsupported comments method');
      return JSON.stringify(
        args.includes('--slurp')
          ? [target.comments.nodes.map(restComment)]
          : target.comments.nodes.map(restComment)
      );
    }
    match = suffix.match(/^issues\/comments\/(\d+)$/);
    if (match) {
      const c =
        all().find((row) => row.databaseId === Number(match[1])) ?? refuse('unknown comment');
      if (at('-X') === 'PATCH' && at('-f')?.startsWith('body=')) {
        c.body = at('-f').slice(5);
        c.updatedAt = c.updated_at = new Date().toISOString();
        save('update-comment:' + c.id);
      } else if (args.includes('--input')) {
        c.body = JSON.parse(input).body;
        c.updatedAt = c.updated_at = new Date().toISOString();
        save('update-comment:' + c.id);
      }
      return JSON.stringify(restComment(c));
    }
    match = suffix.match(/^issues\/(\d+)\/sub_issues(?:\?per_page=100)?$/);
    if (match) {
      issue(Number(match[1]));
      return JSON.stringify(args.includes('--slurp') ? [[]] : []);
    }
    if (
      suffix === 'commits/' + state.pr.headRefOid + '/pulls' &&
      args.length === 4 &&
      args.includes('--paginate') &&
      args.includes('--slurp')
    )
      return JSON.stringify([[{ number: state.pr.number }]]);
    if (suffix === 'pulls' && args.includes('--slurp'))
      return JSON.stringify([[{ number: state.pr.number }]]);
    if (suffix === 'git/ref/heads/' + state.pr.headRefName)
      return JSON.stringify({
        ref: 'refs/heads/' + state.pr.headRefName,
        object: { sha: state.pr.headRefOid },
      });
    refuse('unsupported REST endpoint ' + suffix);
  }
  if (args[0] === 'pr') {
    if (at('--repo') !== state.repo && at('-R') !== state.repo) refuse('foreign PR repo');
    if (args[1] === 'view' && Number(args[2]) !== state.pr.number) refuse('foreign PR');
    if (
      args[1] === 'checks' &&
      Number(args[2]) === state.pr.number &&
      args.includes('--required') &&
      at('--json') === 'name,state'
    )
      return JSON.stringify(state.requiredChecks);
    if (!['list', 'view'].includes(args[1])) refuse('unsupported PR command');
    const fields = at('--json').split(',');
    const pr = {};
    for (const name of fields) {
      if (!Object.hasOwn(state.pr, name)) refuse('unavailable PR field ' + name);
      pr[name] = state.pr[name];
    }
    return JSON.stringify(args[1] === 'list' ? [pr] : pr);
  }
  if (args[0] !== 'api' || args[1] !== 'graphql') refuse('unknown command');
  let query,
    variables = {};
  if (args.includes('--input')) ({ query, variables = {} } = JSON.parse(input));
  else
    for (let i = 2; i < args.length; i += 2) {
      if (!['-f', '-F'].includes(args[i])) refuse('unknown GraphQL argument');
      const [key, ...rest] = args[i + 1].split('=');
      const value = rest.join('=');
      if (key === 'query') query = value;
      else {
        try {
          variables[key] = args[i] === '-F' ? JSON.parse(value) : value;
        } catch {
          variables[key] = value;
        }
      }
    }
  if (typeof query !== 'string') refuse('missing query');
  const declared = new Set([...query.matchAll(/\$(\w+)\s*:/g)].map((match) => match[1]));
  if (Object.keys(variables).some((name) => !declared.has(name))) refuse('unknown variable');
  const fields = parseSelection(query, variables);
  const root = {
    viewer: { login: 'fixture' },
    repository: { id: 'R_fixture', nameWithOwner: state.repo },
    rateLimit: { cost: 1 },
  };
  if (/^\s*mutation/.test(query)) {
    if (fields.length !== 1) refuse('multiple mutation');
    const field = fields[0],
      data = field.args.input ?? variables.input ?? {};
    const keys = {
      updateIssue: ['id', 'body'],
      addComment: ['subjectId', 'body'],
      updateIssueComment: ['id', 'body'],
      updateProjectV2ItemFieldValue: ['projectId', 'itemId', 'fieldId', 'value'],
    }[field.name];
    if (!keys || Object.keys(data).sort().join(',') !== keys.sort().join(','))
      refuse('unsupported mutation input');
    if (field.name === 'updateIssue') {
      const target = find(data.id);
      if (!Object.hasOwn(state.issues, target.number) || typeof data.body !== 'string')
        refuse('invalid issue update');
      target.body = data.body;
      save('body:' + target.number);
      root.updateIssue = { issue: target };
    } else if (field.name === 'addComment') {
      const target = find(data.subjectId);
      root.addComment = { commentEdge: { node: createComment(target, data.body) } };
    } else if (field.name === 'updateIssueComment') {
      const target = find(data.id);
      if (target.__typename !== 'IssueComment' || typeof data.body !== 'string')
        refuse('invalid comment update');
      target.body = data.body;
      target.updatedAt = target.updated_at = new Date().toISOString();
      save('update-comment:' + target.id);
      root.updateIssueComment = { issueComment: target };
    } else if (field.name === 'updateProjectV2ItemFieldValue') {
      if (data.projectId !== state.project.id) refuse('foreign project');
      const item = find(data.itemId),
        definition = find(data.fieldId);
      if (!item.project || !definition.dataType) refuse('invalid field write');
      const value = data.value,
        keys = Object.keys(value);
      if (
        keys.length !== 1 ||
        !['singleSelectOptionId', 'number', 'text', 'date'].includes(keys[0])
      )
        refuse('invalid field value');
      let entry = item.fieldValues.nodes.find((row) => row.field.id === definition.id);
      if (!entry) {
        entry = { id: item.id + '_' + definition.id, field: definition };
        item.fieldValues.nodes.push(entry);
        item.fieldValues.totalCount = item.fieldValues.nodes.length;
      }
      if (value.singleSelectOptionId) {
        const option =
          definition.options.find((row) => row.id === value.singleSelectOptionId) ??
          refuse('unknown option');
        Object.assign(entry, {
          __typename: 'ProjectV2ItemFieldSingleSelectValue',
          name: option.name,
          optionId: option.id,
        });
      } else
        Object.assign(entry, {
          [keys[0]]: value[keys[0]],
          __typename:
            'ProjectV2ItemField' +
            { number: 'Number', text: 'Text', date: 'Date' }[keys[0]] +
            'Value',
        });
      save('field:' + definition.id);
      root.updateProjectV2ItemFieldValue = { projectV2Item: item };
    } else refuse('unsupported mutation ' + field.name);
  }
  function resolve(source, field) {
    const a = field.args;
    if (source === root && field === fields[0] && /^\s*mutation/.test(query))
      return root[field.name];
    if (source === root && field.name === 'repository') {
      if (a.owner !== 'example' || a.name !== 'project' || Object.keys(a).length !== 2)
        refuse('foreign repository');
      return root.repository;
    }
    if (source === root && field.name === 'node') return find(a.id);
    if (source === root && field.name === 'nodes') return a.ids.map(find);
    if (source === root.repository && field.name === 'issue') return issue(a.number);
    if (source === root.repository && field.name === 'pullRequest') {
      if (a.number !== state.pr.number) refuse('foreign PR');
      return state.pr;
    }
    if (source === root && ['user', 'organization'].includes(field.name)) {
      if (a.login !== 'example') refuse('foreign owner');
      return { projectV2: state.project };
    }
    if (field.name === 'projectV2') {
      if (a.number !== 1) refuse('foreign project number');
      return state.project;
    }
    if (field.name === 'fieldValueByName')
      return source.fieldValues.nodes.find((row) => row.field.name === a.name) ?? null;
    if (source === state.project && field.name === 'items')
      return connection(Object.values(state.issues).flatMap((row) => row.projectItems.nodes));
    if (source === state.pr && field.name === 'commits')
      return connection(
        state.evidence.map((c) => ({
          commit: {
            oid: c.oid,
            message: c.message,
            messageHeadline: c.message,
            tree: { oid: c.tree },
            parents: connection(c.parents.map((oid) => ({ oid }))),
          },
        }))
      );
    for (const [key, value] of Object.entries(a))
      if (!['first', 'after'].includes(key) || (key === 'after' && value != null))
        refuse('unsupported field argument ' + field.name + '.' + key);
    if (!Object.hasOwn(source, field.name)) refuse('unavailable selected field ' + field.name);
    return source[field.name];
  }
  return JSON.stringify({ data: selectResponse(root, fields, resolve) });
}
