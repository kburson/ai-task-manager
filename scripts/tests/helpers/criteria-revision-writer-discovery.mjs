// @story #1909
// cspell:words quasis
// Discover public writer routes from calls into effects, without trusting the
// production admission wrappers or a hand-maintained writer membership list.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';

const effects = new Set([
  'writeIssueBody',
  'pushBody',
  'createIssueComment',
  'updateIssueComment',
  'createSingletonComment',
  'updateProjection',
  'writeProjection',
  'appendRecord',
]);
const functionTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

export function discoverWriterRoots(root) {
  const directory = path.join(root, 'scripts/task-tracker/lib/github-records');
  const paths = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => path.join(directory, name));
  paths.push(
    ...['issue-body-mutate.mjs', 'versioned-issue-write.mjs'].map((name) =>
      path.join(root, 'scripts/task-tracker/lib', name)
    )
  );
  const modules = new Map();
  for (const filename of paths) {
    const ast = parse(fs.readFileSync(filename, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const module = {
      filename,
      functions: new Map(),
      imports: new Map(),
      exports: new Set(),
      mutations: new Set(),
    };
    for (const statement of ast.body) {
      if (statement.type === 'ImportDeclaration' && statement.source.value.startsWith('.')) {
        for (const item of statement.specifiers) {
          if (item.type === 'ImportSpecifier')
            module.imports.set(item.local.name, {
              filename: path.resolve(path.dirname(filename), statement.source.value),
              name: item.imported.name,
            });
        }
      }
      const declaration =
        statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (declaration?.type === 'FunctionDeclaration') {
        module.functions.set(declaration.id.name, declaration);
        if (statement.type === 'ExportNamedDeclaration') module.exports.add(declaration.id.name);
      }
      if (declaration?.type === 'VariableDeclaration') {
        for (const item of declaration.declarations) {
          if (
            item.id.type === 'Identifier' &&
            item.init?.type === 'TemplateLiteral' &&
            item.init.quasis.some((q) => q.value.raw.includes('mutation '))
          )
            module.mutations.add(item.id.name);
          if (functionTypes.has(item.init?.type) && item.id.type === 'Identifier') {
            module.functions.set(item.id.name, item.init);
            if (statement.type === 'ExportNamedDeclaration') module.exports.add(item.id.name);
          }
        }
      }
      if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
        for (const item of statement.specifiers) module.exports.add(item.local.name);
      }
    }
    modules.set(filename, module);
  }
  function hasEffect(module, name, visiting = new Set()) {
    const key = `${module.filename}:${name}`;
    if (visiting.has(key)) return false;
    const fn = module.functions.get(name);
    if (!fn) return false;
    visiting = new Set([...visiting, key]);
    const locals = new Map();
    function collect(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration') {
        locals.set(node.id.name, node);
        return;
      }
      if (node.type === 'VariableDeclarator' && functionTypes.has(node.init?.type)) {
        if (node.id.type === 'Identifier') locals.set(node.id.name, node.init);
        return;
      }
      if (functionTypes.has(node.type)) return;
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(collect);
        else collect(value);
      }
    }
    collect(fn.body);
    const calledLocals = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object') return false;
      // A factory's returned closures are not calls made by that factory.
      if (functionTypes.has(node.type)) return false;
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          effects.has(callee.property.name)
        )
          return true;
        if (callee.type === 'Identifier') {
          if (effects.has(callee.name)) return true;
          if (
            callee.name === 'graphql' &&
            node.arguments.some(
              (arg) =>
                arg.type === 'ObjectExpression' &&
                arg.properties.some(
                  (prop) => prop.key?.name === 'query' && module.mutations.has(prop.value?.name)
                )
            )
          )
            return true;
          if (locals.has(callee.name) && !calledLocals.has(callee.name)) {
            calledLocals.add(callee.name);
            if (walk(locals.get(callee.name).body)) return true;
          }
          if (hasEffect(module, callee.name, visiting)) return true;
          const imported = module.imports.get(callee.name);
          if (
            imported &&
            modules.has(imported.filename) &&
            hasEffect(modules.get(imported.filename), imported.name, visiting)
          )
            return true;
        }
        for (const argument of node.arguments) {
          if (functionTypes.has(argument.type) && walk(argument.body)) return true;
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value) ? value.some(walk) : walk(value)) return true;
      }
      return false;
    }
    return walk(fn.body);
  }
  return [...modules.values()]
    .flatMap((module) =>
      [...module.exports]
        .filter((name) => hasEffect(module, name))
        .map((name) => ({ file: path.relative(root, module.filename), name }))
    )
    .sort((a, b) => `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`));
}
