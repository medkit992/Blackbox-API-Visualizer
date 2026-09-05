# Blackbox API Visualizer v0.4.0

## Request Stories

v0.4.0 replaces Blackbox's free-moving network graph with **Request Stories**: a stable visual debugging workspace designed to help developers understand a specific API call, learn what the browser actually observed, and move directly to useful evidence.

This release also carries forward all Request Debugger, source-correlation, response-provenance, and privacy work built for v0.3.0. v0.3.0 was superseded before production verification, so v0.4.0 is the next intended Chrome Web Store release after the currently verified v0.2.0 Stable build.

## Highlights

### Start with the problem

Request Stories organizes the captured session around useful questions:

- **Explore** — browse captured endpoints.
- **What failed?** — prioritize failed/no-response requests.
- **What is slow?** — surface slow captured calls.
- **What repeats?** — show endpoints called more than once without automatically declaring those calls accidental duplicates.

A searchable API-first request picker groups calls by method, host, and path while preserving access to the exact underlying requests.

### Follow one request from code to data

A selected request is explained as:

```text
Your code → HTTP exchange → Returned data
```

The three stages deliberately separate:

- source/initiator evidence Blackbox can observe;
- the HTTP request/response itself;
- the captured response content.

Blackbox does **not** treat an HTTP `200` as proof that later application parsing, property access, state updates, or rendering succeeded.

Each stage links into the same technical Request/Response/Timing inspector already used by the Requests table.

### Useful next steps

The story outcome includes deterministic **What to check next** actions based on the captured status/evidence. A 401 can direct the developer toward authentication evidence; a slow request can lead to timing; a successful response can lead to the Response Explorer rather than implying that the application is healthy.

### Connected evidence without fake causation

Request Stories can surface bounded connected-request evidence such as:

- a matching captured browser-initiator resource;
- preflight/redirect candidates supported by request metadata;
- an exact resource URL found inside an earlier **already-loaded** JSON response.

Requests that merely occurred close together are not connected automatically.

Loaded-response relationship search is bounded by candidate count, response size, traversal depth, and visited values. Request Stories does not fetch extra response bodies merely to create more relationships.

### Stable interaction

The active visual experience no longer uses a drag/zoom Cytoscape canvas.

Request Stories uses native DOM controls and ordinary scrolling, which removes the separate canvas-coordinate system that could make click targets feel offset after movement, resize, or zoom changes.

The current investigation also stays still while capture continues. New traffic increments **Refresh snapshot** instead of replacing/rearranging the selected story underneath the pointer.

### Responsive DevTools layout

The workspace adapts to both width and height:

- wide/full-size panels use horizontal space for evidence and timing;
- narrow side-docked panels use a dedicated request-picker switch and stacked story cards;
- short bottom-docked panes compact presentation chrome so the evidence remains reachable;
- extremely short panes allow the header/filter area to scroll away rather than permanently consuming the viewport;
- explanation text remains readable instead of relying on CSS zoom or clipped fixed-height cards;
- Privacy/consent actions remain reachable in short panes.

### Large-session bounds

Request Stories is designed to remain predictable during noisy sessions:

- newest **5,000** captured requests in the story analysis window;
- **40** endpoint groups rendered per page;
- stable selected story while incoming requests accumulate;
- full captured traffic remains available in the Requests table.

A 50,000-record simulated fixture is included as a bounded-work regression scenario; it is not presented as a real-device benchmark.

### Learning example

A local **Learning example** provides simulated traffic for:

- successful requests;
- authentication failure;
- slow requests;
- repeated endpoint calls;
- an API response containing the exact URL of a later resource.

The example is clearly labelled simulated, sends no network requests, and is isolated from the real captured session. Exiting restores the live selection/filter state.

## Request Debugger & source context carried forward

v0.4.0 includes the v0.3.0 debugging foundation:

- deterministic Request Diagnosis for successful requests and common HTTP/auth/routing/validation/rate-limit/server/network/cache/redirect/performance cases;
- evidence-backed category, severity, confidence, likely causes, and Things to Check;
- automatic selected-response retrieval;
- server-provided error-message extraction;
- privacy-safe **Copy Debug Summary**;
- Chromium initiator-stack preservation and readable browser-initiator formatting;
- source-map and common Webpack development-module correlation back to authored JS/JSX/TS/TSX/Vue/Svelte/Astro sources when reliable evidence is available;
- exact derived-resource provenance such as `GET /explore → data[2].authorImage`;
- separate **Start debugging in / Likely source**, **Relationship**, **Browser initiator**, and **Generated location** evidence;
- bounded same-origin source-map discovery for captured scripts.

## Response Explorer

The existing visual Response Explorer remains available:

- Tree / Raw views;
- collapsible JSON objects/arrays;
- value types;
- JavaScript response paths;
- Copy Path;
- graceful handling of non-JSON, image, empty, loading, and unavailable response bodies.

## Testing and verification

The v0.4.0 feature branch is covered by the normal repository checks:

- clean `npm ci` dependency installation;
- source and test TypeScript checks;
- full Vitest suite;
- production Vite build;
- extension bundle verification;
- package/lock/source-manifest/built-manifest version alignment.

Request Stories adds **37 model regression tests** plus optional Chromium fixtures covering native hit targets, scrolling, resizing, narrow/short layouts, simulated zoom/device scaling, stable snapshot behavior, example isolation, escaping, and packaged-panel integration with mocked DevTools APIs.

These automated/browser-fixture checks do not replace verification of the exact unpacked and Chrome Web Store packages on real sites.

## Privacy and security

v0.4.0 does not add a new remote service, broad host permission, request replay mechanism, or new response-fetch behavior for Request Stories.

- Captured traffic/source analysis remains local to the DevTools extension session.
- Selected response bodies are retrieved by the existing debugger from requests already captured by DevTools.
- Request Stories uses already-loaded response content for exact response-data relationships; unloaded bodies are skipped rather than fetched solely for the story.
- Source-map discovery remains bounded to associated same-origin script maps under the v0.3.0 privacy model.
- The Learning example is local simulated data.
- Request-controlled story strings are escaped before rendered HTML insertion.
- Copy Debug Summary continues to omit raw headers, cookies, authorization values, request bodies, response bodies, and source snippets.

Users updating directly from the current v0.2.0 Stable build to v0.4.0 will receive the refreshed consent disclosure introduced with the v0.3.0 response/source/provenance capabilities before recording resumes.

See [`PRIVACY.md`](../PRIVACY.md) for the complete disclosure.

## Known limitations

- Source correlation is best-effort and depends on source maps/dev-server metadata/source availability.
- Production/minified deployments may expose only generated locations.
- Request Stories does not observe arbitrary application state after the network response.
- Connected-request evidence is intentionally conservative and may show no relationship when evidence is insufficient.
- Exact response-data relationships require the relevant upstream response body to have already been loaded.
- The legacy graph helper files/Cytoscape dependency remain in the repository temporarily, but the v0.4.0 panel no longer uses the old canvas graph.

## Release verification

The exact merged/tagged package must remain classified as **Preview / release candidate** until:

1. the release ZIP is built from the intended merged/tagged commit;
2. the exact ZIP/extracted contents pass local unpacked verification;
3. the package is submitted through the Chrome Web Store;
4. the actual Web Store-installed build passes the Stable release gate.

The v0.4.0 release-verification issue is the source of truth for that final promotion.
