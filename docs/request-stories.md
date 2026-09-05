# Request Stories — graph rework

Status: development, awaiting installed-extension acceptance. This is not a release and does not change version metadata.

## Purpose

The previous graph asked users to navigate a network map before it offered an answer. Request Stories replaces the free-moving canvas with a task-oriented, keyboard-accessible view: choose a failed, slow, or repeated endpoint, understand one captured call, then open its actual evidence in the existing request debugger.

The three connected cards (Your code, HTTP exchange, Returned data) are an educational organization of captured facts. They do not assert that application parsing, Promise resolution, state changes, or rendering were observed.

## User workflow

Open **Request stories** beside Requests. API traffic is prioritized by default; clear **API calls only** to include resources. Choose **What failed?**, **What is slow?**, **What repeats?**, or search the endpoint picker. Counts refer to endpoint groups, not the total number of requests.

Choose a request to see its outcome, source context, response shape when already available, next debugging actions, related evidence, measured timing phases, and recent calls to the same endpoint. Actions open the exact captured request and appropriate existing inspector tab. The Response Explorer, diagnostics, and source mapping remain the technical investigation tools.

New traffic changes the **Refresh snapshot** count, not the selected cards underneath the pointer. Press Refresh to include it. This is deliberately a stable snapshot view, not an animated live lifecycle diagram. Capture continues independently.

The **Learning example** is optional, offline, and conspicuously labelled simulated traffic. It never enters the capture store. Exit restores the previous live selection and filters. Example actions show sample fields, not a real request inspector.

## Evidence rules

- Status 0 means no HTTP status was captured. It does not establish CORS, cancellation, or a pending Promise.
- A 2xx response is network success, not proof of correct application handling. Blackbox parsing captured JSON does not establish that the application parsed it.
- Repeated endpoints share scheme, host, method, and path. Query values and bodies can differ; this is grouping, not duplicate detection.
- Initiator links match Chrome's source URL to a captured resource. Multiple resource loads can be ambiguous.
- Redirect and preflight URL/method matches are labelled **candidates** because this capture model has no browser request-chain identifier. Timing alone never creates a relationship.
- A URL found at a JSON path establishes a value match, not proof that application code used the value. Multiple candidates remain visible rather than choosing a supposed cause.
- No fabricated page-root or application-stage links are added when evidence is absent.
- Timing uses original HAR phase availability when present. Missing phases are not zero. SSL/TLS is included in Connection and is not added a second time.

## Performance and privacy boundaries

The analytical snapshot contains at most the newest 5,000 captured records plus one older explicitly selected record. Omitted-record counts are visible; the capture store is not truncated by this view. Endpoint rendering starts at 40 entries and expands only on request. At most 12 relationship cards and 10 endpoint calls are rendered in the selected story.

Only already-loaded bodies are examined. Automatic shape analysis is limited to 262,144 JavaScript string code units; URL search considers up to 40 earlier loaded API responses, 1,200 JSON values per response and 8 levels. Parsed bodies are cached with weak object keys. No replay, new host permission, application instrumentation, extra response retrieval, or backend upload is introduced by the story view.

The existing request debugger retains its consented response/source retrieval when the user explicitly opens request details. Session generation checks prevent late response callbacks from restoring data after Clear or navigation.

The Stories tab no longer imports/initializes Cytoscape. The legacy pure graph helpers/tests remain for now; this PR does not alter dependency or version metadata. Native DOM buttons eliminate the separate canvas hit-testing coordinate system. Container-based layout responds to both panel width and height, including short or zoomed panes. In narrow panes a Choose a request control switches between picker and story instead of squeezing both together.

## Architecture

- `src/network/requestStory.ts`: pure bounded snapshot, outcome, shape, source, timing, and correlation functions.
- `src/panel/request-stories.ts`: view controller, stable refresh policy, accessible buttons, explicit inspector navigation, isolated learning example.
- `src/panel/request-stories.css`: scoped visual system and viewport/container breakpoints.
- `src/panel/panel.ts`: capture adapter and canonical request selection.
- `src/panel/request-debugger-runtime.ts`: shared `blackbox:request-selected` event plus generation-guarded async response retrieval.

## Verification

The new model has 37 test cases in `tests/network/requestStory.test.ts`. Local verification ran these exact test bodies through Node's test runner after TypeScript transpilation (only the runner import was changed). The new model and story controller passed an isolated strict TypeScript compilation.

A Chromium/Playwright fixture executed the compiled story controller with simulated capture data. Coordinate clicks after scrolling/resizing passed at 1440×900, 1024×768, 768×700, 480×800, 360×640, 320×480 and 600×420. Additional checks covered CSS zoom 1.25 and 2 with device scale factors 1 and 2, keyboard activation, stable live-update DOM, hidden-view behavior, search focus, example isolation/restoration, escaped hostile strings, Clear, and a 50,000-record fixture with a 5,000-record analysis window under 4× CPU throttling. This is not a hardware benchmark or an installed-extension end-to-end test.

Full repository install/typecheck/Vitest/build are separate CI checks. Local fixture results must not be represented as those checks passing. Screenshots use labelled simulated capture, not a live website session.

### Acceptance before merging

1. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on the branch.
2. Reload the unpacked `dist` extension and reopen DevTools. Confirm Requests, consent, capture, Pause, Clear and navigation still work.
3. Open Request stories and the Learning example. Check failed, slow, repeated and API-to-image examples. Exit returns to live capture without adding sample records.
4. Select a real request; click Returned data, a next-step action, and Open debugger. Verify each opens that exact request, updates diagnostics/source context, and preserves Response Explorer Tree/Raw behavior.
5. Load a real API response, return to its story, and inspect an exact matching resource URL. Labels must describe the value match, not claim unobserved causation.
6. Resize/dock/zoom DevTools, scroll the picker and story, then click visible cards. Test especially short panes and browser scaling. Check keyboard access too.
7. Leave a busy page capturing: the current story must not jump, the pending count must advance, and Refresh must update it. Navigate/Clear while a response is loading and verify old content does not return.

Do not merge, tag, publish or mark this Stable until the owner accepts the actual installed experience and the relevant checks pass.
