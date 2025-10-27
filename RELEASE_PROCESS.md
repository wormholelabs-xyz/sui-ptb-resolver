# Release Process: From PR to Production

This document provides a step-by-step walkthrough of the complete release
process using semantic-release, covering all manual steps, approvals, and
automation triggers.

## 🚀 **Quick Summary**

The simplified release flow:

**PR → Merge → Pre-release (`-development.x`) → Prepare Release → Publish
Release → Changelog PR → Merge PR**

1. Create and merge PR to main
2. Automatic pre-release with `-development.x` suffix
3. Manually trigger "Prepare Release" workflow
4. Automatic "Publish Release" workflow (requires 2 approvals)
5. Automatic changelog PR creation
6. Manually merge changelog PR to main

## 🏗️ **System Overview**

### **Release Strategy**

- **Main branch** → Automatic pre-releases (`1.0.0-development.1`,
  `1.0.0-development.2`, etc.)
- **Release branch** → Stable releases (`1.0.0`, `1.1.0`, etc.) with 2+
  approvals

### **Security & Approvals**

- ✅ **Pre-releases**: Automatic, no approvals needed
- 🔒 **Production releases**: Require 2 different approvals via GitHub
  Environment Protection
- 📝 **All releases**: Full audit trail and provenance attestation

---

## 📋 **Complete Release Process Walkthrough**

### **Phase 1: Development & PR Creation**

#### Step 1: Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feat/awesome-new-feature
```

#### Step 2: Make Changes with Conventional Commits

```bash
# Make your changes
git add .
git commit -m "feat: add awesome new feature that does amazing things

This feature enables users to do incredible things with better performance.

Closes #123"
```

#### Step 3: Create Pull Request

```bash
git push origin feat/awesome-new-feature
# Create PR via GitHub UI targeting 'main' branch
```

#### Step 4: Review Release Preview

- **Automatic**: CI workflow runs and adds release preview comment
- **Result**: Bot comment shows what version would be created
- **Example Output**:

  ```
  ## 📦 Release Preview

  🚀 **Version that would be released:** `1.1.0-development.1`

  📊 **Bump type:** minor

  ### 📝 Changes

  * feat: add awesome new feature that does amazing things (abc123)

  ---
  *This preview is automatically updated on each commit. The actual release will happen when this PR is merged to main.*
  ```

### **Phase 2: Pre-release (Automatic)**

#### Step 5: Merge PR to Main

```bash
# Via GitHub UI: Click "Merge pull request"
# Or via CLI:
git checkout main
git merge feat/awesome-new-feature
git push origin main
```

#### Step 6: Automatic Pre-release Workflow Triggers

- **Trigger**: Push to `main` branch
- **Workflow**: `.github/workflows/prerelease.yml`
- **Actions Performed**:
  1. ✅ Security validation
  2. ✅ Install dependencies with pnpm
  3. ✅ Build package
  4. ✅ Run `npm audit signatures`
  5. ✅ Create pre-release with semantic-release
  6. ✅ Publish to npm with `development` tag (e.g., `1.1.0-development.1`)
  7. ✅ Create GitHub release (pre-release)
  8. ✅ Generate audit log

#### Step 7: Verify Pre-release

**Manual Steps**:

```bash
# Check npm
npm view @wormhole-labs/dev-config@development

