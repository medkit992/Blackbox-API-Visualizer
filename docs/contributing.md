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

For changes involving request diagnosis, source correlation, provenance, response loading, Request Stories, or privacy behavior, also test at least one normal development build and one production/minified page when practical.

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
- renderer-independent Request Stories grouping/explanation/evidence belongs in `src/network/requestStory.ts`;
- Request Stories controller/DOM behavior belongs in `src/panel/request-stories.ts`;
- Request Stories visual/responsive rules belong in `src/panel/request-stories.css` and `src/panel/request-stories-layout.css`;
- general DevTools request/session coordination belongs in `src/panel/panel.ts`;
- share/copy formatting belongs in focused helpers such as `src/utils/debugSummary.ts`.

`src/network/graphBuilder.ts`, `src/network/graphView.ts`, their tests/types, and Cytoscape are legacy from the pre-v0.4 graph UI. The active panel no longer uses them; do not extend those files for new Request Stories behavior.

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

## Request Stories contributions

Request Stories should help answer a debugging question, not recreate a generic network visualization.

When changing Request Stories, preserve these principles:

- start from symptoms or a selected request rather than a giant dependency map;
- keep the **Your code → HTTP exchange → Returned data** distinction technically accurate;
- do not present HTTP success as proof that later application parsing/rendering succeeded;
- do not infer causation from timing proximity alone;
- label preflight/redirect/initiator relationships according to the evidence actually available;
- only inspect response bodies already loaded by the normal debugger workflow unless a future privacy-reviewed feature explicitly changes that contract;
- keep the selected story stable while live capture continues;
- retain native DOM hit targets and native scrolling; do not reintroduce a transformed canvas unless a concrete user problem requires it;
- keep analysis and rendering bounded for long sessions;
- keep request-controlled strings escaped/sanitized;
- make important actions keyboard reachable and avoid hover-only critical information.

### Manual layout cases

For meaningful Request Stories UI changes, test at least:

1. a wide DevTools panel;
2. a typical laptop-height panel;
3. a narrow side-docked panel;
4. a short bottom-docked panel;
5. browser/DevTools zoom changes when practical;
6. scrolling and selecting after resize;
7. opening/closing the technical request inspector;
8. incoming traffic while a story is selected;
9. empty capture and the local Learning example;
10. a noisy page with hundreds or thousands of captured calls.

Do not solve large-session performance by dropping requests from the capture model. Keep the full request collection in Requests and bound only the story analysis/projection.

The optional fixtures under `tests/browser/` are useful for reproducible layout/hit-target regressions but do not replace testing the real unpacked extension on representative sites.

## Privacy and security

Treat request URLs, headers, cookies, request/response bodies, initiator/source-map content, and authored source as untrusted and potentially sensitive input.

- Escape network/source-controlled strings before inserting them through `innerHTML`.
- Do not replay captured requests to inspect responses.
- Do not log secrets unnecessarily.
- Do not add broad host permissions for convenience when DevTools or bounded same-origin access can implement the feature.
- Keep source/provenance and Request Stories relationship inspection bounded.
- Keep copied debug summaries sanitized by default.
- Keep local simulated examples isolated from the inspected page and real capture collection.
- Any future export/cloud/team/source-snippet sharing feature must receive a separate privacy/security review.
- If a change alters what Blackbox reads or how it uses sensitive data, update the in-product disclosure, `PRIVACY.md`, published privacy page, and Chrome Web Store Privacy practices as applicable.

## Pull requests

Keep PRs focused and explain:

- what problem the change solves;
- how behavior changed;
- how it was tested;
- any new heuristics/thresholds/bounds;
- any privacy/security/data-access change;
- screenshots/GIFs for meaningful UI changes when available.

Small, reviewable PRs are preferred over unrelated feature bundles.
