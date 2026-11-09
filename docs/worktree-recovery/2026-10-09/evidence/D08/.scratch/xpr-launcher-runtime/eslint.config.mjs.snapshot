export default [
  {
    files: ['**/*.mjs', '**/*.js'],
    ignores: ['node_modules/**', 'coverage/**', '.scratch/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-dupe-else-if': 'error',
      'no-fallthrough': 'error',
      'no-irregular-whitespace': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-useless-catch': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['scripts/review/**/*.mjs', 'scripts/providers/**/*.mjs', 'scripts/tests/**/*.mjs'],
    rules: {
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },
];
