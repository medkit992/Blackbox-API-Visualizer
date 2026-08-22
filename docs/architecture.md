# Architecture

Blackbox keeps browser-specific network capture separate from the data and analysis layers so the rest of the application does not need to understand Chromium's HAR-shaped objects.

## Data flow

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
          ↘            ↙
            panel.ts
                ↓
        graphBuilder.ts
                ↓
          graphView.ts
                ↓
            Cytoscape
```

## `capture.ts`

Owns the live connection to `chrome.devtools.network`.

Responsibilities:

- receive completed DevTools network requests;
- retain the original Chromium request object while the current session is alive;
- stop accepting new requests while capture is paused;
- notify the panel when the capture collection changes.

It should not classify errors, calculate graph structure, or render UI.

## `parser.ts`

Converts Chromium request objects into Blackbox-owned structures.

There are two stages:

1. `parseRequest()` copies and normalizes Chromium/HAR fields and browser-specific metadata.
2. `normalizeRequest()` flattens the useful request information into `NormalizedRequest`.

`NormalizedRequest` is the primary boundary for downstream code. Analyzers and graph code should prefer it over reaching into raw DevTools structures.

## `analyzer.ts`

Performs deterministic analysis of a **single** normalized request.

Examples:

- 401/403 authentication and access problems;
- 404 and generic 4xx errors;
- 429 rate limiting;
- 5xx server failures;
- redirects and cached responses;
- slow requests and long response waits;
- large payloads.

Analyzer wording should distinguish observed facts from possible causes. Network metadata can show that a request returned 403, for example, but cannot prove the application's internal authorization logic.

## `sessionAnalyzer.ts`

Analyzes relationships and patterns across the current request collection.

Current responsibilities include:

- duplicate request bursts;
- periodic polling detection;
- repeated error clusters;
- endpoint frequency;
- domain-level request, transfer, error, and duration statistics.

Session heuristics should require enough evidence to avoid noisy false positives. Polling detection, for example, uses multiple observations and interval consistency instead of treating two similar requests as polling.

## `graphBuilder.ts`

Builds the complete logical network graph from the current `NormalizedRequest[]`.

The graph contains three levels:

- `page` — the inspected page;
- `domain` — one node per request host;
- `endpoint` — one node per method + host + path combination.

Graph nodes and edges carry aggregate metrics and the IDs of the requests they represent. Keeping request IDs on graph entities lets the panel drill from an aggregate graph node back to the exact underlying requests.

`graphBuilder.ts` describes the complete graph and should not contain UI-specific visibility limits.

## `graphView.ts`

Projects the complete logical graph into a safe, readable graph for the current UI state.

This layer exists because a production page can contain hundreds or thousands of distinct endpoints. Rendering every endpoint at once produces an unreadable graph and repeatedly laying it out is expensive.

The graph view therefore:

- always keeps the page root;
- ranks domains/endpoints by error count, request count, transferred bytes, then label;
- supports errors-only projection;
- reveals endpoints only for expanded domains;
- caps visible domains and endpoints per domain;
- reports how many nodes were omitted by those limits.

The request table remains the authoritative full dataset. Graph limits are presentation limits, not capture limits.

## `panel.ts`

Coordinates UI state and rendering.

Major responsibilities:

- request table rendering and filters;
- session-insight interaction;
- request inspector population;
- lazy response-body retrieval from the original DevTools request;
- Requests/Graph view switching;
- Cytoscape interaction and lifecycle management.

### Graph rendering strategy

Live network activity can produce dozens of request-finished events in a short burst. Rebuilding and laying out Cytoscape for every event causes jitter and unnecessary work.

The panel therefore uses several safeguards:

1. **Throttled rendering** — live graph updates are coalesced into a short render interval.
2. **Topology detection** — node/edge IDs form a topology key.
3. **Metric-only updates** — if topology is unchanged, Cytoscape data is updated in place without re-running layout.
4. **Layout only on structural changes** — adding/removing visible nodes or edges triggers a new layout.
5. **Controlled fitting** — passive network updates do not constantly reset the user's zoom/pan. Fit occurs on initial render or explicit user actions.
6. **ResizeObserver** — Cytoscape is notified when the DevTools panel or request inspector changes the graph container size.
7. **Adaptive detail limits** — users can choose how many endpoints per expanded domain are visible.

## Response bodies

Response bodies are intentionally lazy-loaded. The panel keeps a map from normalized request ID to the original `chrome.devtools.network.Request` and calls its captured `getContent()` method when the user asks to view the body.

Blackbox must not recreate a captured POST/PATCH/DELETE request with `fetch()` merely to inspect its response because doing so could execute the action a second time.

## Security boundaries

Network captures can contain:

- bearer tokens and API keys;
- cookies and session identifiers;
- personal data in query parameters;
- request bodies containing credentials or payment/application data;
- private response bodies.

Any future session export or sharing feature must sanitize sensitive data before a capture leaves the local DevTools environment.
