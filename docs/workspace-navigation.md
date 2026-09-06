# v0.5.0 workspace navigation

This extends PR #24 on `feature/v0.5.0-request-lifecycle`. It does not merge,
retag, publish, or change the release version. Broad v1 polish (#2/#10/#21)
remains separate; this is the navigation foundation needed to make the growing
debugging tools readable now.

## Information architecture

**Dashboard · Requests · Request Stories** are the three primary workspaces.
The Dashboard is the initial destination. Capture controls and primary navigation
remain at the top; there is no permanent navigation sidebar and no split request
inspector. Selecting a real request replaces the current workspace at full width.

The request workspace exposes **Summary · Lifecycle · Diagnose · Request ·
Response · Timing · Headers**. The internal `overview` route remains an alias for
the user-facing Summary so existing Stories/source links stay compatible.

| Destination | Job | Existing features housed here |
| --- | --- | --- |
| Dashboard | Find something worth investigating | Entire-session counts, response size, elapsed capture span, error/slow entry points, session patterns, top endpoints/domains, eight recent requests |
| Requests | Locate a captured call | Search, category/Errors/Slow filters, an optional issue/endpoint/domain selection, paged table |
| Request Stories | Follow relationships and symptoms | Existing stable-snapshot workflow and isolated learning example |
| Summary | Understand the selected call and choose a tool | Compact shared diagnosis, facts, source/relationship context, optional technical metadata, links to the other tools |
| Lifecycle | Locate the evidence boundary/stage | Existing SVG/native DOM ring and responsive stepper, checkpoint evidence, isolated teaching examples |
| Diagnose | Work through a problem | Diagnosis, evidence, likely causes, suggestions, additional signals, safe Copy Debug Summary |
| Request / Response / Timing / Headers | Inspect the actual data | Existing request inputs, Response Explorer Tree/Raw and paths, raw timing evidence, captured headers |

### Interactions and state

- A request opens from the table, Dashboard recent activity, or a Stories action.
  Its Back button names the origin, not always Requests.
- Back restores the origin's scroll positions and focus when the opener still
  exists (or a replacement request/keyed Story button exists). Filters, search,
  table page, and Stories' snapshot stay in memory.
- Primary navigation can exit inspection directly. Both paths emit one
  `blackbox:request-closed` event, invalidating the debugger's selected context.
- Request tabs hide/show the same panels. They never remount the response tree or
  lifecycle checkpoints and never trigger another capture subscription.
- Lifecycle Source opens Summary/source context; Diagnosis opens Diagnose;
  other checkpoints navigate to the corresponding tool for the same request.
- Dashboard issue/endpoint/domain actions enter Requests with an explicit
  selection banner and cleared text/category filters. Further search/category
  changes intersect that selection. Clear selection filter removes only the
  selection. A normal Back from request inspection changes no filter.
- Seven request tabs use manual activation: Arrow keys/Home/End move focus;
  Enter/Space activate. Ordinary primary navigation uses native buttons.
- Clear, inspected-page navigation, and privacy revoke close inspection, clear
  return positions and stale request data, and retain the existing runtime's
  late-response/session-generation guards. UI state never stores payloads in
  URLs, localStorage, or a backend.

## Responsive and performance rules

The shell owns the available DevTools area, not a fixed inset or 42% detail column.
Dashboard cards stack; primary/request navigation can scroll horizontally.
The table confines horizontal overflow to its own scroller. At most **200 rows**
are mounted at once; Previous/Next keeps every captured request accessible.

Only the active root workspace is rendered. Incoming capture is coalesced into
one animation-frame update; a selected request does not trigger hidden table or
Dashboard rebuilding. Back refreshes dirty root views. Stories continues to use
its original bounded snapshot model. The Dashboard reuses the existing session
analyzer rather than implementing a competing diagnosis system.

Short panes let the request heading scroll away and keep request tabs reachable.
The ring/stepper renderer is unchanged, so it still adapts to component width and
viewport height. Forced colors, reduced motion, keyboard focus, and long URLs
must remain supported. No router, UI framework, graph library, capture permission,
or application instrumentation is added.

## Evidence rules

Dashboard HTTP errors mean recorded 4xx/5xx responses; status 0 is not fabricated
into an HTTP error. Slow means strictly over 1,000 ms. Response size is reported
response-content size, not bytes on the wire. Capture span is earliest known
request start to latest known end, not a sum of overlapping durations.

Summary reuses Request Diagnosis's title/explanation. Application Parse/Data/Use
remain **Not observed** for live traffic; navigation does not introduce telemetry.
The Lifecycle learning examples remain simulated and isolated from all counts.

## Validation

```sh
npm ci
npm run typecheck
npm test
npm run build
python -m pip install playwright
python -m playwright install chromium
python tests/browser/workspace.browser.py
```

`workspace.test.ts` covers filtering, selection intersection, pagination,
measurement boundaries, and supported destinations. `workspace.browser.py`
serves the actual production `dist/` package with mocked Chrome DevTools APIs.
It exercises navigation, late body callbacks, examples, source/diagnosis links,
response Tree/Raw state, keyboard tabs, small panes, zoom, pause, clear, and revoke.
Browser checks do not claim installed-extension acceptance on a real website.

Before merging, load the exact built extension and test real traffic, both
selection entry points, response/source loading, small side/bottom docks,
Pause/Resume/Clear, and revoke. Final v0.5.0 release preparation stays separate.
