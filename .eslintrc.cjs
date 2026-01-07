/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: [
    'eslint:recommended',
    "plugin:@typescript-eslint/recommended"
  ],
  plugins: [
    "@typescript-eslint"
  ],
  env: {
    browser : true,
    es6 : true
  },
  parserOptions: {
    'sourceType' : 'module',
    'ecmaVersion' : 'latest'
  },
  rules: {
    'no-console': 'off', // Allow console.logs
    eqeqeq: 'warn', // Prefer === instead of ==
    'no-magic-numbers': 'off', // Don't allow magic numbers
    indent: ['error', 2], // Two spaces for indents
    'new-cap': 'warn', // Constructors should start with a capital letter
    'no-tabs': 'error', // NO TABS!
    'no-trailing-spaces': 'error', // No trailing whitespace
    'prefer-arrow-callback': 'warn', // Prefer arrow functions in callbacks
    'prefer-template': 'warn', // Use template literals instead of string concatenation
    'no-var': 'warn', // Prefer let and const over var
    'no-undef': 'warn', // Allow things that are not defined (google analytics) but warn,
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'no-unreachable': 'warn',
    '@typescript-eslint/no-empty-function' : 'warn',
    '@typescript-eslint/no-explicit-any' : 'warn',
    '@typescript-eslint/no-unused-expressions' : 'warn',
    'prefer-const'  : 'warn',
    'prefer-spread' : 'warn',
    'prefer-rest-params' : 'warn',
    '@typescript-eslint/ban-types' : 'warn',
  },
  ignorePatterns: ["**/delphy/*", ],
  overrides: [
    {
      files: ['*.ts', '*.mts', '*.cts', '*.tsx'],
      rules: {
        // typescript handles no-undef in other ways,
        // and using the default js on results in false positives for things like
        // `NodeListOf`
        'no-undef': 'off',
      },
    },
  ],
};
