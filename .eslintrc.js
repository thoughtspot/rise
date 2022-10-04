/**
 * Copyright (c) 2022
 *
 * ESLint configuration for linting ThoughtSpot Packages
 *
 * @summary ESLint config
 */

module.exports = {
  env: {
    node: true,
    es6: true,
  },
  ignorePatterns: ['*.scss', '*.md'],
  extends: ['airbnb-base', 'plugin:@typescript-eslint/recommended'],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  settings: {
    'import/extensions': ['.js', '.ts'],
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
      node: {
        extensions: ['.js', '.ts'],
      },
    },
  },
  rules: {
    indent: [0, 4, { SwitchCase: 1 }], // Conflict with Prettier
    'no-tabs': ['error', { allowIndentationTabs: true }],
    'jsx-quotes': [2, 'prefer-double'],
    '@typescript-eslint/explicit-function-return-type': [0],
    '@typescript-eslint/no-explicit-any': [0],
    '@typescript-eslint/no-unused-vars': [0],
    'import/prefer-default-export': 0,
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': [0],
    // do not complain when importing js related files without extension,
    // Typescript should handle this.
    'import/extensions': [0],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/*.spec.{ts,tsx}'],
      },
    ],
    'import/no-absolute-path': [0],
    // Disable until this is fixed https://github.com/dividab/tsconfig-paths/issues/128
    'import/no-unresolved': 0,
    'no-plusplus': 0,
    'prefer-destructuring': 0,
    'prefer-const': 0,
    'no-continue': 0,
    'max-classes-per-file': 0,
    'class-methods-use-this': 0,
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],
    'no-param-reassign': [
      'warn',
      {
        props: true,
        ignorePropertyModificationsFor: ['accu'],
      },
    ],
  },
};
