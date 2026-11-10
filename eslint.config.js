import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Global ignores keep generated artifacts and legacy configs outside lint scope.
const excludedFiles = [
  'node_modules/**',
  'dist/**',
  'main.js',
  'build/**',
  'coverage/**',
  '.eslintrc.js',
  '.eslintrc',
  '.eslintignore',
  'jest.config.js',
  'jest.config.ts',
  'version-bump.mjs',
  'esbuild.config.mjs'
];

export default tseslint.config(
  { ignores: excludedFiles },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: excludedFiles,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        NodeJS: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'error',
      'no-empty': 'warn',
    },
  },
  {
    files: ['**/*.test.{js,ts,tsx}', '**/tests/**/*.{js,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/decorators/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
