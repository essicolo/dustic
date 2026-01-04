# Automatic Versioning

This project uses automatic version bumping on every PR merge to `main`.

## How It Works

When a PR is merged to `main`, a GitHub Actions workflow automatically:
1. Analyzes the PR title to determine version bump type
2. Updates `package.json` with the new version
3. Commits the version change
4. Creates a Git tag (e.g., `v0.0.2`)

## Version Bump Types

The version bump type is determined by the PR title prefix:

### Patch Version (0.0.X) - Default
**Any PR without a specific prefix**

Examples:
- `Fix player bar alignment on mobile`
- `chore: update dependencies`
- `fix: resolve text truncation issue`

Use for:
- Bug fixes
- Minor improvements
- Documentation updates
- Dependency updates

### Minor Version (0.X.0)
**PR titles starting with `feat:`, `feature:`, or `minor:`**

Examples:
- `feat: add download button to player bar`
- `feature: implement dark mode`
- `minor: add new search filters`

Use for:
- New features
- Significant improvements
- New functionality that doesn't break existing code

### Major Version (X.0.0)
**PR titles starting with `BREAKING`, `major:`, or containing `BREAKING CHANGE`**

Examples:
- `BREAKING: redesign entire UI`
- `major: migrate to new API format`
- `feat: new authentication system (BREAKING CHANGE)`

Use for:
- Breaking changes
- Major redesigns
- API changes that affect existing functionality

## Version Tags

Each version bump creates a Git tag:
- `v0.0.2` (patch)
- `v0.1.0` (minor)
- `v1.0.0` (major)

These tags are useful for:
- Tracking releases
- Rolling back to specific versions
- Creating GitHub releases

## Examples

```bash
# Patch bump (0.0.1 -> 0.0.2)
PR Title: "Fix mobile layout issues"

# Minor bump (0.0.2 -> 0.1.0)
PR Title: "feat: add offline mode"

# Major bump (0.1.0 -> 1.0.0)
PR Title: "BREAKING: redesign player interface"
```

## Notes

- Version bumps happen automatically after PR merge
- The commit is marked with `[skip ci]` to avoid triggering another build
- Git tags are pushed to the remote repository
- The version in `package.json` is the source of truth
