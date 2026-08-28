# Architecture

Blackbox keeps browser-specific capture separate from normalized data, deterministic analysis, source/provenance context, and UI rendering. The goal is to let each layer evolve without forcing the rest of the application to understand Chromium's raw HAR-shaped objects.

## High-level data flow

```text
chrome.devtools.network.onRequestFinished
                ↓
             capture.ts
                ↓
             parser.ts
                ↓
         NormalizedRequest
          ↙            ↘
   analyzer.ts    sessionAnalyzer.ts
          ↓
 diagnosticAnalyzer.ts
          ↓
 requestSourceContext.ts
   ↙          ↓          ↘
initiator   provenance   source maps/modules
          ↓
 request-debugger-runtime.ts
          ↓
 request-debugger-view.ts
          ↓
   Request Inspector UI

NormalizedRequest[]
        ↓
  graphBuilder.ts
        ↓
   graphView.ts
        ↓
    Cytoscape
```

The Response Explorer consumes the same captured response body used by the debugger; it does not replay requests.

## `capture.ts`

Owns the live connection to `chrome.devtools.network`.

Responsibilities:

- receive completed DevTools network requests;
- retain the original Chromium request object while the current session is alive;
- stop accepting new requests while capture is paused;
- notify panel/runtime consumers when the capture collection changes.

It should not classify errors, infer source relationships, calculate graph structure, or render UI.

## `parser.ts`

Converts Chromium request objects into Blackbox-owned structures.

There are two stages:

1. `parseRequest()` copies/normalizes Chromium/HAR fields and browser-specific metadata.
2. `normalizeRequest()` flattens useful request information into `NormalizedRequest`.

`NormalizedRequest` is the primary boundary for downstream code. Analyzers, provenance, source-correlation, and graph code should prefer it over reaching into raw DevTools structures.

### Initiator preservation

v0.3.0 intentionally preserves Chromium initiator context including:

- initiator type;
- direct initiator URL when available;
- line number;
- opaque stack information, including call frames when Chromium exposes them.

That stack is not treated as proof of root cause. It is evidence that later source-correlation layers may interpret conservatively.

## `analyzer.ts`

Performs deterministic analysis of a **single** normalized request and emits observed request issues/signals.

Examples:

- 401/403 authentication/access problems;
- 404 and generic 4xx errors;
- 429 rate limiting;
- 5xx server failures;
- redirects and cached responses;
- slow requests and long server waits;
- large payloads.

This analyzer detects observable conditions. It is intentionally separate from the debugger's explanation/diagnosis layer.

## `diagnosticRules.ts`

Contains the declarative diagnostic knowledge catalog used by the v0.3.0 Request Debugger.

A rule can define:

- match conditions/statuses/categories;
- diagnostic category and severity;
- default confidence;
- evidence definitions;
- plain-English title/summary;
- possible causes;
- concrete debugging suggestions.

Keeping the rule data declarative lets wording and supported cases evolve independently from rule-selection code.

## `diagnosticAnalyzer.ts`

Turns a request plus available evidence into a structured `RequestDiagnosis`.

Responsibilities include:

- select the highest-priority applicable diagnostic rule;
- collect evidence from status, headers, timings, body context, initiator/source context, and related observed signals;
- extract useful server-provided error messages from response text/JSON;
- raise confidence when additional strong evidence supports the explanation;
- keep unsupported causes phrased as possibilities rather than facts;
- produce a success diagnosis for healthy requests instead of making the debugger error-only.

Confidence labels express the strength of evidence behind the explanation. They are **not** statistical probabilities.

## Response bodies

Response bodies are loaded automatically when a captured request is selected in the request inspector.

The runtime calls the original captured DevTools request's `getContent()` method and stores the result on the in-memory `NormalizedRequest`. The same body can then be used by:

- the Response Explorer;
- server-message/error extraction;
- Request Diagnosis;
- source/provenance context where applicable.

Blackbox never recreates a captured POST/PATCH/DELETE request with `fetch()` merely to inspect its response because doing so could execute the application action a second time.

## `initiatorSource.ts`

Normalizes browser initiator information into a readable fallback.

Responsibilities include:

- walk preserved Chromium stack frames;
- choose a usable call frame when available;
- normalize common hashed/generated filenames for display;
- drop obviously useless minified function names while retaining useful function names;
- preserve the exact generated location separately;
- never invent an authored `.ts`, `.tsx`, `.jsx`, or other source extension from a generated `.js` file.

The browser initiator remains a technical fact even when a later layer finds a more useful authored debugging source.

## `requestProvenance.ts`

Traces certain derived resources back to exact values in earlier successful Fetch/XHR responses.

For example:

```text
GET /explore
    ↓
data[2].authorImage
    ↓
https://cdn.example.com/author.jpg
    ↓
selected Image request
```

The resolver is intentionally conservative:

- only bounded recent successful Fetch/XHR candidates are inspected;
- obviously binary or very large candidates are skipped;
- the upstream request must have completed before the derived resource begins;
- JSON traversal is bounded;
- relationships require exact canonical URL matches rather than fuzzy filename similarity;
- relative resource URLs may be resolved against the inspected document as well as the API response origin when appropriate.

If no exact relationship exists, Blackbox returns no provenance relationship.

