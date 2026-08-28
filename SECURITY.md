# Security Policy

## Supported versions

Blackbox is currently pre-1.0. Security fixes are applied to the latest supported release line and the default branch.

| Version | Supported |
| --- | --- |
| Latest `main` / current release candidate | Yes |
| Current Stable Chrome Web Store release | Yes for critical fixes until superseded |
| Older development snapshots / retired releases | No |

## Reporting a vulnerability

Please do **not** publish sensitive vulnerability details in a normal public issue.

If GitHub's **Report a vulnerability** option is available for this repository, use it to submit the report privately. If private vulnerability reporting is not available, open a minimal issue requesting a private contact channel without including exploit details, credentials, captured traffic, proprietary source code, or other sensitive data.

A useful report includes:

- the affected Blackbox version or commit;
- the browser/version used;
- reproduction steps;
- the security impact;
- whether a malicious inspected page can trigger the issue;
- whether source-map/source-correlation behavior is involved;
- a minimal proof of concept with secrets and proprietary content removed.

## Sensitive network and source data

Blackbox can inspect URLs, headers, cookies, request bodies, response bodies, initiator stacks, application source resources, and source maps. These may contain authentication tokens, API keys, session identifiers, personal data, proprietary source code, and application secrets.

Contributors should treat all captured network/source-controlled strings as untrusted input and avoid exposing sensitive data through logs, copied summaries, screenshots, exports, or unsanitized HTML.

### Current safeguards

- Network/source analysis is performed locally in the DevTools extension session.
- Blackbox never replays state-changing requests merely to retrieve already-captured response content.
- Selecting a request reads the captured response through DevTools rather than issuing the request again.
- Derived-resource provenance only inspects a bounded set of recent successful Fetch/XHR responses and requires exact URL relationships.
- Source correlation rejects ambiguous authored matches rather than guessing.
- Same-origin source-map discovery is bounded to maps associated with captured scripts and does not require broad host permissions.
- Copy Debug Summary intentionally excludes raw headers, cookies, authorization values, request bodies, response bodies, and source snippets.
- Clear/navigation/session teardown resets captured/source-context caches.

## Inspected-page trust boundary

A malicious or unusual inspected page can influence the URLs, headers, bodies, source maps, source text, function names, and other values Blackbox displays or analyzes. Treat this content as attacker-controlled input.

Source maps and sourceURL metadata must never be allowed to cause arbitrary code execution, arbitrary cross-origin fetching, unsafe HTML injection, or local-file access.

## Future features

Any future replay, export, cloud, team-sharing, or source-snippet feature must receive a separate security/privacy review before release because those features can change the current local-only trust boundary.
