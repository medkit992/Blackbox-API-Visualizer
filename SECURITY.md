# Security Policy

## Supported versions

Blackbox is currently pre-1.0. Security fixes are applied to the latest version on the default branch.

| Version | Supported |
| --- | --- |
| Latest `main` / current release | Yes |
| Older development snapshots | No |

## Reporting a vulnerability

Please do **not** publish sensitive vulnerability details in a normal public issue.

If GitHub's **Report a vulnerability** option is available for this repository, use it to submit the report privately. If private vulnerability reporting is not available, open a minimal issue requesting a private contact channel without including exploit details, credentials, captured traffic, or other sensitive data.

A useful report includes:

- the affected Blackbox version or commit;
- the browser/version used;
- reproduction steps;
- the security impact;
- whether a malicious inspected page can trigger the issue;
- a minimal proof of concept with secrets removed.

## Sensitive network data

Blackbox can inspect URLs, headers, cookies, request bodies, and response bodies. These may contain authentication tokens, API keys, session identifiers, personal data, and application secrets.

Contributors should treat all captured network-controlled strings as untrusted input and avoid exposing sensitive data through logs, exports, screenshots, or unsanitized HTML.

Blackbox should never replay state-changing requests merely to retrieve already-captured response content.
