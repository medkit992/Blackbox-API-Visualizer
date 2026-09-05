# Changelog

All notable user-facing changes to Blackbox API Visualizer are documented here.

Blackbox is pre-1.0; minor releases may still evolve quickly while the core workflow stabilizes.

## [0.4.0] - 2026-09-05

### Added

- **Request Stories**, a symptom-first visual debugging workspace that replaces the free-moving network graph as the active visual experience.
- Quick investigation views for **Explore**, **What failed?**, **What is slow?**, and **What repeats?**.
- A searchable API-first request picker that groups captured calls by method, host, and path while retaining access to the underlying requests.
- A three-stage explanation for a selected request: **Your code → HTTP exchange → Returned data**.
- Status-specific **What to check next** actions that open the exact request in the existing Blackbox debugger, Request, Response, or Timing view.
- Evidence-backed connected-request context for captured initiator resources, redirect/preflight candidates, and exact resource URLs already present in loaded JSON responses.
- A measured timing breakdown that distinguishes unavailable phases from measured zero-duration phases and avoids double-counting SSL time.
- A recent-call view for an endpoint without assuming repeated calls are accidental duplicates.
- A local **Learning example** with simulated successful, failed, slow, repeated, and response-to-resource request cases.
- Dedicated Request Stories architecture documentation and 37 model regression tests.
- Optional browser regression fixtures for native hit targets, scrolling, resizing, viewport containment, narrow layouts, and packaged-panel behavior.

### Changed

- Replaced drag/zoom canvas navigation with native DOM controls and ordinary scrolling so request selection remains aligned after scrolling, resizing, and zoom changes.
- Request Stories now uses stable snapshots: newly captured traffic increments a refresh count instead of moving the selected investigation underneath the pointer.
- Large sessions use a bounded recent analysis window and paged endpoint rendering rather than trying to display every captured call at once.
- Request Stories adapts to both panel width and height, including narrow side-docked and short bottom-docked DevTools layouts.
- Wide panels use available horizontal space for evidence and timing instead of oversized empty presentation areas.
- Short panels compact presentation chrome while preserving readable explanation text and native hit targets.
- The Privacy/consent dialog remains scrollable so Accept, Close, and Revoke controls stay reachable in short DevTools panes.
- v0.4.0 includes all v0.3.0 Request Debugger/source-context work and supersedes the unfinished v0.3.0 release candidate before that version was promoted to Stable.

### Performance / reliability

- Request Stories does no canvas layout work and does not continuously reposition visible items as traffic arrives.
- Analysis is bounded to the newest 5,000 captured requests, with endpoint cards rendered in pages of 40.
- Selected-story DOM remains stable until the user explicitly refreshes the snapshot.
- Asynchronous response/source callbacks are generation-guarded so stale work cannot overwrite a newer selection after Clear or navigation.

### Security / privacy

- Request Stories introduces no new host permissions or remote service.
- It does not replay captured requests.
- It does not load additional response bodies merely to discover story relationships; exact response-data relationships use response content already loaded by the existing debugger.
- Relationship wording remains conservative: temporal proximity alone is never presented as proof of causation.
- The simulated Learning example is local and isolated from the inspected page's captured traffic.

## [0.3.0] - 2026-08-28

### Added

- Request Diagnosis debugger for successful and problematic requests.
- Deterministic diagnostic catalog covering common HTTP/auth/routing/validation/rate-limit/server/network/cache/redirect/payload/performance cases.
- Evidence-backed confidence labels, likely causes, and concrete debugging suggestions.
- Automatic selected-response retrieval so diagnosis and the Response Explorer can use the same captured response context.
- Server error-message extraction from useful JSON/text responses.
- Privacy-safe **Copy Debug Summary**.
- Chromium initiator-stack preservation and readable browser-initiator formatting.
- Source-map resolution back to authored JS/JSX/TS/TSX/Vue/Svelte/Astro source when reliable evidence exists.
- Common Webpack development-module/sourceURL correlation.
- Exact derived-resource provenance from resource requests back to earlier Fetch/XHR response values and JavaScript-style response paths.
- Separate **Start debugging in / Likely source**, **Relationship**, **Browser initiator**, and **Generated location** evidence.
- Bounded same-origin source-map discovery associated with captured scripts.
- GitHub Sponsors link in the DevTools top bar.
- Dedicated release-verification issue/checklist for v0.3.0.

### Changed

- Request details now prioritize the debugger/diagnosis experience while preserving Request, Response, Headers, and Timing tabs.
- Blackbox panel scrolling and request-inspector sizing were reworked for laptop-sized DevTools windows.
- Successful requests receive explicit success diagnostics rather than an empty/error-only debugger.
- Generated filenames/functions are normalized for readability while exact generated locations remain available.
- Source-correlation behavior is conservative: ambiguous matches fall back instead of being guessed.
- Privacy/consent documentation now covers automatic selected-response retrieval, bounded provenance inspection, source resources/source maps, and same-origin source-map discovery.
- Consent storage is versioned for the expanded v0.3.0 data-access disclosure; users who consented under the older release are prompted once to accept the updated disclosure before capture resumes.

### Fixed

- Build-hash filename normalization no longer shortens names such as `fetch-utilities-<hash>.js` to `fetch.js`.
- Responsive request-details placement no longer depends on a brittle fixed top offset.
- Outer DevTools panel scrolling now remains usable when Session Insights/toolbars consume vertical space.

### Security / privacy

- Captured traffic/source analysis remains local to the DevTools extension session.
- Copy Debug Summary omits raw headers, cookies, authorization values, request bodies, response bodies, and source snippets.
- Same-origin source-map discovery is bounded to maps associated with captured scripts and does not add a broad host permission.
- Source/provenance analysis is bounded and refuses ambiguous source attribution.

`v0.3.0` was superseded by `v0.4.0` before completing production/Stable verification. Its functionality is included in v0.4.0.

## [0.2.0]

- Added the visual Tree / Raw Response Explorer.
- Added collapsible JSON objects/arrays, value-type display, JavaScript response-path generation, and Copy Path.
- Added graceful fallbacks for non-JSON, image, empty, loading, and unavailable response bodies.
- Verified through the Chrome Web Store and remains the current Stable production release until a later Web Store build passes the Stable gate.

## [0.1.2]

- Capture/reliability patch previously verified through the Chrome Web Store.
- Superseded by the verified v0.2.0 Stable release.

## [0.1.1]

- Superseded by later releases.

## [0.1.0]

- Initial Chrome Web Store release.
- Retired after a production/distribution defect prevented the advertised core functionality from working correctly.
