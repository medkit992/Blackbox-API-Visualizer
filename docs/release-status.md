# Current Release Status

This file is the human-readable source of truth for which Blackbox builds are recommended.

| Version | Stage | Channel | Health | Recommendation |
| --- | --- | --- | --- | --- |
| `v0.1.1` | Preview / production candidate | Local; Production verification pending | Unknown pending Web Store verification | Candidate to become the first Stable release |
| `v0.1.0` | Retired | Production (Chrome Web Store) | Broken | Do not recommend |

## Current recommendation

There is **no formally verified Stable release yet**.

`v0.1.1` is the current repository version and should become the first Stable release only after the exact Chrome Web Store build passes [release verification issue #14](https://github.com/medkit992/Blackbox-API-Visualizer/issues/14) and the Stable gate defined in [`docs/release-policy.md`](release-policy.md).

## Updating this file

When a release changes state:

1. Update its Stage, Channel, Health, and Recommendation here.
2. Update the release-status block in the root README.
3. Record the verification result in a release-verification issue.
4. When GitHub Releases are used, keep the corresponding release notes consistent with this status.
5. Never erase a broken release from history; mark it Retired/Broken and direct users to the recommended version.
