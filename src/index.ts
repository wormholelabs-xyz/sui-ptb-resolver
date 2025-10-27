/**
 * @wormholelabs/dev-config
 *
 * Main entry point for the dev-config package
 * Exports configuration validators and utilities
 */

export interface CommitType {
  type: string;
  description: string;
  emoji?: string;
}

export const COMMIT_TYPES: Record<string, CommitType> = {
  feat: {
    type: 'feat',
    description: 'A new feature',
    emoji: '✨',
  },
  fix: {
    type: 'fix',
    description: 'A bug fix',
    emoji: '🐛',
  },
  docs: {
    type: 'docs',
    description: 'Documentation only changes',
    emoji: '📚',
  },
  style: {
    type: 'style',
    description: 'Changes that do not affect the meaning of the code',
    emoji: '💎',
  },
  refactor: {
    type: 'refactor',
    description: 'A code change that neither fixes a bug nor adds a feature',
    emoji: '📦',
  },
  perf: {
    type: 'perf',
    description: 'A code change that improves performance',
    emoji: '🚀',
  },
  test: {
    type: 'test',
    description: 'Adding missing tests or correcting existing tests',
    emoji: '🚨',
  },
  build: {
    type: 'build',
    description: 'Changes that affect the build system or external dependencies',
    emoji: '🛠',
  },
  ci: {
    type: 'ci',
    description: 'Changes to our CI configuration files and scripts',
    emoji: '⚙️',
  },
  chore: {
    type: 'chore',
    description: "Other changes that don't modify src or test files",
    emoji: '♻️',
  },
  revert: {
    type: 'revert',
    description: 'Reverts a previous commit',
    emoji: '🗑',
  },
};

/**
 * Validates a commit type
 */
export function isValidCommitType(type: string): boolean {
  return Object.keys(COMMIT_TYPES).includes(type);
}

/**
 * Parses a conventional commit message
 */
export function parseCommitMessage(message: string): {
  type?: string;
  scope?: string;
  breaking?: boolean;
  description?: string;
  body?: string;
  footer?: string;
} {
  const conventionalCommitRegex =
    /^(\w+)(?:\(([^)]+)\))?(!?):\s*(.+)(?:\n\n([\s\S]*?))?(?:\n\n([\s\S]*))?$/;
  const match = message.match(conventionalCommitRegex);

  if (!match) {
    return {};
  }

  const [, type, scope, breaking, description, body, footer] = match;

  return {
    type,
    scope,
    breaking: breaking === '!',
    description,
    body,
    footer,
  };
}

/**
 * Formats a commit message according to conventional commits
 */
export function formatCommitMessage(params: {
  type: string;
  scope?: string;
  description: string;
  body?: string;
  breaking?: boolean;
  breakingDescription?: string;
}): string {
  const { type, scope, description, body, breaking, breakingDescription } = params;

  let message = type;

  if (scope) {
    message += `(${scope})`;
  }

  if (breaking) {
    message += '!';
  }

  message += `: ${description}`;

  if (body) {
    message += `\n\n${body}`;
  }

  if (breaking && breakingDescription) {
    message += `\n\nBREAKING CHANGE: ${breakingDescription}`;
  }

  return message;
}
