# Blackbox API Visualizer

[![CI](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml)

Blackbox is an open-source Chromium DevTools extension for capturing, inspecting, explaining, and visually tracing the network activity of the page you are debugging.

Blackbox combines a session Dashboard, searchable request capture, deterministic request diagnostics, source context, exact response/resource provenance, a visual **Request Stories** workspace, an evidence-first **Request Lifecycle**, and a Response Explorer that turns nested JSON into navigable JavaScript data paths.

## Release status

| Status | Version | Channel | Health |
| --- | --- | --- | --- |
| **Release candidate** | `v0.5.0` | Local / trusted testing; Chrome Web Store submission next | Working in automated testing; exact release-package verification still required |
| **Latest Stable** | `v0.2.0` | Chrome Web Store | Working / verified |
| **Superseded Preview** | `v0.4.0` | Local/testing history | Working; functionality included in v0.5.0 |
| **Superseded Preview** | `v0.3.0` | Local/testing history | Working; functionality included in v0.5.0 |
| **Superseded Stable** | `v0.1.2` | Chrome Web Store history | Working, superseded by v0.2.0 |
| **Retired** | `v0.1.0` | Chrome Web Store history | **Broken — do not recommend** |

`v0.5.0` remains **Preview / release candidate** until the exact merged/tagged package is submitted to the Chrome Web Store and the distributed build passes the [Stable release gate](docs/release-policy.md). See the [current release status](docs/release-status.md) and the v0.5.0 release-verification issue for the source-of-truth release state.

`v0.4.0` was superseded before production promotion. Its Request Stories and debugger/source-context functionality is included in v0.5.0, so it does not need a separate Web Store release.

## What's new in v0.5.0

### Dashboard and focused workspaces

Blackbox now opens on a **Dashboard** that summarizes the current capture session and points directly to useful investigations. Session-level statistics and insights no longer permanently consume vertical space above Requests and Request Stories.

The primary workspaces are:

- **Dashboard** — session health, actionable problems, top endpoints/domains, and recent requests;
- **Requests** — search/filter/paginate the full captured request collection;
- **Request Stories** — symptom-first visual investigation with stable snapshots.

Selecting a request opens a full-width investigation instead of squeezing details into a persistent side panel.

The request workspace provides:

```text
Summary · Lifecycle · Diagnose · Request · Response · Timing · Headers
```

Back returns to the originating workspace and restores relevant search/filter/page, scrolling, and focus where possible.

### Request Lifecycle

A selected request can now be followed through:

```text
Initiator → Request → Send → Wait → Response → Parse → Data ready → Use data → back to code
```

On roomy panels the lifecycle is displayed as a circular SVG track with native DOM checkpoint controls. Narrow or short DevTools panels use the same model in a vertical stepper rather than shrinking the ring into an unreadable graphic.

Each checkpoint explains the observed state, evidence, and useful next action. The lifecycle deliberately separates HTTP/network evidence from application-side handling.

A successful HTTP response does **not** prove that the inspected page later parsed or used the data successfully. For live traffic, **Parse**, **Data ready**, and **Use data** remain **Not observed** unless Blackbox has direct evidence. Blackbox's own local JSON inspection is never presented as application telemetry.

Three local learning examples demonstrate a fully completed lifecycle, a 404 whose JSON can still be parsed, and a simulated parsing failure.

### Request Stories

Request Stories remains the stable visual debugging workspace designed around questions a developer actually asks.

Start with:

- **Explore** — browse captured API endpoints;
- **What failed?** — prioritize requests with HTTP/network problems;
- **What is slow?** — find slow calls;
- **What repeats?** — find endpoints called multiple times without automatically declaring those calls accidental duplicates.

Choose a request and Blackbox explains it as:

```text
Your code → HTTP exchange → Returned data
```

Each stage can open the same full-width request workspace used by the Requests table.

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

Blackbox deliberately avoids turning a busy session into a speculative dependency or application-state diagram.

Connected evidence can include:

- a captured browser-initiator resource that matches another request;
- redirect/preflight candidates supported by request metadata;
- exact resource URLs found inside an earlier **already-loaded** JSON response.

Requests occurring close together are not automatically considered related. Blackbox also does not claim that an HTTP `200` proves the application later parsed, accessed, or rendered the data correctly.

### Stable interaction and bounded performance

The active visual workflows use ordinary DOM controls and native scrolling rather than transformed canvas interaction.

For large sessions:

- Request Stories analysis is bounded to the newest 5,000 captured requests;
- Request Stories endpoint cards are rendered in pages of 40;
- the Requests workspace renders bounded pages of 200 rows while retaining access to the complete capture;
- hidden Dashboard/request-table views are not rebuilt during request investigation;
- incoming capture rendering is coalesced;
- selected investigations are guarded against stale late response/source callbacks.

### Request Debugger and source context

v0.5.0 carries forward the debugger/source-context work:

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
- Opens a Dashboard that summarizes session health and useful next investigations.
- Normalizes Chromium/HAR-style request data into a stable internal model.
- Searches and filters traffic by resource type, errors, slow requests, and session-derived selections.
- Opens selected requests in a full-width Summary / Lifecycle / Diagnose / Request / Response / Timing / Headers workspace.
- Visualizes the evidence-backed request lifecycle without inventing unobserved application behavior.
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

## Request Lifecycle behavior

The lifecycle is an explanation of evidence, not a general JavaScript execution tracer.

For a captured request Blackbox can reliably show network/HTTP facts such as the captured request, available HAR timing phases, and the HTTP response. It can also inspect already-loaded response content locally.

That does **not** establish that the inspected application called a particular body reader, resolved a parsing Promise, accessed a specific property, or rendered the result. Unsupported application stages remain explicitly unknown.

Issue #9 tracks the future possibility of an explicit opt-in application observer. Any such observer must preserve page behavior, correlate concurrent calls reliably, clean up on navigation/revoke, remain bounded/local, and avoid guessed URL/time-only matches.

See [docs/request-lifecycle.md](docs/request-lifecycle.md) for the detailed evidence model and [docs/workspace-navigation.md](docs/workspace-navigation.md) for navigation/state rules.

## Request Stories behavior

Request Stories is intentionally not a giant live dependency graph.

The workflow is:

1. Choose the symptom or browse endpoints.
2. Select a captured request/endpoint.
3. Read the request outcome.
4. Follow **Your code → HTTP exchange → Returned data**.
5. Open the selected request's full-width workspace when deeper evidence is needed.
6. Review connected requests only when Blackbox has evidence for the relationship.
7. Refresh the snapshot when you want newly captured calls included.

The Requests workspace remains the authoritative full captured dataset. Request Stories is a bounded explanation/projection over that data, not a reduced capture mode.

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

CI performs a clean install, typecheck, full test run, production build, extension-bundle verification, and Chromium lifecycle/workspace regression checks.

## Architecture

```text
Chromium DevTools network/source APIs
               ↓
        capture + parser
               ↓
       NormalizedRequest
        ↙            ↘
request analyzer  session analyzer
        ↓                 ↓
 diagnostic analyzer   Dashboard
        ↓
 source/provenance context
        ↓
 full-width request workspace
 Summary / Lifecycle / Diagnose
 Request / Response / Timing / Headers
        ↓
 Response Explorer + Request Lifecycle

NormalizedRequest[]
        ↓
 requestStory.ts
        ↓
 request-stories.ts
        ↓
 Request Stories UI
```

See [docs/architecture.md](docs/architecture.md), [docs/request-stories.md](docs/request-stories.md), [docs/request-lifecycle.md](docs/request-lifecycle.md), and [docs/workspace-navigation.md](docs/workspace-navigation.md) for the detailed responsibilities, evidence rules, and privacy/state boundaries.

## Privacy and security

Blackbox's core function requires it to inspect sensitive network and website context from the page currently open in DevTools. Depending on the inspected application, that can include URLs, headers, authentication information, cookies, request/response bodies, and application source code/source maps.

Blackbox processes this context locally in the DevTools extension and does not send captured traffic or inspected source content to a Blackbox-operated backend. Selecting a request automatically retrieves its captured response body. Derived-resource tracing may inspect a bounded set of recent successful Fetch/XHR responses, and source correlation may inspect DevTools-exposed source resources plus bounded same-origin source maps associated with captured scripts.

Request Stories does **not** load additional response bodies merely to build relationships and does not replay requests. Request Stories and Request Lifecycle learning examples use local simulated data and do not contact the inspected page.

v0.5.0 does not add page instrumentation or wrap `fetch`, Promises, `Response` readers, or arbitrary application property access.

The built-in Copy Debug Summary intentionally omits raw headers, cookies, authorization values, and request/response bodies.

See [PRIVACY.md](PRIVACY.md) for the full data-handling disclosure and [SECURITY.md](SECURITY.md) for vulnerability-reporting guidance.

## Contributing

Contributions are welcome. Start with [docs/contributing.md](docs/contributing.md), which covers setup, project boundaries, testing expectations, and pull request guidance.

Good contribution areas include:

- new deterministic request/session analyzers with low false-positive rates;
- source-map/bundler correlation with conservative fallbacks;
- Request Stories evidence, performance, accessibility, and responsive behavior;
- Request Lifecycle evidence/presentation without speculative application state;
- richer response exploration and formatting;
- browser compatibility fixes;
- tests and realistic network fixtures;
- accessibility and keyboard navigation.

## Roadmap

See [Roadmap: Blackbox API Visualizer v1.0.0](https://github.com/medkit992/Blackbox-API-Visualizer/issues/13) for the planned product direction and v1 feature set.

The Response Explorer (#4) shipped in v0.2.0, Request Diagnosis (#6) was developed in v0.3.0, Request Stories (#3) was developed in v0.4.0, and the lifecycle/network-vs-application model (#5/#7) plus workspace/navigation foundation ship together in v0.5.0. Issue #9 remains open for possible safe application-side async instrumentation. Deeper source inspection remains tracked in #17. The request-feed redesign (#2), Simple/Technical modes (#10), contextual explanations (#21), and broader student-ready polish remain part of the final v1.0.0 pass.

## Support development

If Blackbox or another open-source project from this developer saves you time, you can support future work through [GitHub Sponsors](https://github.com/sponsors/medkit992).

## License

Blackbox API Visualizer is licensed under the [MIT License](LICENSE).
