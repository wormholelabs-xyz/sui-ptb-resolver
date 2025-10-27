# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by
emailing security@wormholelabs.xyz.

**Please do not report security vulnerabilities through public GitHub issues.**

## Security Measures

This repository implements multiple security layers:

### 1. Repository Access Control

- Protected branches require PR reviews
- CODEOWNERS enforce review requirements for critical files
- Workflow files can only be modified by designated teams

### 2. Runtime Validation

- Release workflows validate trigger events
- Releases only allowed from main branch
- All release attempts are logged and audited

### 3. Environment Protection

- Production environment requires manual approval
- Deployment limited to protected branches
- Time-based review windows

### 4. External Service Protection

- NPM publishing uses GitHub OIDC (no long-lived tokens)
- Packages published with provenance attestation
- All releases are cryptographically signed

## Release Process Security

1. All releases require:
   - Conventional commit messages (enforced by commitlint)
   - PR review from CODEOWNERS
   - CI/CD checks passing
   - Manual approval in production environment
   - Audit log creation

2. Emergency hotfixes:
   - Still require PR review
   - Can bypass certain checks with documented justification
   - All emergency releases are flagged in audit logs

## Audit Trail

All release activities are logged:

- GitHub Actions artifacts (90-day retention)
- Workflow run logs
- Environment deployment history
- NPM package provenance
