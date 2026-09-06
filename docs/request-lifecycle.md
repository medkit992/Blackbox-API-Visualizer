# Request lifecycle — v0.5.0 feature work

## Where it lives

Select a real request from **Requests**, **Dashboard recent activity**, or a
**Request Stories** inspector action, then choose **Lifecycle** in the full-width
request workspace. PR #24's workspace follow-up replaces the original placement
inside Overview. See [workspace-navigation.md](workspace-navigation.md) for the
navigation plan, feature map, and regression guide.

The view follows a selected call around a fixed clockwise ring:

**Initiator → Request → Send → Wait → Response → Parse → Data ready → Use data → Initiator**

The return edge means returning control to code, not starting a retry. There is
no draggable graph, physics, pan/zoom, or invented live progress. Every checkpoint
opens its evidence and next debugging action. Source actions go to Summary's
source context; Diagnosis actions go to Diagnose; other actions open the relevant
Request, Response, or Timing tool for the same captured request.

## Responsive presentation

One ordered list of native buttons is used in both layouts; resizing does not
replace controls, lose keyboard focus, or change the selected checkpoint.

- Ring: component content width at least 390px and viewport height at least 620px.
- Compact/short: vertical stepper, with a side-by-side evidence card when wide
  enough. No unreadable miniature circle in a bottom-docked pane.
- Very wide: ring and evidence card side by side.

SVG is used only for the decorative track/arrows. Interaction, labels, summaries,
and evidence use normal DOM. States have text and symbols, not only color. Native
buttons have pressed state, focus outlines, and an associated live evidence
region. No perpetual animation or rendering timer is introduced. Switching
request tabs retains the same component and the current checkpoint/example.

## What the view can prove

| Checkpoint | Evidence | Boundary |
| --- | --- | --- |
| Initiator | Chromium initiator metadata, if exposed | Not an observed fetch invocation or proof of a faulty source line |
| Request | A finished HAR entry was recorded | Not proof bytes reached an external server; not pending-request telemetry |
| Send / Wait | Raw HAR phase durations | Negative/missing/non-finite values remain unavailable; measured zero is valid |
| Response | HTTP status and already-loaded content | HTTP success is distinct from API business logic or application success |
| Parse / Data ready / Use data | Not observed in passive capture | Never inferred from Blackbox's own local JSON parsing |

A 4xx/5xx marks the HTTP response as a problem, but does not mark later app stages
failed or not reached. `fetch()` can fulfill with an error HTTP response and the
app can still parse its body. Status zero does not prove a particular CORS,
connection, or cancellation cause. Redirects, 304 validation, HEAD, and empty
204/205 bodies are distinguished from parsing failures.

Cache metadata alone does not prove local delivery. Existing `cached`
normalization records before/after metadata, not a definitive from-cache flag.
Measured phases are preserved; an HTTP response does not prove a fresh external
server round trip. Browser/service-worker responses do not establish external
server execution.

## Local response-content check

Only an already-loaded body is examined, without another `getContent` or network
call. The check is capped at **256,000 characters** before trimming or parsing.
Encoded and larger content is left to the existing Response tool.

A weak-key cache avoids repeated checks for an unchanged request and invalidates
on body, encoding, MIME, or availability changes. Only the shape/validity summary
is retained, not a duplicate parsed tree. Summaries omit actual values and parser
exception text. Valid JSON means Blackbox's local check succeeded; it never marks
the application's Parse or Data ready checkpoints completed. Invalid JSON under
a JSON MIME type is a response-format warning, not an invented app exception.

## Learning examples

Data source provides three isolated, explicitly simulated examples: complete
success; a 404 whose JSON parses successfully; and a 200 with a simulated parse
failure whose later success-path steps are not reached.

Examples never enter capture, request counts, source resolution, or response
loading. Inspector navigation is unavailable during an example. Returning to
Selected request restores the live checkpoint; selecting a different captured
request exits the example. Live capture can continue underneath.

## Ownership and reset

- `src/network/requestLifecycle.ts`: typed DOM-free evidence model, bounded
  content check, separate teaching fixtures.
- `src/panel/request-lifecycle.ts` and `.css`: stable DOM/SVG component.
- `request-debugger-view.ts`: mounts at `request-lifecycle-anchor` in Lifecycle;
  the existing debugger render/reset path owns updates.
- `workspace-navigation.ts`: full-width routes and request-tool navigation.

There is no new capture subscription, broad permission, runtime dependency,
source upload, or page instrumentation. Back/primary navigation close selected
analysis through `blackbox:request-closed`; request tab switches do not. Clear,
navigation, and revoke retain the debugger's generation/selection guards so late
responses cannot restore closed or cleared content. Reset releases selected
lifecycle request/model references.

## Application instrumentation decision (#9 and future #8)

This implements the evidence-first lifecycle framework and passive distinction
for #5/#7/#9. It does not claim general application tracing or auto-close the
instrumentation issues.

HAR and `getContent()` do not establish arbitrary Promise settlement, body-reader
calls, property accesses, or rendering outcomes. Automatically wrapping fetch,
Response readers, or Promises is not included. An opt-in observer must first cover:

- explicit consent and page/frame/worker coverage;
- per-call identity and reliable correlation for concurrent identical requests,
  redirects, clones, caches, and service workers;
- preserving return values, Promise/stream behavior, error handling, and cleanup
  on navigation/revoke; never URL/time-only guessed matches;
- bounded local storage and a strict transport schema;
- distinct evidence for response reception, parsing settlement, and data use.

Unknown remains the correct live state without that evidence. Future #8 can plug
into these checkpoints without another UI redesign. Teaching fixtures exercise
future visual states, not observations of the inspected application.

## Validation and release boundary

```sh
npm ci
npm run typecheck
npm test
npm run build
python -m pip install playwright
python -m playwright install chromium
python tests/browser/request-lifecycle.browser.py
python tests/browser/workspace.browser.py
```

The lifecycle component fixture covers eight native hit targets, scrolling,
resizing, focus/selection, escaping, examples, inspector actions, keyboard controls,
collapse, forced colors, and reset. The workspace fixture exercises the actual
built panel with mocked DevTools APIs. Neither replaces installed-extension
acceptance on real sites.

Before release, test the exact package on successful/failed traffic, source and
response loading, all selection entry points, Pause/Clear/navigation/revoke, and
docking/zoom. This remains feature work; versioning and production promotion are
separate from owner acceptance.

Platform references: [Chrome DevTools Network API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)
and [Fetch HTTP error behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch).
