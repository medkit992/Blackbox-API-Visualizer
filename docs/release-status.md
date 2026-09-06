# Current Release Status

This file is the human-readable source of truth for which Blackbox builds are recommended.

| Version | Stage | Channel | Health | Recommendation |
| --- | --- | --- | --- | --- |
| `v0.5.0` | Preview / release candidate | Local / trusted testing; Chrome Web Store submission next | Working in automated testing; owner release-package verification still required | Merge/package/submit after final owner smoke test; mark Stable only after the actual Web Store build passes verification |
| `v0.4.0` | Retired / superseded Preview | Local/testing history | Working, but superseded before production promotion | Do not ship separately; Request Stories/debugger work is included in v0.5.0 |
| `v0.3.0` | Retired / superseded Preview | Local/testing history | Working, but superseded before production verification | Do not ship separately; its debugger/source-context work is included in v0.5.0 |
| `v0.2.0` | Stable | Production (Chrome Web Store) | Working / verified | Current recommended production release until v0.5.0 passes production verification |
| `v0.1.2` | Retired / superseded Stable | Production history | Working, superseded by v0.2.0 | Do not recommend over v0.2.0 |
| `v0.1.1` | Retired / superseded | Production history | Superseded by later releases | Do not recommend |
| `v0.1.0` | Retired | Production history | Broken | Do not recommend |

## Current recommendation

`v0.2.0` remains the current **Stable / Production / Working** Chrome Web Store release until the exact `v0.5.0` package is submitted, installed from the Chrome Web Store, and passes the Stable release gate.

`v0.5.0` is the current **Preview / release candidate**. It combines the debugger/source-context foundation, Request Stories, the new full-width workspace/navigation system, Dashboard, and the evidence-first Request Lifecycle. Track its release gate in the v0.5.0 release-verification issue.

`v0.4.0` is retired as a **superseded Preview**. It was not promoted to Stable before v0.5.0 replaced it; its Request Stories and debugger/source-context functionality is carried forward into v0.5.0.

`v0.3.0` remains retired as a **superseded Preview**. It was never promoted to Stable through the production verification path.

## v0.5.0 release focus

### Workspace / navigation

- Adds a Dashboard landing page for session health, recent requests, top endpoints/domains, and actionable problems.
- Keeps Requests focused on finding traffic with search, filters, and bounded pagination.
- Keeps Request Stories focused on symptom-first visual investigation and stable snapshots.
- Replaces the cramped persistent side inspector with a full-width selected-request workspace.
- Separates **Summary / Lifecycle / Diagnose / Request / Response / Timing / Headers** into focused request destinations.
- Restores originating workspace context when leaving an investigation.
- Preserves mounted Response Explorer and lifecycle state across request-level navigation.
- Adapts to narrow side-docked and short bottom-docked DevTools panels.

### Request Lifecycle

- Shows **Initiator → Request → Send → Wait → Response → Parse → Data ready → Use data → back to code**.
- Uses a circular SVG track with native DOM controls on roomy panels and a vertical stepper on compact panels.
- Makes each checkpoint selectable and connects it to plain-language evidence and the relevant technical Blackbox view.
- Separates HTTP/network evidence from application parsing/data-use state.
- Keeps unsupported application stages explicitly **Not observed** instead of inventing application telemetry.
- Includes isolated teaching examples for successful, HTTP-error-with-JSON, and parse-failure flows.

### Request Stories / debugger / response tools carried forward

- Symptom-first Request Stories with stable snapshots, evidence-backed relationships, measured timing, and bounded large-session work.
- Deterministic Request Diagnosis with evidence, category, confidence, likely causes, and concrete debugging suggestions.
- Automatic local response-body loading when a captured request is selected.
- Privacy-safe Copy Debug Summary.
- Chromium initiator-stack preservation and authored-source correlation where evidence supports it.
- Exact derived-resource provenance through earlier Fetch/XHR response values.
- Visual Response Explorer with Tree / Raw views and copyable JavaScript paths.

## Known release-candidate limitations

These limitations are expected and do not automatically make the release broken:

- Live **Parse / Data ready / Use data** lifecycle checkpoints are not application telemetry and remain unknown unless direct evidence exists.
- Issue #9 remains open for a possible future opt-in application observer; v0.5.0 does not wrap `fetch`, Promises, `Response` readers, or arbitrary property access.
- Authored-source resolution is best-effort and depends on source maps, dev-server metadata, and available source resources.
- Production/minified builds may only expose generated locations.
- Ambiguous source matches intentionally fall back instead of guessing.
- Connected-request evidence remains conservative; temporal proximity alone does not create a relationship.
- Exact response-data relationships only use response bodies already loaded by the existing debugger.
- Blackbox does not perform framework-specific component analysis or arbitrary third-party source fetching.

## Updating this file

When a release changes state:

1. Update its Stage, Channel, Health, and Recommendation here.
2. Update the release-status block in the root README.
3. Record the verification result in the corresponding release-verification issue.
4. Keep GitHub Release notes consistent with the shipped feature/privacy behavior.
5. Never erase a broken/superseded release from history; mark it Retired/Superseded and direct users to the recommended version.
