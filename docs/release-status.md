# Current Release Status

This file is the human-readable source of truth for which Blackbox builds are recommended.

| Version | Stage | Channel | Health | Recommendation |
| --- | --- | --- | --- | --- |
| `v0.2.0` | Preview / release candidate | Local / GitHub packaging; Production verification pending | Working in local verification | Test/package now; mark Stable only after Chrome Web Store verification |
| `v0.1.2` | Stable | Production (Chrome Web Store) | Working | Current recommended production release until v0.2.0 passes production verification |
| `v0.1.1` | Retired / superseded | Production history | Superseded by v0.1.2 | Do not recommend over v0.1.2 |
| `v0.1.0` | Retired | Production (Chrome Web Store) | Broken | Do not recommend |

## Current recommendation

`v0.1.2` is the current **Stable** production release.

`v0.2.0` is feature-complete for its planned response-explorer release and is the current **Preview / release candidate**. The source manifest and package version are `0.2.0`; the release should remain non-stable until the exact packaged build is submitted through the Chrome Web Store and that distributed build passes the Stable gate in [`docs/release-policy.md`](release-policy.md).

### v0.2.0 release focus

- Collapsible JSON response tree.
- Tree / Raw response modes.
- Object, array, primitive, and null type presentation.
- Selected-value inspection.
- JavaScript path generation with array indexes and safe bracket notation for non-identifier keys.
- One-click Copy Path.
- Graceful fallback for non-JSON, image, empty, loading, and unavailable response bodies.

## Updating this file

When a release changes state:

1. Update its Stage, Channel, Health, and Recommendation here.
2. Update the release-status block in the root README.
3. Record the verification result in a release-verification issue.
4. When GitHub Releases are used, keep the corresponding release notes consistent with this status.
5. Never erase a broken release from history; mark it Retired/Broken and direct users to the recommended version.
