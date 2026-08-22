# Blackbox API Visualizer Privacy Policy

**Effective date:** August 22, 2026

Blackbox API Visualizer ("Blackbox") is a Chrome DevTools extension for inspecting, analyzing, and visualizing network traffic from the web page currently being inspected.

This policy explains what information Blackbox can access, how that information is used, and what controls are available to you.

## Summary

- Blackbox processes captured network data locally inside the DevTools extension.
- Blackbox does not send captured network traffic to Blackbox-operated servers.
- Blackbox does not sell captured data or use it for advertising, profiling, credit decisions, or unrelated purposes.
- Network capture does not begin until you explicitly choose **Start capturing** in Blackbox.
- You can pause capture, clear the current session, or revoke capture access from the **Privacy** control in the DevTools panel.

## Information Blackbox Can Process

When you grant network access and use Blackbox on an inspected page, the extension can process information exposed by the Chrome DevTools Network API, including:

- request URLs, hosts, paths, methods, and query parameters;
- request and response headers;
- cookies and authentication-related values that may appear in network requests or responses;
- request bodies and submitted payloads;
- response status information, MIME types, redirects, and size metadata;
- network timing, resource type, cache information, initiator information, connection information, and server IP addresses;
- response bodies when you explicitly select **Load Response** for a captured request.

Depending on the website being inspected, this information may contain personal information, authentication tokens, session identifiers, or other sensitive content. Blackbox displays this information because inspecting the actual network exchange is the core function of the extension.

## How Blackbox Uses This Information

Blackbox uses captured network information only to provide its user-facing developer tools, including:

- the request list and request inspector;
- request and response metadata views;
- timing and performance information;
- request-level diagnostics;
- duplicate-request, polling, endpoint, domain, and error analysis;
- session insights; and
- the interactive network graph.

Blackbox does not use captured traffic for advertising, behavioral profiling, marketing, eligibility decisions, or any purpose unrelated to the extension's network-inspection functionality.

## Data Transmission and Sharing

Blackbox does not transmit captured network traffic to Blackbox-operated servers.

Blackbox does not sell captured network data and does not share captured network data with advertisers, data brokers, or unrelated third parties.

The extension analyzes the information locally in the DevTools extension context on your device.

## Storage and Retention

Captured request and session data is kept in memory for the active DevTools session so Blackbox can render the request table, details, insights, and graph.

In the current version:

- choosing **Clear** removes the current captured session from Blackbox;
- navigating the inspected page resets the current captured session;
- closing the DevTools panel ends the in-memory session; and
- response bodies are retrieved only after you explicitly select **Load Response** for a request.

Blackbox stores a small local preference indicating whether you granted network-capture consent. This preference contains no captured network traffic. You can remove it by choosing **Privacy → Revoke access**, by clearing the extension's local data, or by uninstalling the extension.

## Your Choices and Controls

Blackbox provides the following controls:

- **Start capturing** — grants access and begins network capture.
- **Not now** — leaves network capture disabled.
- **Pause / Resume** — temporarily stops or resumes capture after consent has been granted.
- **Clear** — removes the current captured session from the Blackbox interface.
- **Privacy → Revoke access** — disables future capture and clears the current Blackbox session.
- **Load Response** — retrieves a response body only when you explicitly request it.

## Security

Because network traffic may contain credentials, tokens, cookies, personal data, or application secrets, you should treat information displayed in Blackbox as sensitive and avoid sharing screenshots or exports that expose confidential values.

Blackbox is designed to minimize exposure by processing captured traffic locally rather than sending it to a Blackbox backend.

## Children's Privacy

Blackbox is a developer tool and is not directed to children.

## Changes to This Policy

This policy may be updated when Blackbox's data-handling behavior changes. Material changes will be reflected in this document and in the public project repository.

## Contact

Blackbox is an open-source project. Privacy questions or concerns can be raised through the project's GitHub issue tracker:

https://github.com/medkit992/Blackbox-API-Visualizer/issues
