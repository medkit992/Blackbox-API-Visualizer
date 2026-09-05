# Current Release Status

This file is the human-readable source of truth for which Blackbox builds are recommended.

| Version | Stage | Channel | Health | Recommendation |
| --- | --- | --- | --- | --- |
| `v0.4.0` | Preview / release candidate | Local / trusted testing; Chrome Web Store submission next | Working in automated/manual testing | Package and submit after merge; mark Stable only after the actual Web Store build passes verification |
| `v0.3.0` | Retired / superseded Preview | Local/testing history | Working, but superseded before production verification | Do not ship separately; its debugger/source-context work is included in v0.4.0 |
| `v0.2.0` | Stable | Production (Chrome Web Store) | Working / verified | Current recommended production release until v0.4.0 passes production verification |
| `v0.1.2` | Retired / superseded Stable | Production history | Working, superseded by v0.2.0 | Do not recommend over v0.2.0 |
| `v0.1.1` | Retired / superseded | Production history | Superseded by later releases | Do not recommend |
| `v0.1.0` | Retired | Production history | Broken | Do not recommend |

## Current recommendation

`v0.2.0` remains the current **Stable / Production / Working** Chrome Web Store release until the exact `v0.4.0` package is submitted, installed from the Chrome Web Store, and passes the Stable release gate.

`v0.4.0` is the current **Preview / release candidate**. It combines the v0.3.0 Request Debugger/source-context work with the new Request Stories visual debugging workspace. Track its release gate in the v0.4.0 release-verification issue.

`v0.3.0` is retired as a **superseded Preview**. It was never promoted to Stable through the production verification path; its functionality is carried forward into v0.4.0 rather than shipping a second intermediate Web Store build.

### v0.4.0 release focus

#### Request Stories

- Replaces the free-moving network graph with a stable, readable visual debugging workspace.
- Starts from useful debugging questions: **What failed?**, **What is slow?**, and **What repeats?**.
- Explains a selected request as **Your code → HTTP exchange → Returned data**.
- Links status-specific next steps directly into the existing request debugger and technical tabs.
- Shows evidence-backed connected-request context without treating timing proximity as causation.
- Adds measured timing explanations and recent endpoint-call comparison.
- Uses stable snapshots so newly captured traffic does not move the current investigation.
- Includes a local simulated Learning example.
- Adapts to wide, narrow, short, and zoomed DevTools layouts using native DOM controls and scrolling.
- Bounds large-session analysis and endpoint rendering for predictable performance.

#### Request Debugger / source context carried forward from v0.3.0

- Deterministic Request Diagnosis for successful and problematic requests.
- Evidence, category, confidence, likely causes, and concrete debugging suggestions.
- Automatic local response-body loading when a captured request is selected.
- Privacy-safe Copy Debug Summary.
- Chromium initiator-stack preservation and readable browser-initiator context.
- Authored-source correlation through source maps and common Webpack development-module metadata.
- Exact derived-resource provenance through earlier Fetch/XHR response values.
- Separate debugging source, relationship, browser initiator, and generated-location evidence.
- Bounded same-origin source-map discovery for captured scripts when DevTools has not already exposed the map.
- Updated privacy/consent disclosures and versioned consent for the expanded response/source/provenance behavior introduced in v0.3.0.

## Known release-candidate limitations

These limitations are expected and do not automatically make the release broken:

- Authored-source resolution is best-effort and depends on source maps, dev-server metadata, and available source resources.
- Production/minified builds may only expose generated locations.
- Ambiguous source matches intentionally fall back instead of guessing.
- Request Stories does not claim to observe application state after a network response unless Blackbox has direct evidence.
- Connected-request evidence is conservative; temporal proximity alone does not create a relationship.
- Exact response-data relationships only use response bodies already loaded by the existing debugger; Request Stories does not fetch extra bodies solely for relationship discovery.
- Blackbox does not perform framework-specific component analysis or arbitrary third-party source fetching.

## Updating this file

When a release changes state:

1. Update its Stage, Channel, Health, and Recommendation here.
2. Update the release-status block in the root README.
3. Record the verification result in the corresponding release-verification issue.
4. Keep GitHub Release notes consistent with the shipped feature/privacy behavior.
5. Never erase a broken/superseded release from history; mark it Retired/Superseded and direct users to the recommended version.
