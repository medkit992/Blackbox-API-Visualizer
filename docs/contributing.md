# Contributing to Blackbox

Thanks for contributing to Blackbox API Visualizer.

Blackbox is intended to stay understandable, deterministic, and useful during real debugging sessions. Contributions should prefer clear rules and measurable network behavior over opaque guesses.

## Development setup

### Requirements

- Node.js 22+
- npm
- Chrome or Edge for manual DevTools testing

### Install and build

```bash
npm install
npm run typecheck
npm run build
```

For continuous rebuilding:

```bash
npm run watch
```

Load `dist/` as an unpacked extension from your Chromium browser's extensions page.

## Before opening a pull request

Run the checks available in your checkout:

```bash
npm run typecheck
npm run test --if-present
npm run build
```

Then manually verify the extension loads and the Blackbox DevTools panel opens without console errors.

## Project boundaries

Keep responsibilities separated:

- browser capture belongs in `src/network/capture.ts`;
- Chromium/HAR conversion belongs in `src/network/parser.ts`;
- single-request rules belong in `src/network/analyzer.ts`;
- cross-request/session rules belong in `src/network/sessionAnalyzer.ts`;
- complete graph construction belongs in `src/network/graphBuilder.ts`;
- graph visibility/scalability rules belong in `src/network/graphView.ts`;
- DOM and Cytoscape interaction belong in `src/panel/`.

Avoid putting HAR-specific access deep in UI code when the value can be normalized earlier.

## Analyzer contributions

Analyzer rules should be:

- deterministic;
- explainable from captured network evidence;
- conservative about root-cause claims;
- tested against false positives when possible.

Prefer:

> The request returned 403. Possible causes include insufficient permissions or an authorization policy.

Avoid:

> Your API key is missing the required permission.

unless the captured data actually proves that statement.

For session heuristics such as duplicates or polling, require enough observations to distinguish a pattern from normal repeated usage.

## Graph contributions

The graph must remain useful on large sessions.

When changing graph behavior, test at least these cases manually:

1. a small page with fewer than 20 requests;
2. a typical app with hundreds of captured requests;
3. a domain with many distinct endpoints;
4. errors-only mode;
5. expanding and collapsing several domains;
6. changing the endpoint-per-domain limit;
7. resizing DevTools repeatedly;
8. opening/closing the request inspector while the graph is visible;
9. continuing to capture traffic while zoomed or panned away from the default viewport.

Do not solve large-session performance by dropping requests from the capture model. Summarize the graph view while retaining the full request table.

## Security

Treat request URLs, headers, cookies, request bodies, and response bodies as untrusted/sensitive input.

- Escape network-controlled strings before inserting them through `innerHTML`.
- Do not replay captured requests to inspect their responses.
- Do not log secrets unnecessarily.
- Any future export feature must redact credentials and session values by default.

## Pull requests

Keep PRs focused and explain:

- what problem the change solves;
- how the behavior changed;
- how it was tested;
- any new heuristics or thresholds;
- screenshots/GIFs for meaningful UI changes when available.

Small, reviewable PRs are preferred over unrelated feature bundles.
