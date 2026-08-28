# Blackbox API Visualizer Privacy Policy

**Effective date:** August 28, 2026

Blackbox API Visualizer ("Blackbox") is a Chrome DevTools extension for inspecting, analyzing, and visualizing network traffic from the web page currently being inspected.

This policy explains what information Blackbox can access, how that information is used, and what controls are available to you.

## Summary

- Blackbox processes captured network data and source context locally inside the DevTools extension.
- Blackbox does not send captured network traffic or source content to Blackbox-operated servers.
- Blackbox does not sell captured data or use it for advertising, profiling, credit decisions, or unrelated purposes.
- Network capture does not begin until you explicitly choose **Start capturing** in Blackbox.
- You can pause capture, clear the current session, or revoke capture access from the **Privacy** control in the DevTools panel.

## Information Blackbox Can Process

When you grant network access and use Blackbox on an inspected page, the extension can process information exposed by Chrome DevTools, including:

- request URLs, hosts, paths, methods, and query parameters;
- request and response headers;
- cookies and authentication-related values that may appear in network requests or responses;
- request bodies and submitted payloads;
- response status information, MIME types, redirects, and size metadata;
- network timing, resource type, cache information, initiator information, connection information, and server IP addresses;
- response bodies for captured requests that you select in the request inspector;
- a bounded set of recent successful Fetch/XHR response bodies when Blackbox is tracing whether a selected derived resource URL came from earlier API response data; and
- script/source resources and source maps exposed locally by DevTools when Blackbox is attempting to map generated bundle locations back to authored source files.

Depending on the website being inspected, this information may contain personal information, authentication tokens, session identifiers, application source code, or other sensitive content. Blackbox displays or analyzes this information because inspecting the actual network exchange and its local source context is the core function of the extension.

## How Blackbox Uses This Information

Blackbox uses captured network and source information only to provide its user-facing developer tools, including:

- the request list and request inspector;
- request and response metadata views;
- timing and performance information;
- request-level diagnostics and diagnostic context;
- source-file and function correlation for captured requests when reliable local evidence is available;
- exact resource provenance relationships, such as a resource URL found in a previous API response;
- duplicate-request, polling, endpoint, domain, and error analysis;
- session insights;
- copied debug summaries that intentionally omit raw headers, cookies, authorization values, and request/response bodies; and
- the interactive network graph.

Blackbox does not use captured traffic or source content for advertising, behavioral profiling, marketing, eligibility decisions, or any purpose unrelated to the extension's developer-tool functionality.

## Source and Relationship Analysis

When you select certain derived resources such as images, media, scripts, stylesheets, fonts, manifests, or similar resources, Blackbox may inspect up to a bounded number of recent successful Fetch/XHR response bodies already available through DevTools. It looks for exact URL relationships between the selected resource and values returned by those API responses. Blackbox does not use fuzzy matching to claim these relationships.

When DevTools exposes generated scripts, authored source resources, or source maps, Blackbox may read them locally to map generated JavaScript locations back to the original JavaScript, JSX, TypeScript, TSX, Vue, Svelte, Astro, or other supported source files. Blackbox only reports an authored extension or filename when that information is present in actual source/source-map evidence; it does not rename generated `.js` files to `.ts`, `.tsx`, or another source language based on a framework guess.

Blackbox does not remotely fetch source maps or source files from a Blackbox service. Source correlation is limited to content exposed by the inspected page, captured network resources, and DevTools resources available in the local browser session.

## Data Transmission and Sharing

Blackbox does not transmit captured network traffic or inspected source content to Blackbox-operated servers.

Blackbox does not sell captured network data and does not share captured network data or source content with advertisers, data brokers, or unrelated third parties.

The extension analyzes the information locally in the DevTools extension context on your device.

## Storage and Retention

Captured request, response, source-context, and session data is kept in memory for the active DevTools session so Blackbox can render the request table, details, insights, diagnostics, source relationships, and graph.

In the current version:

- choosing **Clear** removes the current captured session from Blackbox;
- navigating the inspected page resets the current captured session and source-context cache;
- closing the DevTools panel ends the in-memory session;
- response bodies are retrieved automatically when you select a captured request and are kept only in the active in-memory session; and
- additional recent Fetch/XHR bodies or source resources inspected for provenance/source correlation are cached only in memory for the active DevTools session.

Blackbox stores a small local preference indicating whether you granted network-capture consent. This preference contains no captured network traffic or source content. You can remove it by choosing **Privacy → Revoke access**, by clearing the extension's local data, or by uninstalling the extension.

## Your Choices and Controls

Blackbox provides the following controls:

- **Start capturing** — grants access and begins network capture.
- **Not now** — leaves network capture disabled.
- **Pause / Resume** — temporarily stops or resumes capture after consent has been granted.
- **Clear** — removes the current captured session from the Blackbox interface.
- **Privacy → Revoke access** — disables future capture and clears the current Blackbox session.
- Selecting a captured request retrieves its response body automatically so the response view and local debugger can use it as context.
- Selecting a derived resource may trigger bounded local provenance/source analysis as described above.

## Security

Because network traffic and source resources may contain credentials, tokens, cookies, personal data, application secrets, or proprietary source code, you should treat information displayed in Blackbox as sensitive and avoid sharing screenshots or exports that expose confidential values.

Blackbox is designed to minimize exposure by processing captured traffic and source context locally rather than sending it to a Blackbox backend. The built-in debug-summary formatter also avoids copying raw headers, cookies, authorization values, and request/response bodies by default.

## Children's Privacy

Blackbox is a developer tool and is not directed to children.

## Changes to This Policy

This policy may be updated when Blackbox's data-handling behavior changes. Material changes will be reflected in this document and in the public project repository.

## Contact

Blackbox is an open-source project. Privacy questions or concerns can be raised through the project's GitHub issue tracker:

https://github.com/medkit992/Blackbox-API-Visualizer/issues
