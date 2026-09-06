# Request lifecycle — v0.5.0 feature work

## Where it lives

Select a captured request from **Requests** or **Request Stories**, then open
**Overview → Request lifecycle**. It appears immediately before the existing
Request Diagnosis; the raw inspector and debugger are unchanged.

The view follows one selected call around a fixed clockwise ring:

**Initiator → Request → Send → Wait → Response → Parse → Data ready → Use data → Initiator**

The return edge means returning control to code, not starting a retry. There is
no draggable graph, layout physics, pan/zoom, or invented live progress.

Click any checkpoint for its explanation, evidence, and next debugging action.
Actions open the existing request, response, timing, diagnosis, or source context
for that same captured request. Collapse hides the visualization without losing
access to the rest of Overview.

## Responsive presentation

One ordered list of native buttons is used in both layouts; resizing does not
replace controls, lose keyboard focus, or change the selected checkpoint.

- Ring: component content width at least 390px and viewport height at least 620px.
- Compact/short: vertical stepper, with a side-by-side evidence card when wide
  enough. No unreadable miniature circle in a bottom-docked pane.
- Very wide: ring and evidence card side by side.

The renderer uses SVG only for the decorative track/arrows. All interactions,
labels, summaries, and evidence are normal DOM. Status has text and symbols, not
just color. Buttons have pressed state, focus outlines, and an associated live
evidence region. There is no perpetual animation or rendering timer.

## What the view can prove

| Checkpoint | Captured evidence | Important boundary |
| --- | --- | --- |
| Initiator | Chromium initiator metadata, if exposed | Not an observed `fetch()` invocation or proof of a faulty source line |
| Request | A finished HAR entry was recorded | Not proof bytes reached an external server; not pending-request telemetry |
| Send / Wait | Raw HAR phase durations | Negative/missing/non-finite values remain unavailable; measured zero is valid |
| Response | HTTP status and already-loaded response content | HTTP success is distinct from API business logic or application success |
| Parse / Data ready / Use data | Not observed in passive capture | Never inferred from Blackbox's own local JSON parsing |

A 4xx/5xx marks the **HTTP response** as a problem, but does not mark subsequent
application stages as failed or not reached. `fetch()` can fulfill with an error
HTTP response, and the application can still parse its body. A status of zero is
not an HTTP response code and does not prove a particular CORS/connection/cancel
cause. Redirects, 304 validation, HEAD, and empty 204/205 bodies are distinguished
from parsing failures.

Cache metadata alone does not prove local delivery. In particular, existing
`cached` normalization records before/after cache metadata, not a definitive
from-cache flag. We preserve any measured phases and never claim a fresh server
round trip merely because an HTTP response was recorded. Browser and
service-worker responses do not establish external server execution.

## Local response-content check

Only an **already-loaded** body is examined, without another `getContent` or
network call. The check is capped at **256,000 characters**, before trimming or
parsing. Encoded and larger content is left to the existing Response view.

A weak-key cache avoids repeating checks for an unchanged selected request; it
invalidates on body, encoding, MIME, or availability changes. Only the small
shape/validity summary is retained, not a parsed duplicate tree. Summaries omit
actual JSON values and parser exception text.

Valid JSON says **Blackbox's local check** succeeded. It never marks the app's
Parse or Data ready checkpoints completed. Malformed JSON under a JSON MIME type
is a response-format warning, not an invented observation of an app exception.

## Learning examples

The Data source selector offers isolated, explicitly simulated examples:

1. HTTP success, parsing, and data use all completed.
2. A 404 error response whose JSON body was successfully parsed.
3. HTTP 200 with an observed *simulated* parse failure; the example's later success
   path is not reached, rather than reporting more failures.

Examples do not enter captured traffic, request counts, source resolution, or
response loading. Inspector navigation is unavailable while an example is shown.
Returning to Selected request restores the live checkpoint; selecting a different
captured request exits the example. Normal capture can continue underneath.

## Implementation and lifecycle ownership

- `src/network/requestLifecycle.ts`: typed, DOM-free evidence model and bounded
  content check; also owns the separate teaching fixtures.
- `src/panel/request-lifecycle.ts`: stable DOM/SVG renderer and checkpoint state.
- `src/panel/request-lifecycle.css`: component-scoped responsive presentation.
- `request-debugger-view.ts`: mounts before Diagnosis and uses the existing
  render/reset path, shared by Requests and Stories.

No new capture subscription, interval, broad permission, third-party runtime
library, source upload, or page instrumentation is introduced. Clear, navigation,
close, and consent revocation follow the debugger's existing reset path. Existing
runtime generation/selection guards keep late responses from restoring a closed
or cleared selection. The lifecycle reset releases its selected request/model.

## Application instrumentation decision (#9 and future #8)

This PR implements the agreed evidence-first lifecycle framework and passive
network/application distinction for #5/#7/#9. It does **not** claim general
application-side tracing or automatically close the instrumentation issues.

HAR and `getContent()` cannot establish arbitrary Promise settlement, body-reader
calls, property accesses, or rendering outcomes. Automatically wrapping `fetch`,
`Response` readers, or Promises is deliberately not part of this PR. Before an
opt-in observer is added, its separate design/tests must cover:

- explicit consent and page/frame/worker coverage;
- per-call identity and reliable correlation for concurrent identical requests,
  redirects, cloned responses, and cache/service-worker delivery;
- preservation of return values, Promise/stream behavior, error handling, and
  cleanup on navigation/revoke; no guessed URL/time-only matches;
- bounded local storage and a strict transport schema;
- separate evidence for a response being received, parsing settling, and data
  being used; arbitrary property access is not implied by any of these.

Unknown is the correct live state until such evidence actually exists. Future
#8 path-mismatch work can use the Parse/Data/Use data checkpoints without another
UI redesign. The controlled examples exercise those visual states today, but
are never presented as instrumented observations of the user's application.

## Validation

Run the normal repository checks:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The lifecycle unit suite covers evidence boundaries, HTTP outcomes, raw timings,
cache metadata, bodyless responses, bounded content checks, and sample isolation.
The optional real-Chromium fixture compiles the model/renderer and inlines them
into a local document; no browser network access or running site is needed:

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser/request-lifecycle.browser.py
```

Set `CHROMIUM_PATH` to use a system browser. Set `LIFECYCLE_SCREENSHOTS` to save
ring and compact screenshots. This fixture checks widths/heights down to 320×300,
all checkpoint hit targets, focus/selection preservation, example isolation,
inspector actions, escaping, keyboard controls, collapse, forced colors, and reset.
It is a component regression fixture, not a substitute for installed-extension
acceptance.

Before release, test the exact built extension on real successful and failing
requests, Requests and Stories selection, late response loading, Pause/Clear,
navigation, consent revoke, and docking/zoom changes. This feature PR does not
retag or promote a production release; version/package release preparation stays
separate from owner acceptance.

## Platform references

- [Chrome DevTools Network API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)
- [Fetch: HTTP errors and Promise behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch)
