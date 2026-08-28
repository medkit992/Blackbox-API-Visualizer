# Changelog

All notable user-facing changes to Blackbox API Visualizer are documented here.

Blackbox is pre-1.0; minor releases may still evolve quickly while the core workflow stabilizes.

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

## [0.2.0]

- Added the visual Tree / Raw Response Explorer.
- Added collapsible JSON objects/arrays, value-type display, JavaScript response-path generation, and Copy Path.
- Added graceful fallbacks for non-JSON, image, empty, loading, and unavailable response bodies.
- Verified through the Chrome Web Store and is the current Stable production release until v0.3.0 completes production verification.

## [0.1.2]

- Capture/reliability patch previously verified through the Chrome Web Store.
- Superseded by the verified v0.2.0 Stable release.

## [0.1.1]

- Superseded by later releases.

## [0.1.0]

- Initial Chrome Web Store release.
- Retired after a production/distribution defect prevented the advertised core functionality from working correctly.
