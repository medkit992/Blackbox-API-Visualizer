# Blackbox API Visualizer

[![CI](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml)

Blackbox is an open-source Chromium DevTools extension for capturing, inspecting, explaining, and visualizing the network activity of the page you are debugging.

Instead of treating every request as an isolated row, Blackbox combines deterministic request diagnostics, source context, exact request provenance, session-level pattern detection, an interactive page → domain → endpoint graph, and a response explorer that turns nested JSON into navigable JavaScript data paths.

## Release status

| Status | Version | Channel | Health |
| --- | --- | --- | --- |
| **Release candidate** | `v0.3.0` | Local / trusted testing; Chrome Web Store submission next | Working in automated and manual testing |
| **Latest Stable** | `v0.2.0` | Chrome Web Store | Working / verified |
| **Superseded Stable** | `v0.1.2` | Chrome Web Store history | Working, superseded by v0.2.0 |
| **Retired** | `v0.1.0` | Chrome Web Store history | **Broken — do not recommend** |

`v0.3.0` should remain **Preview / release candidate** until the exact packaged build is submitted to the Chrome Web Store and the distributed build passes the [Stable release gate](docs/release-policy.md). See the [current release status](docs/release-status.md) and [v0.3.0 verification issue](https://github.com/medkit992/Blackbox-API-Visualizer/issues/18) for the source-of-truth release state.

## What's new in v0.3.0

### Request Diagnosis

- Adds a deterministic **Request Diagnosis** view for both successful and problematic requests.
- Explains common HTTP, authentication, authorization, routing, validation, rate-limit, server, network, cache, redirect, payload, and performance conditions in plain English.
- Shows the evidence Blackbox used, a diagnostic category, evidence-backed confidence, likely causes, and concrete things to check.
- Uses response-body error messages as additional evidence when the selected response is available.
- Keeps raw Request, Response, Headers, and Timing tabs available underneath the simplified diagnosis.

### Source and relationship context

- Preserves Chromium initiator stacks instead of flattening them away during capture.
- Separates **Start debugging in / Likely source**, **Relationship**, **Browser initiator**, and **Generated location** so browser/framework internals are not confused with authored application code.
- Maps generated bundle locations back to authored JS, JSX, TS, TSX, Vue, Svelte, Astro, and related source files when reliable source-map or development-module evidence is available.
- Handles common standard source maps and Webpack development-module/sourceURL patterns without framework-specific logic.
- Performs bounded same-origin source-map discovery for captured scripts when DevTools has not already exposed an available map.
- Traces derived resources such as images back to exact URL values found in earlier successful Fetch/XHR responses, including response paths such as `data[2].authorImage`.
- Falls back to truthful generated/browser locations when authored source cannot be resolved or evidence is ambiguous.

### Response and sharing improvements

- Response bodies now load automatically when a captured request is selected so the debugger and Response Explorer can use the same local context.
- Keeps the v0.2.0 **Tree / Raw** response explorer and copyable JavaScript response paths.
- Adds **Copy Debug Summary** with request facts, diagnosis, evidence, possible causes, suggestions, and source context.
- Debug summaries intentionally omit raw headers, cookies, authorization values, request bodies, and response bodies.

### DevTools usability

- Improves vertical scrolling and workspace sizing for laptop-sized DevTools panels.
- Gives the request inspector more room when a request is selected while restoring the request list/graph to full width when it is closed.
- Adds a native GitHub Sponsors button without embedding remote UI inside the DevTools panel.

## What it does

- Captures completed DevTools network requests in real time.
- Normalizes Chromium/HAR-style request data into a stable internal model.
- Filters traffic by resource type and errors.
- Inspects request metadata, query parameters, headers, bodies, timing, priority, initiator, source context, and server information.
- Loads captured response bodies locally when a request is selected rather than replaying the network request.
- Explores JSON responses as a collapsible tree with copyable JavaScript property paths.
- Preserves a raw response view and gracefully handles non-JSON response types.
- Diagnoses useful per-request conditions such as authentication failures, rate limits, missing routes, validation failures, server failures, large payloads, redirects, cache hits, and slow requests.
- Shows successful requests as successful rather than treating the debugger as error-only.
- Correlates requests to authored source and related API responses when reliable local evidence is available.
- Detects session-level patterns including duplicate bursts, polling, repeated errors, endpoint frequency, and domain traffic.
- Visualizes traffic as page → domain → endpoint relationships with expandable domains.

## Source-correlation limits

Source correlation is best-effort by design. Source maps, authored sources, and useful stack information are not available on every site or build.

Blackbox prefers evidence in roughly this order:

1. authored source-map/module evidence;
2. exact relationship to an earlier API response plus the source of that API request;
3. useful Chromium stack/initiator frames;
4. normalized generated bundle locations;
5. the browser initiator type as a final fallback.

Blackbox does not rename generated `.js` files to `.ts`, `.tsx`, `.jsx`, or another source language based on framework guesses. If the evidence is ambiguous, it keeps the generated fallback rather than inventing a source file.

## Graph behavior

The graph is intentionally aggregated. Blackbox does **not** create one graph node for every network request because real applications can produce hundreds or thousands of requests in a single session.

Instead:

1. The inspected page is the root node.
2. Requests are grouped into domain nodes.
3. Clicking a domain expands its endpoint nodes.
4. Clicking an endpoint returns to the request table filtered to the requests represented by that node.

For large sessions, the graph:

- ranks graph nodes by errors, request frequency, and transferred bytes;
- caps the number of visible domains and endpoints rather than rendering an unreadable wall of nodes;
- exposes an endpoint-per-domain detail control;
- reports when nodes are hidden by graph limits;
- throttles live graph updates;
- updates metrics without re-running layout when graph topology has not changed;
- automatically resizes with the DevTools panel while preserving the user's current viewport;
- uses explicit **Fit** and expand/collapse actions when the user wants the graph reframed.

The request table always retains the full captured dataset even when the graph is intentionally summarized.

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
        ↘
      graph builder/view → Cytoscape
```

See [docs/architecture.md](docs/architecture.md) for the responsibilities, privacy boundaries, source-map behavior, and analysis layers.

## Privacy and security

Blackbox's core function requires it to inspect sensitive network and website context from the page currently open in DevTools. Depending on the inspected application, that can include URLs, headers, authentication information, cookies, request/response bodies, and application source code/source maps.

Blackbox processes this context locally in the DevTools extension and does not send captured traffic or inspected source content to a Blackbox-operated backend. Selecting a request automatically retrieves its captured response body. Derived-resource tracing may inspect a bounded set of recent successful Fetch/XHR responses, and source correlation may inspect DevTools-exposed source resources plus bounded same-origin source maps associated with captured scripts.

The built-in Copy Debug Summary intentionally omits raw headers, cookies, authorization values, and request/response bodies.

See [PRIVACY.md](PRIVACY.md) for the full data-handling disclosure and [SECURITY.md](SECURITY.md) for vulnerability-reporting guidance.

## Contributing

Contributions are welcome. Start with [docs/contributing.md](docs/contributing.md), which covers setup, project boundaries, testing expectations, and pull request guidance.

Good contribution areas include:

- new deterministic request/session analyzers with low false-positive rates;
- source-map/bundler correlation with conservative fallbacks;
- graph scalability and interaction improvements;
- richer response exploration and formatting;
- browser compatibility fixes;
- tests and realistic network fixtures;
- accessibility and keyboard navigation.

## Roadmap

See [Roadmap: Blackbox API Visualizer v1.0.0](https://github.com/medkit992/Blackbox-API-Visualizer/issues/13) for the planned product direction and v1 feature set.

The Response Explorer (#4) shipped in v0.2.0 and the plain-English request debugger (#6) ships in v0.3.0. Deeper source inspection remains tracked in #17 while application-side data-access diagnostics, richer request-flow visualization, replay/experimentation, and beginner-focused UI modes remain future work.

## Support development

If Blackbox or another open-source project from this developer saves you time, you can support future work through [GitHub Sponsors](https://github.com/sponsors/medkit992).

## License

Blackbox API Visualizer is licensed under the [MIT License](LICENSE).
