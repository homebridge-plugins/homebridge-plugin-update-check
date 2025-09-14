# Release Process Changes

## Fixed Workflow Failure Issue (#134)

### Problem
The repository was using the homebridge unified release workflow which expects conventional commit format and automated changelog generation. However, this repository uses manual changelog maintenance and non-conventional commit messages, causing workflow failures when trying to generate changelog entries.

### Solution
Replaced the unified release workflow with a compatible release workflow that:

- **Triggers on git tags** (`v*`) instead of branch pushes
- **Supports manual releases** via GitHub Actions workflow_dispatch
- **Validates version consistency** between package.json and git tags
- **Runs full CI pipeline** (lint, build, test) before releasing
- **Creates GitHub releases** with changelog references
- **Publishes to NPM** automatically
- **Uses modern GitHub Actions** (no deprecated actions)

### New Release Process

#### For Maintainers

1. **Update version in package.json**
   ```bash
   npm version patch  # or minor, major
   ```

2. **Update CHANGELOG.md** manually with release notes

3. **Create and push git tag**
   ```bash
   git tag v2.3.4
   git push origin v2.3.4
   ```

4. **Workflow automatically**:
   - Validates version format and consistency
   - Runs lint, build, and tests
   - Creates GitHub release
   - Publishes to NPM

#### Manual Release (if needed)
- Go to GitHub Actions → Release workflow → "Run workflow"
- Enter version (e.g., `v2.3.4`)
- Workflow will validate and release

### Benefits
- ✅ **Fixes workflow failures** - no more conventional commit dependency
- ✅ **Maintains all functionality** - GitHub releases, NPM publishing, changelog
- ✅ **Better validation** - version consistency checks, format validation
- ✅ **Modern and reliable** - uses up-to-date GitHub Actions
- ✅ **Compatible with current workflow** - works with manual changelog maintenance

### Repository Cleanup
Also cleaned up build artifacts that were incorrectly committed:
- Removed `.DS_Store` files (macOS system files)
- Removed `coverage/` directory (test coverage reports)
- Removed `docs/` directory (generated documentation)
- Updated `.gitignore` to prevent future issues