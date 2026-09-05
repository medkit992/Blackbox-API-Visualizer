# Blackbox API Visualizer

[![CI](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml)

Blackbox is an open-source Chromium DevTools extension for capturing, inspecting, explaining, and visually tracing the network activity of the page you are debugging.

Blackbox combines deterministic request diagnostics, source context, exact response/resource provenance, session-level pattern detection, a visual **Request Stories** debugging workspace, and a Response Explorer that turns nested JSON into navigable JavaScript data paths.

## Release status

| Status | Version | Channel | Health |
| --- | --- | --- | --- |
| **Release candidate** | `v0.4.0` | Local / trusted testing; Chrome Web Store submission next | Working in automated and manual testing |
| **Latest Stable** | `v0.2.0` | Chrome Web Store | Working / verified |
| **Superseded Preview** | `v0.3.0` | Local/testing history | Working; functionality included in v0.4.0 |
| **Superseded Stable** | `v0.1.2` | Chrome Web Store history | Working, superseded by v0.2.0 |
| **Retired** | `v0.1.0` | Chrome Web Store history | **Broken — do not recommend** |

`v0.4.0` remains **Preview / release candidate** until the exact packaged build is submitted to the Chrome Web Store and the distributed build passes the [Stable release gate](docs/release-policy.md). See the [current release status](docs/release-status.md) and the v0.4.0 release-verification issue for the source-of-truth release state.

`v0.3.0` was superseded before production verification. Its Request Debugger/source-context functionality is included in v0.4.0, so it does not need a separate Web Store release.

## What's new in v0.4.0

### Request Stories

The old free-moving network graph has been replaced by a stable visual debugging workspace designed around questions a developer actually asks.

Start with:

- **Explore** — browse captured API endpoints;
- **What failed?** — prioritize requests with HTTP/network problems;
- **What is slow?** — find calls taking more than the current slow threshold;
- **What repeats?** — find endpoints called multiple times without automatically declaring those calls accidental duplicates.

Choose a request and Blackbox explains it as:

```text
Your code → HTTP exchange → Returned data
```

Each stage links into the same technical request inspector used by the Requests table.

Request Stories also provides:

- a searchable API-first request picker;
- plain-language request outcome explanations;
- status-specific **What to check next** actions;
- measured request-timing breakdowns;
- recent calls to the selected endpoint;
- evidence-backed connected-request context when Blackbox can verify it;
- stable snapshots so incoming traffic does not move the investigation underneath the pointer;
- a local simulated **Learning example**;
- width- and height-responsive layouts for side-docked, bottom-docked, narrow, short, and zoomed DevTools panels.

### Evidence instead of invented causation

Request Stories deliberately avoids turning a busy session into a speculative dependency diagram.

Connected evidence can include:

- a captured browser-initiator resource that matches another request;
- redirect/preflight candidates supported by request metadata;
- exact resource URLs found inside an earlier **already-loaded** JSON response.

Requests occurring close together are not automatically considered related. Request Stories also does not claim that an HTTP `200` proves the application later parsed or rendered the data correctly.

### Stable interaction and bounded performance

Request Stories uses ordinary DOM controls and native scrolling rather than a transformed canvas. This avoids canvas-coordinate hit-target drift after scrolling, resizing, or zoom changes.

For large sessions:

- analysis is bounded to the newest 5,000 captured requests;
- endpoint cards are rendered in pages of 40;
- the selected story stays in place as new traffic arrives;
- incoming calls update a refresh counter rather than forcing a live rearrangement;
- the complete captured request collection remains available in the Requests view.

### Request Debugger and source context

v0.4.0 also carries forward all of the v0.3.0 debugger work:

- deterministic **Request Diagnosis** for successful and problematic requests;
- common HTTP, authentication, routing, validation, rate-limit, server, network, cache, redirect, payload, and performance explanations;
- evidence, diagnostic category, confidence, likely causes, and concrete things to check;
- automatic selected-response retrieval;
- privacy-safe **Copy Debug Summary**;
- Chromium initiator-stack preservation;
- source-map and common Webpack development-module correlation back to authored source when reliable evidence is available;
- exact derived-resource provenance through earlier Fetch/XHR response values;
- truthful generated/browser fallbacks when authored source cannot be resolved.

### Response Explorer

The visual Response Explorer remains available:

- Tree / Raw JSON views;
- collapsible objects and arrays;
- value types;
- JavaScript response paths;
- Copy Path;
- graceful non-JSON, image, empty, loading, and unavailable-response fallbacks.

## What it does

- Captures completed DevTools network requests in real time.
- Normalizes Chromium/HAR-style request data into a stable internal model.
- Filters traffic by resource type and errors.
- Inspects request metadata, query parameters, headers, bodies, timing, priority, initiator, source context, and server information.
- Loads captured response bodies locally when a request is selected rather than replaying the network request.
- Explores JSON responses as a collapsible tree with copyable JavaScript property paths.
- Diagnoses useful per-request conditions such as authentication failures, rate limits, missing routes, validation failures, server failures, large payloads, redirects, cache hits, and slow requests.
- Correlates requests to authored source and related API responses when reliable local evidence is available.
- Detects session-level patterns including duplicate bursts, polling, repeated errors, endpoint frequency, and domain traffic.
- Turns selected API traffic into a stable Request Story with outcome, evidence, timing, related-request context, and useful next debugging steps.

## Source-correlation limits

Source correlation is best-effort by design. Source maps, authored sources, and useful stack information are not available on every site or build.

Blackbox prefers evidence in roughly this order:

1. authored source-map/module evidence;
2. exact relationship to an earlier API response plus the source of that API request;
3. useful Chromium stack/initiator frames;
4. normalized generated bundle locations;
5. the browser initiator type as a final fallback.

Blackbox does not rename generated `.js` files to `.ts`, `.tsx`, `.jsx`, or another source language based on framework guesses. If the evidence is ambiguous, it keeps the generated fallback rather than inventing a source file.

## Request Stories behavior

Request Stories is intentionally not a giant live dependency graph.

The workflow is:

1. Choose the symptom or browse endpoints.
2. Select a captured request/endpoint.
3. Read the request outcome.
4. Follow **Your code → HTTP exchange → Returned data**.
5. Use **What to check next** to open the most relevant technical evidence.
6. Review connected requests only when Blackbox has evidence for the relationship.
7. Refresh the snapshot when you want newly captured calls included.

The Requests table remains the authoritative full captured dataset. Request Stories is a bounded explanation/projection over that data, not a reduced capture mode.

## Install from source

### Requirements

- Node.js 22+
- npm
- A Chromium-based browser such as Chrome or Edge

### Build and test

```bash
npm ci
npm run typecheck
npm test
npm run build
```

For automatic rebuilds while developing:

```bash
npm run watch
```

### Load the extension

1. Build the project.
2. Open your browser's extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the generated `dist` directory.
6. Open DevTools on any page and select the **Blackbox** panel.

After rebuilding extension code, reload the unpacked extension and reopen DevTools.

## Development commands

```bash
npm run build
npm run watch
npm run typecheck
npm test
```

CI performs a clean install, typecheck, full test run, production build, and extension-bundle verification.

## Architecture

```text
Chromium DevTools network/source APIs
               ↓
        capture + parser
               ↓
       NormalizedRequest
        ↙            ↘
request analyzer  session analyzer
        ↓
 diagnostic analyzer
        ↓
 source/provenance context
        ↓
 request debugger + response explorer

NormalizedRequest[]
        ↓
 requestStory.ts
        ↓
 request-stories.ts
        ↓
 Request Stories UI
```

See [docs/architecture.md](docs/architecture.md) for the responsibilities and privacy boundaries, and [docs/request-stories.md](docs/request-stories.md) for the Request Stories model, evidence rules, performance bounds, and acceptance guidance.

## Privacy and security

Blackbox's core function requires it to inspect sensitive network and website context from the page currently open in DevTools. Depending on the inspected application, that can include URLs, headers, authentication information, cookies, request/response bodies, and application source code/source maps.

Blackbox processes this context locally in the DevTools extension and does not send captured traffic or inspected source content to a Blackbox-operated backend. Selecting a request automatically retrieves its captured response body. Derived-resource tracing may inspect a bounded set of recent successful Fetch/XHR responses, and source correlation may inspect DevTools-exposed source resources plus bounded same-origin source maps associated with captured scripts.

Request Stories does **not** load additional response bodies merely to build relationships and does not replay requests. Its Learning example uses local simulated data and does not contact the inspected page.

The built-in Copy Debug Summary intentionally omits raw headers, cookies, authorization values, and request/response bodies.

See [PRIVACY.md](PRIVACY.md) for the full data-handling disclosure and [SECURITY.md](SECURITY.md) for vulnerability-reporting guidance.

## Contributing

Contributions are welcome. Start with [docs/contributing.md](docs/contributing.md), which covers setup, project boundaries, testing expectations, and pull request guidance.

Good contribution areas include:

- new deterministic request/session analyzers with low false-positive rates;
- source-map/bundler correlation with conservative fallbacks;
- Request Stories evidence, performance, accessibility, and responsive behavior;
- richer response exploration and formatting;
- browser compatibility fixes;
- tests and realistic network fixtures;
- accessibility and keyboard navigation.

## Roadmap

See [Roadmap: Blackbox API Visualizer v1.0.0](https://github.com/medkit992/Blackbox-API-Visualizer/issues/13) for the planned product direction and v1 feature set.

The Response Explorer (#4) shipped in v0.2.0, the Request Debugger (#6) was built in v0.3.0 and is carried forward in v0.4.0, and the visual request-flow work (#3) ships as Request Stories in v0.4.0. Deeper source inspection remains tracked in #17. The request-feed redesign (#2), Simple/Technical modes (#10), contextual explanations (#21), and the broader final usability/performance polish are intentionally reserved for the v1.0.0 student-ready release pass.

## Support development

If Blackbox or another open-source project from this developer saves you time, you can support future work through [GitHub Sponsors](https://github.com/sponsors/medkit992).

## License

Blackbox API Visualizer is licensed under the [MIT License](LICENSE).
