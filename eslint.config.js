import typescriptParser from '@typescript-eslint/parser';

import eslintConfig from './config/eslint.config.js';

export default [
  ...eslintConfig,

  // Test files are excluded from the build tsconfig (so they don't emit to dist/),
  // so point typed-linting at the dedicated test tsconfig and add Bun globals.
  {
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: ['./tsconfig.test.json'],
      },
      globals: {
        Bun: 'readonly',
      },
    },
  },
];
