# Current Release Status

This file is the human-readable source of truth for which Blackbox builds are recommended.

| Version | Stage | Channel | Health | Recommendation |
| --- | --- | --- | --- | --- |
| `v0.3.0` | Preview / release candidate | Local / trusted testing; Chrome Web Store submission next | Working in automated/manual testing | Test/package now; mark Stable only after Chrome Web Store verification |
| `v0.1.2` | Stable | Production (Chrome Web Store) | Working | Current recommended production release until v0.3.0 passes production verification |
| `v0.2.0` | Superseded candidate | Local / GitHub history | Response Explorer work carried forward into v0.3.0 | Do not ship separately; verify through v0.3.0 |
| `v0.1.1` | Retired / superseded | Production history | Superseded by v0.1.2 | Do not recommend over v0.1.2 |
| `v0.1.0` | Retired | Production history | Broken | Do not recommend |

## Current recommendation

`v0.1.2` remains the current **Stable / Production / Working** release until the exact `v0.3.0` Chrome Web Store package is reviewed, installed from the store, and passes the Stable release gate.

`v0.3.0` is the current **Preview / release candidate**. Automated CI passes and manual testing is underway, including an extended real-world tester pass. Track the release checklist in [issue #18](https://github.com/medkit992/Blackbox-API-Visualizer/issues/18).

### v0.3.0 release focus

- Deterministic Request Diagnosis for successful and problematic requests.
- Evidence, category, confidence, likely causes, and concrete debugging suggestions.
- Automatic local response-body loading when a captured request is selected.
- Privacy-safe Copy Debug Summary.
- Chromium initiator-stack preservation and readable browser-initiator context.
- Authored-source correlation through source maps and common Webpack development-module metadata.
- Exact derived-resource provenance through earlier Fetch/XHR response values.
- Separate debugging source, relationship, browser initiator, and generated location evidence.
- Bounded same-origin source-map discovery for captured scripts when DevTools has not already exposed the map.
- Laptop-sized DevTools layout/scroll improvements.
- Updated privacy/consent disclosures for response/source/provenance analysis.

## Known release-candidate limitations

These limitations are expected and do not automatically make the release broken:

- Authored-source resolution is best-effort and depends on source maps, dev-server metadata, and available source resources.
- Production/minified builds may only expose generated locations.
- Ambiguous source matches intentionally fall back instead of guessing.
- Blackbox does not perform framework-specific component analysis or arbitrary third-party source fetching.

## Updating this file

When a release changes state:

1. Update its Stage, Channel, Health, and Recommendation here.
2. Update the release-status block in the root README.
3. Record the verification result in the corresponding release-verification issue.
4. Keep GitHub Release notes consistent with the shipped feature/privacy behavior.
5. Never erase a broken/superseded release from history; mark it Retired/Superseded and direct users to the recommended version.
