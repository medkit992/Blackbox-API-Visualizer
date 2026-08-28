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
- [ ] `package.json`, `package-lock.json`, source manifest, and built manifest versions are aligned.
- [ ] Type checking passes.
- [ ] Automated tests pass.
- [ ] Production build succeeds.
- [ ] Build verification scripts pass.
- [ ] The unpacked extension loads without critical extension/DevTools console errors.
- [ ] Core request capture works on representative pages.
- [ ] Request inspection works for successful and failed requests.
- [ ] Response-body inspection works where Chromium exposes the response.
- [ ] Diagnostic behavior degrades conservatively when evidence is incomplete.
- [ ] Source/provenance analysis returns truthful fallbacks when authored context is unavailable or ambiguous.
- [ ] Graph/list navigation works without breaking captured-session state.
- [ ] Privacy/consent text accurately describes the current response/source/provenance behavior.
- [ ] Chrome Web Store Privacy practices disclosures match the actual data handled by the extension.
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
Extended/manual testing
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
- Preview builds may be GitHub **pre-releases** and may use tags such as `v0.3.0-beta.1` or `v0.3.0-rc.1`.
- A version intended to match a Chrome Web Store submission may use the final numeric tag (for example `v0.3.0`) while its repository release-status documentation remains **Preview** until the distributed Web Store build is verified.
- Once the exact distributed build passes the Stable gate, the same version can be promoted to **Stable** in release-status documentation without changing the version number.
- A broken or superseded release should remain visible for history, with its release notes/status updated to point users to the recommended version.

Chrome extension manifest versions must remain numeric. If preview builds are distributed through Chrome, use a Chrome-compatible numeric `version` and, when useful, a descriptive `version_name` for labels such as beta or release candidate.

## Release packaging conventions

For Chrome Web Store and GitHub binary packages:

- Build from the intended merged/tagged commit.
- Run the full CI-equivalent validation before packaging.
- ZIP the **contents of `dist/`**, so `manifest.json` is at the ZIP root.
- Do not ZIP the repository root, source tree, `node_modules`, or an extra parent `dist/` directory.
- Load/test the exact ZIP (or its extracted contents) before submitting it to the Chrome Web Store.
- Keep release binaries in GitHub Releases rather than treating an old checked-in ZIP as the source of truth for the current release.

## Privacy release gate

Any change to what Blackbox reads or how it uses sensitive website/network data must be reviewed as part of release preparation.

At minimum:

1. Update the in-product disclosure/consent text when the user-facing data-access behavior materially changes.
2. Update `PRIVACY.md` and the published privacy page.
3. Confirm the Chrome Web Store Privacy practices data-type disclosures still cover the data handled.
4. Confirm Limited Use statements remain accurate and all data handling is necessary for Blackbox's disclosed developer-tool purpose.
5. Avoid adding broader permissions/host access when a narrower DevTools/same-origin mechanism can implement the feature.

## Release record format

Release notes and verification issues should record these four independent values:

```text
Version: 0.3.0
Stage: Preview | Stable | Retired
Channel: Local | Test | Production
Health: Working | Known issues | Broken
```

## Current early-release interpretation

- **v0.1.0** — reached the Chrome Web Store, but the distributed build is known to be broken. Treat it as **Retired / Production history / Broken**.
- **v0.1.1** — superseded by the capture-reliability patch and no longer recommended.
- **v0.1.2** — verified working through the Chrome Web Store and remains the current **Stable / Production / Working** release until a later version passes the Stable gate.
- **v0.2.0** — Response Explorer candidate superseded before production verification; its functionality is carried forward into v0.3.0.
- **v0.3.0** — Request Debugger / Source Context release candidate. Treat it as **Preview / Local-Test / Working** until the exact packaged Chrome Web Store build passes the Stable release gate; then promote the same version to **Stable / Production / Working**.
