// @story #2161 — disposable gh executable; all writes stay in the fixture JSON.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseSelection, selectResponse } from '../helpers/refinement-query-selection.mjs';

export function runFirstChildGh(args) {
  const file = process.env.AITM_FIRST_CHILD_FIXTURE;
  if (!file) throw new Error('fixture file required');
  const state = JSON.parse(readFileSync(file, 'utf8'));
  const at = (flag) => args[args.indexOf(flag) + 1];
  const save = () => writeFileSync(file, JSON.stringify(state));
  const issue = (number) => {
    const result = state.issues[number];
    if (!result) throw new Error('unknown fixture issue ' + number);
    return result;
  };
  const allNodes = () =>
    Object.values(state.issues).flatMap((entry) => [
      entry,
      ...entry.projectItems.nodes,
      ...entry.comments.nodes,
    ]);
  const find = (id) => (id === 'P' ? state.project : allNodes().find((entry) => entry.id === id));
  const write = (kind) => {
    state.effects.push(kind);
  };
  const drift = (point) => {
    if (state.tetherDriftPoint === point && state.effectsAtDrift === undefined) {
      state.issues[42].assignees.nodes = [{ login: 'other' }];
      state.effectsAtDrift = state.effects.length;
      save();
    }
  };
  const comment = (number, body) => {
    const target = issue(number),
      count = allNodes().filter((entry) => entry.__typename === 'IssueComment').length + 1;
    const created = {
      __typename: 'IssueComment',
      id: 'IC_' + count,
      databaseId: count,
      body,
      url: target.url + '#issuecomment-' + count,
      author: { login: 'operator' },
      authorAssociation: 'OWNER',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      issue: { number, repository: { nameWithOwner: 'o/r' } },
    };
    target.comments.nodes.push(created);
    write('comment:' + number);
    save();
    return created;
  };
  appendFileSync(
    file + '.traffic',
    JSON.stringify({ args, session: process.env.AI_TASK_MANAGER_SESSION_ID ?? null }) + '\n'
  );
  if (args[0] === 'issue' && args[1] === 'create') {
    if (Object.hasOwn(state.issues, '43')) throw new Error('duplicate creation');
    const child = structuredClone(state.childTemplate);
    child.body = readFileSync(at('--body-file'), 'utf8');
    child.title = at('--title');
    child.projectItems.nodes = [];
    state.issues[43] = child;
    if (state.driftAfterCreate) state.issues[42].assignees.nodes = [{ login: 'other' }];
    write('create:43');
    save();
    return child.url;
  }
  if (args[0] === 'issue' && args[1] === 'view') {
    const target = issue(Number(args[2]));
    if (target.number === 43 && state.effects.includes('create:43')) drift('child-body-read');
    if (at('-R') !== 'o/r' && at('--repo') !== 'o/r') throw new Error('foreign repository');
    const fields = at('--json').split(',');
    const value = Object.fromEntries(
      fields.map((key) => [
        key,
        ['labels', 'comments'].includes(key) ? target[key].nodes : target[key],
      ])
    );
    if (args.includes('-q') || args.includes('--jq')) return value.body;
    return JSON.stringify(value);
  }
  if (args[0] === 'issue' && args[1] === 'comment')
    return comment(Number(args[2]), at('--body')).url;
  const endpoint = args.find((arg) => /^\/?repos\/o\/r\/issues\/\d+\/comments$/.test(arg));
  if (args[0] === 'api' && endpoint) {
    const number = Number(endpoint.match(/issues\/(\d+)/)[1]);
    if (args.includes('--input'))
      return JSON.stringify(comment(number, JSON.parse(readFileSync(0, 'utf8')).body));
    return JSON.stringify(issue(number).comments.nodes);
  }
  if (args[0] === 'issue' && args[1] === 'edit') {
    const target = issue(Number(args[2]));
    if (args.includes('--body-file')) {
      target.body =
        at('--body-file') === '-'
          ? readFileSync(0, 'utf8')
          : readFileSync(at('--body-file'), 'utf8');
      write('body:' + target.number);
    }
    if (args.includes('--title')) {
      target.title = at('--title');
      write('title:' + target.number);
    }
    if (args.includes('--add-label')) {
      for (let i = 0; i < args.length; i++)
        if (
          args[i] === '--add-label' &&
          !target.labels.nodes.some((entry) => entry.name === args[i + 1])
        )
          target.labels.nodes.push({ id: 'L_' + args[i + 1], name: args[i + 1] });
      write('labels:' + target.number);
    }
    save();
    return target.url;
  }
  if (args[0] === 'api' && args[1] === 'user')
    return args.includes('--jq') ? 'operator' : JSON.stringify({ login: 'operator' });
  if (args[0] !== 'api' || args[1] !== 'graphql')
    throw new Error('unclassified fixture command: ' + args.join(' '));
  let query,
    variables = {};
  if (args.includes('--input')) ({ query, variables = {} } = JSON.parse(readFileSync(0, 'utf8')));
  else
    for (let index = 0; index < args.length; index++) {
      if (!['-f', '-F'].includes(args[index])) continue;
      const text = args[index + 1],
        equals = text.indexOf('='),
        key = text.slice(0, equals),
        raw = text.slice(equals + 1);
      if (key === 'query') query = raw;
      else {
        try {
          variables[key] = args[index] === '-F' ? JSON.parse(raw) : raw;
        } catch {
          variables[key] = raw;
        }
      }
    }
  const fields = parseSelection(query, variables);
  const mutation = fields[0];
  const input = mutation.args.input ?? {};
  const root = { viewer: { login: 'operator' }, repository: { id: 'R', nameWithOwner: 'o/r' } };
  if (/^\s*mutation/.test(query)) {
    if (mutation.name === 'linkProjectV2ToRepository')
      root.linkProjectV2ToRepository = { repository: root.repository };
    else if (mutation.name === 'addProjectV2ItemById') {
      const target = find(input.contentId);
      if (!target?.number || input.projectId !== 'P') throw new Error('foreign project add');
      const item = structuredClone(state.childItem);
      item.content = {
        __typename: 'Issue',
        id: target.id,
        number: target.number,
        title: target.title,
        url: target.url,
        repository: { nameWithOwner: 'o/r' },
      };
      target.projectItems.nodes.push(item);
      root.addProjectV2ItemById = { item };
    } else if (mutation.name === 'addSubIssue') {
      const parent = find(input.issueId),
        child = find(input.subIssueId);
      if (parent?.number !== 42 || child?.number !== 43) throw new Error('foreign child link');
      if (!parent.childNumbers.includes(43)) parent.childNumbers.push(43);
      child.parent = { number: 42 };
      root.addSubIssue = { issue: parent, subIssue: child };
    } else if (mutation.name === 'updateProjectV2ItemFieldValue') {
      const item = find(input.itemId);
      if (!item || input.projectId !== 'P') throw new Error('foreign field write');
      let field = item.fieldValues.nodes.find((entry) => entry.field.id === input.fieldId);
      if (!field) {
        field = {
          id: item.id + '-' + input.fieldId,
          field: { id: input.fieldId, name: state.names[input.fieldId] },
        };
        item.fieldValues.nodes.push(field);
      }
      if (input.value.number !== undefined) {
        field.number = input.value.number;
        field.__typename = 'ProjectV2ItemFieldNumberValue';
      } else if (input.value.text !== undefined) {
        field.text = input.value.text;
        field.__typename = 'ProjectV2ItemFieldTextValue';
      } else if (input.value.date !== undefined) {
        field.date = input.value.date;
        field.__typename = 'ProjectV2ItemFieldDateValue';
      } else {
        field.name = input.value.singleSelectOptionId.replace('OPT_', '');
        field.optionId = input.value.singleSelectOptionId;
        field.__typename = 'ProjectV2ItemFieldSingleSelectValue';
      }
      root.updateProjectV2ItemFieldValue = { projectV2Item: item };
    } else if (mutation.name === 'updateIssue') {
      const target = find(input.id);
      target.body = input.body;
      root.updateIssue = { issue: target };
    } else if (mutation.name === 'updateIssueComment') {
      const target = find(input.id);
      if (!target) throw new Error('unknown comment');
      target.body = input.body;
      target.updatedAt = new Date().toISOString();
      root.updateIssueComment = { issueComment: target };
    } else if (mutation.name === 'addComment') {
      const target = find(input.subjectId);
      const created = comment(target.number, input.body);
      root.addComment = { commentEdge: { node: created } };
    } else throw new Error('unclassified fixture mutation ' + mutation.name);
    write(mutation.name);
    if (mutation.name === 'linkProjectV2ToRepository') drift('project-link');
    if (mutation.name === 'updateProjectV2ItemFieldValue') drift('field-write');
    save();
  }
  function resolve(source, field) {
    if (source === root && field.name === 'nodes') return field.args.ids.map(find);
    if (source === root && field.name === 'node') return find(field.args.id) ?? null;
    if (source === root.repository && field.name === 'issue') return issue(field.args.number);
    if (source === root.repository && field.name === 'nameWithOwner') return 'o/r';
    if (source === root && field.name === 'rateLimit') return { cost: 1 };
    if (source === state.project && field.name === 'items')
      return {
        nodes: allNodes().filter((entry) => entry.project?.id === 'P'),
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    if (field.name === 'subIssues')
      return {
        nodes: (source.childNumbers ?? []).map(issue),
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    if (field.name === 'fieldValueByName')
      return source.fieldValues.nodes.find((entry) => entry.field.name === field.args.name) ?? null;
    if (field.name === 'isArchived') return false;
    if (field.name === 'totalCount' && Array.isArray(source.nodes)) return source.nodes.length;
    let value = source[field.name];
    if (value?.nodes && field.args.first)
      value = { nodes: value.nodes, pageInfo: { hasNextPage: false, endCursor: null } };
    return value;
  }
  return JSON.stringify({ data: selectResponse(root, fields, resolve) });
}
