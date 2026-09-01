import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.tmp/**',
      '.scratch/**',
      '.worktrees/**',
      '.claude/worktrees/**',
      'reports/**',
      'coverage/**',
      '*.tgz',
      'docs/postmortems/**',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-fallthrough': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['**/*.test.mjs', 'tests/**/*.mjs', 'scripts/tests/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
