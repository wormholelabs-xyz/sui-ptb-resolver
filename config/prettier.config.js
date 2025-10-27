/**
 * Prettier configuration for Wormhole Labs projects
 * Consistent code formatting across all repositories
 */

export default {
  // Line length
  printWidth: 100,

  // Indentation
  tabWidth: 2,
  useTabs: false,

  // Semicolons
  semi: true,

  // Quotes
  singleQuote: true,
  quoteProps: 'as-needed',

  // JSX
  jsxSingleQuote: false,

  // Trailing commas
  trailingComma: 'es5',

  // Brackets
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow functions
  arrowParens: 'always',

  // Format embedded languages
  embeddedLanguageFormatting: 'auto',

  // Line endings
  endOfLine: 'lf',

  // Markdown
  proseWrap: 'preserve',

  // HTML
  htmlWhitespaceSensitivity: 'css',

  // Vue
  vueIndentScriptAndStyle: false,

  // Overrides for specific file types
  overrides: [
    {
      files: ['*.json', '*.jsonc'],
      options: {
        printWidth: 80,
      },
    },
    {
      files: ['*.md', '*.mdx'],
      options: {
        proseWrap: 'always',
        printWidth: 80,
      },
    },
    {
      files: '*.yml',
      options: {
        singleQuote: false,
      },
    },
  ],
};
