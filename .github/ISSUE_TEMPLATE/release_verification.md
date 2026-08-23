---
name: Release verification
about: Verify a candidate build before marking it Stable
title: "Release verification: vX.Y.Z"
labels: ""
assignees: ""
---

## Release record

- **Version:** vX.Y.Z
- **Stage before verification:** Development / Preview
- **Target channel:** Local / Test / Production
- **Current health:** Working / Known issues / Broken / Unknown

## Automated checks

- [ ] Clean dependency installation succeeds
- [ ] Type checking passes
- [ ] Automated tests pass
- [ ] Production build succeeds
- [ ] Build verification scripts pass
- [ ] `package.json` and extension manifest versions match

## Local/unpacked regression checks

- [ ] Extension loads without critical extension/DevTools console errors
- [ ] Blackbox DevTools panel opens correctly
- [ ] Successful requests are captured
- [ ] Failed requests are captured and surfaced correctly
- [ ] Request details render correctly
- [ ] Response-body inspection works where Chromium exposes the body
- [ ] Filtering/search works
- [ ] Graph/list navigation works without losing session state

## Packaged/distribution checks

- [ ] Exact release package has been generated
- [ ] Exact release package has been tested before submission
- [ ] Chrome Web Store upload/update succeeds
- [ ] Installed Chrome Web Store build reports the expected version
- [ ] Chrome Web Store build opens correctly
- [ ] Chrome Web Store build captures requests correctly
- [ ] Chrome Web Store build passes the core regression checks above

## Known issues

List any remaining known issues and whether they prevent Stable designation.

## Final classification

Complete only after verification:

- **Stage:** Stable / Preview / Retired
- **Channel:** Local / Test / Production
- **Health:** Working / Known issues / Broken

### Decision

- [ ] Mark this version **Stable** and safe to recommend
- [ ] Keep this version **Preview** pending more work/testing
- [ ] Mark this version **Retired/Broken** and point users to another version

See [`docs/release-policy.md`](../../docs/release-policy.md) for the full release policy and Stable release gate.
