#!/usr/bin/env node
// @story #560
// Thin CLI the init-project-config.sh shim delegates to for the deterministic
// config-authoring + template-writing + parsing steps. The interactive
// gh/GraphQL field-discovery and project-creation orchestration stays in bash
// (it is I/O plumbing, not testable transform logic); this entry owns only the
// pure/file-writing responsibilities extracted under lib/config-init/.

import { preflightConfig, writeConfig } from './lib/config-init/config-authoring.mjs';
import { writeIssueTemplates } from './lib/config-init/issue-templates.mjs';
import {
  projectNumberFromInput,
  canonColor,
  normalizeProjectList,
  mergeProjectLists,
} from './lib/config-init/parsers.mjs';

function getArg(argv, name) {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function main(argv) {
  const [sub, ...rest] = argv;
  switch (sub) {
    case 'preflight-config': {
      const file = getArg(rest, '--file') || process.env.CONFIG_FILE;
      if (!file) {
        process.stderr.write('config-init preflight-config: --file (or CONFIG_FILE) required\n');
        return 1;
      }
      try {
        preflightConfig({ file });
      } catch (error) {
        process.stderr.write(`${error?.message || error}\n`);
        return 1;
      }
      return 0;
    }
    case 'write-config': {
      const file = getArg(rest, '--file') || process.env.CONFIG_FILE;
      if (!file) {
        process.stderr.write('config-init write-config: --file (or CONFIG_FILE) required\n');
        return 1;
      }
      writeConfig({ file, env: process.env });
      return 0;
    }
    case 'write-templates': {
      const target = getArg(rest, '--target') || process.env.TARGET_DIR;
      if (!target) {
        process.stderr.write('config-init write-templates: --target (or TARGET_DIR) required\n');
        return 1;
      }
      writeIssueTemplates(target);
      return 0;
    }
    case 'parse-project-input': {
      const raw = rest[0] ?? '';
      const owner = getArg(rest, '--owner') || process.env.OWNER || '';
      process.stdout.write(projectNumberFromInput(raw, owner) + '\n');
      return 0;
    }
    case 'canon-color': {
      process.stdout.write(canonColor(rest[0] ?? '') + '\n');
      return 0;
    }
    case 'normalize-projects': {
      // Reads two raw GraphQL payloads (linked + owner) from env, emits the
      // merged/sorted projects array as compact JSON for the bash caller.
      let linked = [];
      let owner = [];
      try {
        linked = normalizeProjectList(JSON.parse(process.env.LINKED_PROJECTS_RAW || 'null'), true);
      } catch {
        /* malformed payload → empty list, matching the bash `|| echo '[]'` */
      }
      try {
        owner = normalizeProjectList(JSON.parse(process.env.OWNER_PROJECTS_RAW || 'null'), false);
      } catch {
        /* malformed payload → empty list */
      }
      process.stdout.write(JSON.stringify(mergeProjectLists(linked, owner)) + '\n');
      return 0;
    }
    default:
      process.stderr.write(
        `config-init: unknown subcommand '${sub ?? ''}'\n` +
          'usage: config-init <preflight-config|write-config|write-templates|parse-project-input|canon-color|normalize-projects>\n'
      );
      return 1;
  }
}

const code = main(process.argv.slice(2));
process.exit(code);