# Install and test
npm install @wormhole-labs/dev-config@development
```

**GitHub UI**:

- ✅ Check Releases page for new pre-release
- ✅ Verify green provenance badge on npm
- ✅ Review security audit logs

### **Phase 3: Prepare Release**

#### Step 8: Prepare Release Branch

**GitHub UI - Manual Trigger**:

1. Go to **Actions** tab
2. Select **"Prepare Release"** workflow
3. Click **"Run workflow"**
4. Fill in the form:
   - **Commit SHA**: (optional - leave empty to use latest from main)
5. Click **"Run workflow"**

#### Step 9: Release Branch Created

**Automated Process**:

1. ✅ **Validates** workflow trigger
2. ✅ **Determines** source commit (specified SHA or latest main)
3. ✅ **Creates/Updates** `release` branch from source commit
4. ✅ **Force pushes** to update release branch
5. ✅ **Triggers** Publish Release workflow automatically

**Note**: This workflow has no environment protection to avoid blocking. The
actual release protection happens in the next phase.

### **Phase 4: Publish Release (Production)**

#### Step 10: Automatic Workflow Trigger

**Automatic Process**:

- When the release branch is updated (from Phase 3), the Publish Release
  workflow automatically triggers
- The workflow runs on push to `release` branch

#### Step 11: Environment Protection (2 Approvals Required)

**Manual Approval Process**:

1. **Workflow pauses** at "production" environment
2. **Email notification** sent to required reviewers
3. **First reviewer** clicks "Review deployments" → "Approve and deploy"
4. **Second reviewer** (different person) clicks "Review deployments" → "Approve
   and deploy"
5. **Workflow continues** after 2nd approval

#### Step 12: Stable Release Published

**Automatic after 2 approvals**:

1. ✅ Runs semantic-release to determine version
2. ✅ Creates stable release (e.g., `v1.1.0`)
3. ✅ Publishes to npm with `latest` tag
4. ✅ Updates CHANGELOG.md on release branch via GitHub API
5. ✅ Creates provenance attestation
6. ✅ Comprehensive security audit

#### Step 13: Automatic Changelog PR Creation

**Automatic after stable release**:

1. ✅ **PR created automatically** using PAT to merge changelog from release
   branch to main
2. ✅ **PR title**: `chore(release): merge changelog for v1.1.0 to main`
3. ✅ **PR labels**: `changelog`, `automated`, `release`
4. ✅ **Contains only**: Updated CHANGELOG.md with release notes
5. ✅ **CI checks run automatically** due to PAT usage

**Manual Action Required**:

- **Review and merge** the changelog PR to update main branch with release
  history

### **Phase 5: Verification & Cleanup**

#### Step 14: Verify Production Release

**Manual Steps**:

```bash
# Verify npm package
npm view @wormhole-labs/dev-config

# Install latest
npm install @wormhole-labs/dev-config

# Check GitHub
# - ✅ Release created with proper tag
# - ✅ CHANGELOG.md updated
# - ✅ Provenance badge visible on npm
```

#### Step 15: Cleanup

```bash
# Delete feature branch
git branch -d feat/awesome-new-feature
git push origin --delete feat/awesome-new-feature

# The release branch is reused for future releases, so don't delete it
```

---

## 🚨 **Hotfix Process**

### Emergency Hotfix Walkthrough

#### Step 1: Create Hotfix Branch from Release

```bash
# Create a hotfix branch from the release branch
git checkout release
git pull origin release
git checkout -b hotfix/critical-fix
```

#### Step 2: Apply Hotfix with Conventional Commit

```bash
# Make the emergency fix
git add .
git commit -m "fix: resolve critical security vulnerability in auth module

This fixes #XXXX by properly validating input parameters."
```

#### Step 3: Create PR to Release Branch

```bash
# Push hotfix branch
git push origin hotfix/critical-fix

# Create PR via GitHub UI targeting 'release' branch
```

#### Step 4: Merge Hotfix

After PR approval and merge to release branch:

1. ✅ **Publish Release workflow triggers automatically**
2. ✅ **Requires 2 approvals** (production environment protection)
3. ✅ **Creates hotfix version** (e.g., `1.1.1`)
4. ✅ **Publishes** to npm with `latest` tag
5. ✅ **Creates changelog PR** to merge back to main

#### Step 5: Merge Changes Back to Main

1. **Review and merge** the automated changelog PR
2. **Cherry-pick** the hotfix commit to main if needed

---

## 🔧 **Manual Intervention Points**

### **Required Manual Steps**

1. **PR Creation**: Create and merge PRs (normal development)
2. **Prepare Release**: GitHub UI → Actions → "Prepare Release" → Run workflow
3. **Environment Approvals**: 2 different people must approve production
   releases
4. **Changelog PR Review**: Review and merge the automatic changelog PR to main
5. **Release Verification**: Test packages after release
6. **Branch Cleanup**: Delete feature branches (keep release branch)

### **Approval Requirements**

- **Pre-releases**: ❌ No approvals (automatic on merge to main)
- **Production Releases**: ✅ 2 approvals required
- **Hotfix Releases**: ✅ 2 approvals required (same as production)

### **Security Gates**

1. **Branch validation**: Only allowed branches can trigger releases
2. **Actor validation**: Only team members can approve
3. **Different approver**: 2nd approver must be different person
4. **Audit logging**: Every action logged with timestamps
5. **Provenance**: Cryptographic proof of build integrity

---

## 📊 **Monitoring & Verification**

### **What to Check After Each Release**

#### NPM Package

```bash
npm view @wormhole-labs/dev-config
# ✅ Version updated
# ✅ Provenance badge visible
# ✅ Correct tag (development/latest)
```

#### GitHub

- ✅ Release created with proper tag
- ✅ CHANGELOG.md updated in repository
- ✅ Security audit logs available
- ✅ Workflow execution successful

#### Security Verification

- ✅ Provenance attestation generated
- ✅ Audit logs captured
- ✅ Only authorized approvers used
- ✅ No security scan failures