## `sourceMapResolver.ts`

Maps generated JavaScript locations to authored source when reliable evidence is available.

Supported evidence includes:

- standard Source Map v3 mappings;
- source-map `sources` / `sourcesContent`;
- authored resources exposed directly by DevTools;
- exact endpoint strings found in authored source;
- function inference around the matched request call;
- common inline data source maps.

Blackbox includes a small internal VLQ/source-map decoder so source correlation remains deterministic and local.

If two authored files are similarly plausible, the resolver returns no authored match instead of choosing arbitrarily.

## `webpackModuleResolver.ts`

Handles common Webpack development bundles where multiple authored modules are wrapped inside one generated `bundle.js`, often using `eval`, `sourceURL`, and per-module inline source maps.

This layer is bundler-specific, **not framework-specific**. It does not assume React, Vue, Svelte, or any application framework.

Its purpose is to answer a bounded question:

> If Blackbox found the relevant request/function in this generated Webpack bundle, which authored module does that code actually belong to?

Framework/runtime modules are deprioritized when application-owned authored evidence is available.

## `devtoolsResources.ts`

Provides cached source resources to the source-correlation layers.

It combines:

- resources exposed by `chrome.devtools.inspectedWindow.getResources()`;
- captured Script/Stylesheet/source-map responses already visible in the network session;
- bounded same-origin sibling source-map candidates for captured scripts when DevTools has not exposed the map directly.

The same-origin source-map fallback does **not** add a broad host permission and does not fetch arbitrary third-party source maps. Failures simply return `null` and source correlation falls back to generated/browser evidence.

## `requestSourceContext.ts`

Combines browser initiator, authored source, and request provenance into the context shown to the user.

For a derived resource it may produce four distinct facts:

```text
Start debugging in
src/components/ExploreItems.jsx:15 · fetchExploreItems()

Relationship
GET /explore → data[2].authorImage

Browser initiator
explore:77

Generated location
js/bundle.js:1411:32
```

This separation is deliberate. The immediate browser/framework initiator is not always the most useful place for the developer to start debugging.

When authored evidence is missing or ambiguous, the context layer uses truthful generated/browser fallbacks rather than fabricating source information.

## `sessionAnalyzer.ts`

Analyzes patterns across the current request collection.

Current responsibilities include:

- duplicate request bursts;
- periodic polling detection;
- repeated error clusters;
- endpoint frequency;
- domain-level request, transfer, error, and duration statistics.

Session heuristics should require enough evidence to avoid noisy false positives.

## `graphBuilder.ts`

Builds the complete logical network graph from the current `NormalizedRequest[]`.

The graph contains three levels:

- `page` — the inspected page;
- `domain` — one node per request host;
- `endpoint` — one node per method + host + path combination.

Graph nodes/edges carry aggregate metrics and request IDs so the panel can drill from an aggregate graph node back to the exact underlying requests.

`graphBuilder.ts` describes the complete graph and should not contain UI-specific visibility limits.

## `graphView.ts`

Projects the complete logical graph into a safe, readable graph for the current UI state.

The graph view:

- always keeps the page root;
- ranks domains/endpoints by error count, request count, transferred bytes, then label;
- supports errors-only projection;
- reveals endpoints only for expanded domains;
- caps visible domains/endpoints;
- reports omitted nodes;
- avoids unnecessary layout reruns when only metrics change.

The request table remains the authoritative full dataset. Graph limits are presentation limits, not capture limits.

## Panel/runtime responsibilities

`panel.ts` owns the general request/session/graph UI.

`request-debugger-runtime.ts` owns the selected-request debugger lifecycle:

- track selected request and current timeline;
- trigger immediate metadata diagnosis;
- load selected response context;
- resolve source/provenance context asynchronously;
- rerun diagnosis as richer evidence arrives;
- keep stale asynchronous source results from replacing a newer selection;
- feed the final diagnosis/context into Copy Debug Summary.

`request-debugger-view.ts` is intentionally presentation-focused. It renders structured diagnoses without implementing diagnostic rules itself.

## Copy Debug Summary

`src/utils/debugSummary.ts` formats selected request/debugger context for sharing.

The formatter uses an allowlist-style approach rather than dumping the raw capture. It intentionally omits:

- raw request/response headers;
- cookies;
- authorization values;
- request bodies;
- response bodies;
- source snippets.

URLs/likely secret values are sanitized where applicable. The summary can include safe request facts, diagnosis evidence, source location labels, relationship paths, causes, and suggestions.

## Security and privacy boundaries

Network/source context may contain:

- bearer tokens and API keys;
- cookies and session identifiers;
- personal data in query parameters;
- credentials/payment/application data in bodies;
- private API responses;
- proprietary application source code/source maps.

Current safeguards include:

- processing remains local to the DevTools extension session;
- capture requires the in-product consent flow;
- selected responses are read from captured DevTools requests rather than replayed;
- provenance inspection is bounded;
- source-map discovery is bounded to associated same-origin script maps rather than arbitrary remote source fetching;
- ambiguous source matches are rejected;
- copied debug summaries omit the highest-risk raw data by default;
- clearing/navigating/closing the session clears the relevant in-memory capture/source caches.

Any future export, cloud, collaboration, or source-snippet sharing feature must revisit these boundaries before release.
