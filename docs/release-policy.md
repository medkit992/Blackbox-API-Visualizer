# Release Policy

Blackbox uses Semantic Versioning (`MAJOR.MINOR.PATCH`) for version numbers and a separate release-status system to describe how trustworthy and deployable a build is.

## Version numbers

- **MAJOR** (`2.0.0`) — a major product generation, breaking change, or substantial change to Blackbox's core workflow/capabilities.
- **MINOR** (`1.3.0`) — a meaningful new feature or cohesive feature set that remains compatible with the current major generation.
- **PATCH** (`1.3.2`) — bug fixes, compatibility fixes, performance improvements, and small UX changes that do not introduce a new feature set.

The roadmap may target roughly ten planned minor releases per major generation, but this is a planning convention rather than a hard SemVer limit.

## Release stages

Version and stage are independent.

| Stage | Meaning |
| --- | --- |
| **Development** | Actively being built. Intended for local/unpacked development, not end users. |
| **Preview** | Feature-complete enough for testing, but not yet trusted as a general release. Includes alpha, beta, and release-candidate builds. |
| **Stable** | Passed the release gate through the real distribution path and is safe to recommend to users. |
| **Retired** | Superseded, broken, insecure, or otherwise no longer recommended. |

## Distribution channels

| Channel | Meaning |
| --- | --- |
| **Local** | Built from source and loaded unpacked in Chromium. |
| **Test** | Packaged build distributed to trusted testers or another limited testing path. |
| **Production** | Publicly distributed through the Chrome Web Store. |

A build being in **Production** does not automatically make it **Stable**. Stability is a confidence designation earned only after verification of the actual distributed build.

## Release health

Each published version may also be described by its current observed health:

- **Working** — no known issue prevents the advertised core functionality from working.
- **Known issues** — usable, but one or more documented defects remain.
- **Broken** — a defect prevents core advertised functionality from working correctly.

Health can change after release. A previously stable build may become Retired if a critical compatibility, security, or functional problem is discovered.

## Stable release gate

A version may be marked **Stable** only after all applicable checks pass:

- [ ] Dependency installation succeeds from a clean checkout.
- [ ] Type checking passes.
- [ ] Automated tests pass.
- [ ] Production build succeeds.
- [ ] Build verification scripts pass.
- [ ] The unpacked extension loads without critical extension/DevTools console errors.
- [ ] Core request capture works on representative pages.
- [ ] Request inspection works for successful and failed requests.
- [ ] Response-body inspection works where Chromium exposes the response.
- [ ] Graph/list navigation works without breaking captured-session state.
- [ ] The exact packaged build intended for distribution is tested.
- [ ] The Chrome Web Store build installs/updates successfully.
- [ ] The Chrome Web Store build passes the same core regression test as the local build.
- [ ] No known issue breaks the advertised core functionality.

A stable release does **not** mean bug-free. It means the maintainers are comfortable recommending that exact distributed version to users.

## Recommended release flow

```text
Development
    ↓
Preview / Release Candidate
    ↓
Package + automated verification
    ↓
Test channel (when useful)
    ↓
Production / Chrome Web Store
    ↓
Verify the actual distributed build
    ↓
Stable
```

If production verification fails, the release remains non-stable and should be marked **Broken** or **Known issues** until fixed or retired.

## GitHub release conventions

When GitHub Releases are used:

- Development work normally does not require a GitHub Release.
- Preview builds should be GitHub **pre-releases** and may use tags such as `v0.2.0-beta.1` or `v0.2.0-rc.1`.
- Stable builds should use normal GitHub Releases such as `v0.2.0`.
- A broken or superseded release should remain visible for history, with its release notes updated to state that it is Retired/Broken and point users to the recommended version.

Chrome extension manifest versions must remain numeric. If preview builds are distributed through Chrome, use a Chrome-compatible numeric `version` and, when useful, a descriptive `version_name` for labels such as beta or release candidate.

## Release record format

Release notes and verification issues should record these four independent values:

```text
Version: 0.2.0
Stage: Preview | Stable | Retired
Channel: Local | Test | Production
Health: Working | Known issues | Broken
```

## Current early-release interpretation

- **v0.1.0** — reached the Chrome Web Store, but the distributed build is known to be broken. Treat it as **Retired / Production / Broken**.
- **v0.1.1** — current repository version and candidate to become the first Stable release. It must pass the Stable release gate using the actual Chrome Web Store build before being marked Stable.
