# @wormhole-labs/dev-config

Shared development configuration and tooling for Wormhole Labs projects. This
repository serves as a centralized source for linting, formatting, commit
conventions, and release automation configurations.

## Overview

This package provides:

- **Conventional Commits** - Standardized commit message format with validation
- **CommitLint** - Enforce commit message conventions
- **Prettier** - Code formatting configuration
- **ESLint** - Linting configuration for TypeScript/JavaScript
- **Release Please** - Automated versioning and changelog generation
- **Husky** - Git hooks for pre-commit and commit-msg validation
- **GitHub Actions** - CI/CD workflows for automation

## Installation

Install the package in your project:

```bash
npm install --save-dev @wormhole-labs/dev-config
```

Or with pnpm:

```bash
pnpm add -D @wormhole-labs/dev-config
```

## Quick Setup

### 1. Conventional Commits & CommitLint

Create `.commitlintrc.js` in your project root:

```javascript
export default {
  extends: ['@wormhole-labs/dev-config/commitlint'],
};
```

**Note:** This package uses ES modules for commitlint configuration to ensure
compatibility with modern tooling and GitHub Actions.

### 2. Prettier Configuration

Create `.prettierrc.js`:

```javascript
export default {
  ...require('@wormhole-labs/dev-config/prettier'),
};
```

### 3. ESLint Configuration

Create `eslint.config.js`:

```javascript
import wormholeConfig from '@wormhole-labs/dev-config/eslint';

export default [
  ...wormholeConfig,
  // Your custom rules here
];
```

### 4. Husky Git Hooks

Set up git hooks by running:

```bash
npx husky init
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit $1'
npx husky add .husky/pre-commit 'npm run lint && npm run format:check'
```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/)
specification:

```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Changes to build system or dependencies
- `ci`: CI/CD configuration changes
- `chore`: Other changes that don't modify src or test files
- `revert`: Reverts a previous commit

### Examples

```bash
# Feature
git commit -m "feat(connect): add Solana wallet support"

# Bug fix
git commit -m "fix(portal): resolve navigation timeout issue"

# Breaking change
git commit -m "feat(api)!: change response format

BREAKING CHANGE: API responses now use camelCase instead of snake_case"

# Multiple scopes
git commit -m "fix(connect,portal): synchronize wallet state"
```

## Release Automation

This package includes Release Please configuration for automated versioning and
changelog generation.

### Setting Up Release Please

1. Copy the workflow from this repo's `.github/workflows/release.yml`
2. Configure your repository secrets:
   - `RELEASE_TOKEN`: GitHub token with write permissions
   - `NPM_TOKEN`: NPM automation token (for publishing)

### How It Works

1. PRs with conventional commits trigger Release Please
2. Release Please creates/updates a PR with version bumps and changelog
3. Merging the release PR triggers:
   - GitHub release creation
   - NPM package publishing (if configured)
   - Changelog updates

## Security

### Protected Workflows

All release workflows include multiple security layers:

1. **CODEOWNERS** - Workflow changes require maintainer approval
2. **Protected Environments** - Production deployments need manual approval
3. **Team Validation** - Only team members can trigger releases
4. **Audit Logging** - All actions are logged for review

### Setting Up Security

1. Create a `CODEOWNERS` file:

```
# CODEOWNERS
.github/workflows/* @wormholelabs-xyz/release-engineers
package.json @wormholelabs-xyz/maintainers
```

2. Configure branch protection:
   - Require pull request reviews
   - Require status checks to pass
   - Include administrators
   - Restrict who can push

3. Set up protected environments in GitHub:
   - Go to Settings → Environments
   - Create "production" environment
   - Add required reviewers
   - Set deployment timeout

## Development

### Prerequisites

- Node.js >= 18
- npm >= 9 or pnpm >= 8

### Local Development

```bash
# Install dependencies
pnpm install

# Lint code
pnpm lint

# Format code
pnpm format

# Validate everything
pnpm validate
```

### Testing Configurations

To test configurations in other projects:

```bash
# Link this package locally
cd /path/to/dev-config
npm link

# Use in another project
cd /path/to/your-project
npm link @wormhole-labs/dev-config
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes using conventional commits
4. Ensure all tests pass
5. Submit a pull request

## License

MIT © Wormhole Labs
