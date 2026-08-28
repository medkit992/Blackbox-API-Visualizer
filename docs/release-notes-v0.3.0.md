# Blackbox API Visualizer v0.3.0

## Request Debugger & Source Context

v0.3.0 turns Blackbox from a network visualizer into a more complete debugging assistant. A selected request can now explain what happened, show the evidence behind that explanation, trace derived resources back to earlier API data, and—when the browser exposes enough source information—point to the authored file/function where debugging should begin.

### Highlights

- **Request Diagnosis** for successful requests and common HTTP/auth/routing/validation/rate-limit/server/network/cache/redirect/performance problems.
- Evidence-backed **category, severity, confidence, likely causes, and Things to Check**.
- Automatic selected-response retrieval so server-provided error context can strengthen a diagnosis.
- **Copy Debug Summary** for sharing useful debugging context without dumping raw secrets/bodies.
- Chromium initiator-stack preservation and readable browser-initiator formatting.
- Source-map and common Webpack development-module correlation back to authored JS, JSX, TS, TSX, Vue, Svelte, Astro, and related sources when reliable evidence is available.
- Exact derived-resource provenance, for example:

  `GET /explore → data[2].authorImage`

- Separate source evidence for:
  - **Start debugging in / Likely source**
  - **Relationship**
  - **Browser initiator**
  - **Generated location**
- Bounded same-origin source-map discovery for captured scripts when DevTools has not already exposed the map.
- Improved DevTools scrolling/request-inspector layout for laptop-sized panels.
- GitHub Sponsors link in the Blackbox top bar.

### Response Explorer

The v0.2.0 Response Explorer is included in v0.3.0:

- Tree / Raw JSON views
- collapsible objects/arrays
- value types
- JavaScript response paths
- Copy Path
- graceful non-JSON/image/empty/unavailable fallbacks

### Privacy and security

v0.3.0 expands the local context Blackbox can inspect, so its consent/privacy disclosures were updated accordingly.

- Selected response bodies are retrieved automatically from the request already captured by DevTools.
- Derived-resource tracing may inspect a bounded set of recent successful Fetch/XHR response bodies for exact URL relationships.
- Source correlation may inspect source resources/source maps exposed by DevTools.
- For a captured generated script, Blackbox may attempt the conventional sibling `.map` file **only on the inspected site's same origin** when DevTools did not already expose the map.
- Captured traffic/source content is not sent to a Blackbox-operated backend.
- Copy Debug Summary intentionally omits raw headers, cookies, authorization values, request bodies, response bodies, and source snippets.
- Ambiguous source matches are rejected rather than guessed.

See [`PRIVACY.md`](../PRIVACY.md) for the complete disclosure.

### Known limitations

Source correlation is best-effort. Some production/minified sites do not publish source maps or enough initiator metadata to recover authored code. In those cases Blackbox deliberately falls back to the best generated/browser location available.

Blackbox does not perform framework-specific component analysis, arbitrary third-party source fetching, or general-purpose static analysis in this release.

### Verification

Release verification is tracked in [issue #18](https://github.com/medkit992/Blackbox-API-Visualizer/issues/18).

The repository's CI validates:

- clean dependency installation;
- TypeScript type checking;
- automated tests;
- production build;
- package/lock/source-manifest/built-manifest version alignment;
- production bundle structure.

The exact Chrome Web Store package should remain classified as **Preview / release candidate** until the distributed Web Store build is installed and passes the Stable release gate.
