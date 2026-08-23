# Blackbox API Visualizer

[![CI](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml/badge.svg)](https://github.com/medkit992/Blackbox-API-Visualizer/actions/workflows/ci.yml)

## Release status

| Status | Version | Channel | Health |
| --- | --- | --- | --- |
| **Latest Stable** | _None verified yet_ | — | — |
| **Production candidate** | `v0.1.1` | Chrome Web Store verification pending | Pending verification |
| **Retired** | `v0.1.0` | Chrome Web Store | **Broken — do not recommend** |

`v0.1.1` becomes Blackbox's first **Stable** release only after the actual Chrome Web Store build passes the [release verification checklist](https://github.com/medkit992/Blackbox-API-Visualizer/issues/14). See the [release policy](docs/release-policy.md) and [current release status](docs/release-status.md) for the definitions of Development, Preview, Stable, Retired, distribution channels, release health, and the Stable release gate.

Blackbox is an open-source Chromium DevTools extension for capturing, inspecting, analyzing, and visualizing the network activity of the page you are debugging.

Instead of treating every request as an isolated row, Blackbox adds deterministic request insights, session-level pattern detection, and an interactive page → domain → endpoint graph.

## What it does

- Captures completed DevTools network requests in real time.
- Normalizes Chromium/HAR-style request data into a stable internal model.
- Filters traffic by resource type and errors.
- Inspects request metadata, query parameters, headers, bodies, timing, priority, initiator, and server information.
- Reads response bodies from the request already captured by DevTools rather than replaying the request.
- Flags useful per-request conditions such as authentication failures, rate limits, server failures, large payloads, redirects, cache hits, and slow requests.
- Detects session-level patterns including duplicate bursts, polling, repeated errors, endpoint frequency, and domain traffic.
- Visualizes traffic as page → domain → endpoint relationships with expandable domains.

## Graph behavior

The graph is intentionally aggregated. Blackbox does **not** create one graph node for every network request because real applications can produce hundreds or thousands of requests in a single session.

Instead:

1. The inspected page is the root node.
2. Requests are grouped into domain nodes.
3. Clicking a domain expands its endpoint nodes.
4. Clicking an endpoint returns to the request table filtered to the requests represented by that node.

For large sessions, the graph:

- ranks graph nodes by errors, request frequency, and transferred bytes;
- caps the number of visible domains and endpoints rather than rendering an unreadable wall of nodes;
- exposes an endpoint-per-domain detail control;
- reports when nodes are hidden by graph limits;
- throttles live graph updates;
- updates metrics without re-running layout when graph topology has not changed;
- automatically resizes with the DevTools panel while preserving the user's current viewport;
- uses explicit **Fit** and expand/collapse actions when the user wants the graph reframed.

The request table always retains the full captured dataset even when the graph is intentionally summarized.

## Install from source

### Requirements

- Node.js 22+
- npm
- A Chromium-based browser such as Chrome or Edge

### Build

```bash
npm install
npm run typecheck
npm run build
```

For automatic rebuilds while developing:

```bash
npm run watch
```

### Load the extension

1. Build the project.
2. Open your browser's extensions page (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the generated `dist` directory.
6. Open DevTools on any page and select the **Blackbox** panel.

After rebuilding extension code, reload the unpacked extension and reopen DevTools.

## Development commands

```bash
npm run build
npm run watch
npm run typecheck
```

If a `test` script is configured in your checkout, CI will run it automatically as well.

## Architecture

```text
Chromium DevTools network API
            ↓
         capture
            ↓
          parser
            ↓
        normalizer
            ↓
   ┌────────┴────────┐
request analyzer  session analyzer
   └────────┬────────┘
            ↓
      graph builder
            ↓
       graph view
            ↓
      panel / Cytoscape
```

See [docs/architecture.md](docs/architecture.md) for the responsibilities and boundaries of each layer.

## Privacy and security

Blackbox is designed to inspect network traffic locally inside DevTools. Captured headers, cookies, query values, request bodies, and response bodies can contain credentials or private application data.

Do not share raw captures without reviewing and redacting sensitive values. Export/share functionality is not part of the current MVP and should include sanitization before it is introduced.

See [SECURITY.md](SECURITY.md) for vulnerability reporting guidance.

## Contributing

Contributions are welcome. Start with [docs/contributing.md](docs/contributing.md), which covers setup, project boundaries, testing expectations, and pull request guidance.

Good contribution areas include:

- new deterministic request/session analyzers with low false-positive rates;
- graph scalability and interaction improvements;
- richer request inspection and formatting;
- browser compatibility fixes;
- tests and realistic network fixtures;
- accessibility and keyboard navigation.

## Roadmap

See [Roadmap: Blackbox API Visualizer v1.0.0](https://github.com/medkit992/Blackbox-API-Visualizer/issues/13) for the current planned product direction and v1 feature set.

Current direction after the initial DevTools MVP includes richer visual explanation of request/response behavior, beginner-friendly diagnostics, response exploration, request relationship improvements, and controlled experimentation with captured requests.

## License

Blackbox API Visualizer is licensed under the [MIT License](LICENSE).
