# Contributing to Blackbox

Thanks for contributing to Blackbox API Visualizer.

Blackbox is intended to stay understandable, deterministic, privacy-conscious, and useful during real debugging sessions. Contributions should prefer clear rules and observable evidence over opaque guesses.

## Development setup

### Requirements

- Node.js 22+
- npm
- Chrome or Edge for manual DevTools testing

### Install, test, and build

```bash
npm ci
npm run typecheck
npm test
npm run build
```

For continuous rebuilding:

```bash
npm run watch
```

Load `dist/` as an unpacked extension from your Chromium browser's extensions page.

## Before opening a pull request

Run the same core checks used by CI:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Then manually verify the extension loads and the Blackbox DevTools panel opens without critical console errors.

For changes involving request diagnosis, source correlation, provenance, response loading, or privacy behavior, also test at least one normal development build and one production/minified page when practical.

## Project boundaries

Keep responsibilities separated:

- browser capture belongs in `src/network/capture.ts`;
- Chromium/HAR conversion belongs in `src/network/parser.ts`;
- observed single-request signals belong in `src/network/analyzer.ts`;
- declarative debugger knowledge belongs in `src/network/diagnosticRules.ts`;
- structured request diagnosis belongs in `src/network/diagnosticAnalyzer.ts`;
- initiator formatting belongs in `src/network/initiatorSource.ts`;
- exact response/resource provenance belongs in `src/network/requestProvenance.ts`;
- source-map/generated→authored mapping belongs in `src/network/sourceMapResolver.ts`;
- Webpack development-module correlation belongs in `src/network/webpackModuleResolver.ts`;
- combined request/source context belongs in `src/network/requestSourceContext.ts`;
- cross-request/session rules belong in `src/network/sessionAnalyzer.ts`;
- complete graph construction belongs in `src/network/graphBuilder.ts`;
- graph visibility/scalability rules belong in `src/network/graphView.ts`;
- DevTools resource adapters, runtime coordination, DOM, and Cytoscape interaction belong in `src/panel/`;
- share/copy formatting belongs in focused helpers such as `src/utils/debugSummary.ts`.

Avoid putting raw HAR/Chromium access or diagnostic decisions deep in UI rendering code when the value can be normalized/interpreted earlier.

## Analyzer and diagnostic contributions

Rules/diagnoses should be:

- deterministic;
- explainable from captured evidence;
- conservative about root-cause claims;
- explicit about the difference between an observed failure and a possible cause;
- tested against false positives/ambiguous evidence when practical.

Prefer:

> The request returned 403. Possible causes include insufficient permissions or an authorization policy.

Avoid:

> Your API key is missing the required permission.

unless the captured data actually proves that statement.

Confidence labels describe the strength of evidence. Do not introduce fake probability percentages unless there is an actual calibrated statistical model behind them.

For session heuristics such as duplicates or polling, require enough observations to distinguish a pattern from normal repeated usage.

## Source/provenance contributions

Source correlation is allowed to fail. It is **not** allowed to invent an authored file/function.

- Prefer real source-map/module/DevTools evidence over filename guesses.
- Do not rename generated `.js` files to `.ts`, `.tsx`, `.jsx`, etc. without source evidence.
- When two authored candidates are similarly plausible, return no authored match and preserve the generated fallback.
- Keep browser initiator and recommended debugging source as separate concepts.
- Framework/runtime internals may be valid browser initiators even when an application-owned source is more useful for debugging.
- Provenance relationships should require exact/canonical resource relationships rather than fuzzy filename similarity.
- Keep traversal/candidate counts/response sizes bounded so analysis remains safe on large sessions.
- New remote source/resource access requires privacy/security review and should use the narrowest possible scope.

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

## Privacy and security

Treat request URLs, headers, cookies, request/response bodies, initiator/source-map content, and authored source as untrusted and potentially sensitive input.

- Escape network/source-controlled strings before inserting them through `innerHTML`.
- Do not replay captured requests to inspect responses.
- Do not log secrets unnecessarily.
- Do not add broad host permissions for convenience when DevTools or bounded same-origin access can implement the feature.
- Keep source/provenance inspection bounded.
- Keep copied debug summaries sanitized by default.
- Any future export/cloud/team/source-snippet sharing feature must receive a separate privacy/security review.
- If a change alters what Blackbox reads or how it uses sensitive data, update the in-product disclosure, `PRIVACY.md`, published privacy page, and Chrome Web Store Privacy practices as applicable.

## Pull requests

Keep PRs focused and explain:

- what problem the change solves;
- how behavior changed;
- how it was tested;
- any new heuristics/thresholds;
- any privacy/security/data-access change;
- screenshots/GIFs for meaningful UI changes when available.

Small, reviewable PRs are preferred over unrelated feature bundles.
