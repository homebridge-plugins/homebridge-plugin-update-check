# NPM Authentication Issue Investigation

## Problem Summary

The "Unified Release" workflow (run #17714644700) failed during the NPM publishing step with the error:

```
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
npm error need auth You need to authorize this machine using `npm adduser`
```

## Root Cause Analysis

The failure occurs in the reusable workflow `homebridge/.github/.github/workflows/publish-release.yml@latest`. The workflow logs show that `NODE_AUTH_TOKEN` is empty, despite the `secrets.NPM_TOKEN` being referenced in the workflow.

### Reusable Workflow Secret Inheritance Issue

The issue is caused by **missing secret inheritance** in the reusable workflow configuration. The current `release.yml` workflow uses:

```yaml
publish-release:
  needs: [determine-release-type, update-version]
  uses: homebridge/.github/.github/workflows/publish-release.yml@latest
  with:
    release_type: ${{ needs.determine-release-type.outputs.release_type }}
    version: ${{ needs.update-version.outputs.version }}
    is_esm: ${{ needs.determine-release-type.outputs.is_esm == 'true' }}
  # Missing: secrets inheritance
```

The reusable workflow `publish-release.yml` expects `secrets.NPM_TOKEN` but doesn't automatically inherit secrets from the calling repository unless explicitly configured.

## Solution Requirements

### Option 1: Add Secret Inheritance (Recommended)

Update the `publish-release` job in `release.yml` to inherit secrets:

```yaml
publish-release:
  needs: [determine-release-type, update-version]
  uses: homebridge/.github/.github/workflows/publish-release.yml@latest
  with:
    release_type: ${{ needs.determine-release-type.outputs.release_type }}
    version: ${{ needs.update-version.outputs.version }}
    is_esm: ${{ needs.determine-release-type.outputs.is_esm == 'true' }}
  secrets: inherit
```

### Option 2: Explicit Secret Passing

Alternatively, pass the specific secret explicitly:

```yaml
publish-release:
  needs: [determine-release-type, update-version]
  uses: homebridge/.github/.github/workflows/publish-release.yml@latest
  with:
    release_type: ${{ needs.determine-release-type.outputs.release_type }}
    version: ${{ needs.update-version.outputs.version }}
    is_esm: ${{ needs.determine-release-type.outputs.is_esm == 'true' }}
  secrets:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Option 3: Update Reusable Workflow (Homebridge Org)

The `homebridge/.github` repository could update the reusable workflow to require explicit secret definition:

```yaml
# In publish-release.yml
on:
  workflow_call:
    secrets:
      NPM_TOKEN:
        required: true
```

## Recommendations

1. **Immediate Fix**: Update the `release.yml` workflow to use `secrets: inherit`
2. **Long-term**: Consider updating the reusable workflow in `homebridge/.github` to explicitly define required secrets
3. **Testing**: Verify that the `NPM_TOKEN` secret exists and has appropriate permissions in the repository/organization settings

## Verification Steps

After implementing the fix:

1. Verify the `NPM_TOKEN` secret is configured in repository/organization settings
2. Ensure the token has publish permissions for the `@homebridge-plugins` scope
3. Test the workflow by triggering a manual release or pushing to the `latest` branch
4. Monitor the workflow logs to confirm `NODE_AUTH_TOKEN` is populated during the publish step

## Impact Assessment

- **Codebase Health**: ✅ All build, lint, and test validations pass
- **Package Structure**: ✅ Valid and ready for publication
- **Issue Type**: 🔧 Infrastructure/Configuration (not code-related)
- **Urgency**: High (blocks all releases)

## Related Issues

This investigation addresses issue #154 regarding the NPM authentication failure in the unified release workflow.