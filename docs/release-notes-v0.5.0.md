# Blackbox API Visualizer v0.5.0

## Workspace + Request Lifecycle

v0.5.0 is the release where Blackbox moves from a growing DevTools side inspector into a structured debugging workspace.

### New Dashboard

Blackbox now opens on a Dashboard that summarizes the current capture session without permanently taking space away from the traffic views.

Dashboard includes:

- total captured requests;
- reported response size and elapsed capture span;
- actionable HTTP-error and slow-request cards;
- existing session-pattern insights such as polling, duplicate bursts, and repeated errors;
- top endpoints and domains;
- recent requests that open directly into investigation.

### Full-width request investigation

Selecting a request no longer squeezes its details into a narrow side panel. The selected request takes over the workspace and exposes focused destinations:

**Summary · Lifecycle · Diagnose · Request · Response · Timing · Headers**

Back returns to the originating Dashboard, Requests, or Request Stories workspace while restoring relevant search/filter/page, scrolling, and focus where possible.

### Request Lifecycle

A selected request can now be followed through an evidence-first lifecycle:

**Initiator → Request → Send → Wait → Response → Parse → Data ready → Use data → back to code**

On roomy panels Blackbox renders a circular SVG lifecycle with native DOM checkpoints. Narrow or short DevTools panels use the same data and controls in a vertical stepper rather than shrinking the circle into an unreadable graphic.

Each checkpoint can explain:

- what Blackbox observed;
- what it did not observe;
- what the evidence means;
- what to inspect next.

The center/outcome language deliberately separates network success from application success.

### Evidence boundaries

Blackbox remains evidence-first.

A captured `200` can prove that an HTTP success response was observed. It does **not** prove that the inspected page later called `response.json()`, awaited a Promise, accessed the correct property path, or rendered the result successfully.

For live traffic, application-side **Parse**, **Data ready**, and **Use data** stages therefore remain **Not observed** unless Blackbox has direct evidence. Local response parsing performed by Blackbox itself is never presented as telemetry from the inspected page.

Three clearly labeled local teaching examples demonstrate completed application stages and a simulated parse failure without entering the real capture session.

Issue #9 remains open for future investigation of an explicit opt-in application observer.

### Cleaner traffic workspaces

Requests now focuses on finding traffic:

- text search;
- resource/error filters;
- Slow filtering;
- actionable filters originating from Dashboard/session insights;
- bounded pages of 200 rows while retaining access to the full captured dataset.

Request Stories retains its stable-snapshot, symptom-first workflow without session-level Dashboard material consuming its vertical space.

### Reliability and responsive behavior

The release includes expanded regression coverage for:

- full-width navigation and Back behavior;
- search/filter/page and scroll/focus restoration;
- Request Stories → inspector → Request Stories restoration;
- lifecycle checkpoint/example state;
- Response Explorer Tree/Raw state;
- late response/source callbacks;
- Clear, page navigation, privacy revoke, Pause/Resume, and re-consent;
- keyboard navigation;
- escaping of request-controlled content;
- wide, narrow, side-docked, and short bottom-docked panel sizes down to 320×300;
- simulated CSS zoom hit targets and forced-colors behavior.

The release-candidate CI suite contains 184 automated tests across 17 files plus Chromium component/production-panel regression fixtures.

## Carried forward

v0.5.0 includes the major systems developed in earlier previews:

- Request Stories;
- deterministic Request Diagnosis;
- source-map / authored-source context when reliable evidence exists;
- exact response/resource provenance;
- privacy-safe Copy Debug Summary;
- visual Response Explorer with copyable JavaScript paths;
- session-level polling, duplicate-burst, and repeated-error analysis.

v0.4.0 is superseded before production promotion rather than being shipped separately.

## Privacy / permissions

v0.5.0 adds no new broad host permission, remote Blackbox backend, request replay, page instrumentation, `fetch`/Promise wrapping, or arbitrary application-property observation.

Captured network/source context remains processed locally by the extension. Existing response/source/provenance consent and privacy behavior remains in force.

## Release verification

Do not classify v0.5.0 as Stable solely from local/CI testing. The exact merged/tagged ZIP must be loaded and tested, submitted to the Chrome Web Store, installed from the distributed Web Store build, and pass the repository's Stable release gate before v0.5.0 replaces v0.2.0 as the recommended production release.
