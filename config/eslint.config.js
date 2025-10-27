/**
 * ESLint configuration for Wormhole Labs projects
 * TypeScript-first with Prettier integration
 */

import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  // Base JavaScript configuration
  js.configs.recommended,

  // Prettier configuration (disables conflicting rules)
  prettierConfig,

  // Global configuration
  {
    ignores: [
      // Dependencies
      '**/node_modules/**',
      '**/jspm_packages/**',

      // Build outputs
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.nuxt/**',
      '**/.vuepress/dist/**',
      '**/.docusaurus/**',

      // Cache directories
      '**/.cache/**',
      '**/.parcel-cache/**',
      '**/.nyc_output/**',
      '**/.tmp/**',
      '**/.temp/**',
      '**/.vitepress/cache/**',

      // Generated files
      '**/CHANGELOG.md',
      '**/*.tsbuildinfo',

      // Environment files
      '**/.env',
      '**/.env.*',
      '!**/.env.example',

      // Logs
      '**/logs/**',
      '**/*.log',

      // Legacy/deprecated
      '**/.turbo/**',
      '**/legacy/**',
      '**/legacy-pages/**',
      '**/submodules/**',
    ],
  },

  // TypeScript files configuration
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: true,
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettierPlugin,
    },
    rules: {
      // Prettier
      'prettier/prettier': 'error',

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],

      // General rules
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'warn',
      'prefer-template': 'warn',
      'prefer-arrow-callback': 'warn',
      'no-param-reassign': 'error',
      'no-nested-ternary': 'warn',
      'no-unneeded-ternary': 'warn',
    },
  },

  // JavaScript files configuration
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Test files configuration
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
];
