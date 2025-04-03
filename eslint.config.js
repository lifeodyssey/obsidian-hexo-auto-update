import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Exclude files explicitly since ignores array doesn't seem to fully work in ESLint 9
const excludedFiles = [
  'node_modules/**', 
  'dist/**', 
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
