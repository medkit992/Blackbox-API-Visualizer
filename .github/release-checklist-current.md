# Release verification: v0.1.1

## Release record

- **Version:** v0.1.1
- **Stage before verification:** Preview / production candidate
- **Target channel:** Production (Chrome Web Store)
- **Current health:** Unknown pending Web Store verification

## Automated checks

- [ ] Clean dependency installation succeeds
- [ ] Type checking passes
- [ ] Automated tests pass
- [ ] Production build succeeds
- [ ] Build verification scripts pass
- [ ] `package.json`, source manifest, and built manifest versions match

## Local/unpacked regression checks

- [ ] Extension loads without critical extension/DevTools console errors
- [ ] Blackbox DevTools panel opens correctly
- [ ] Successful requests are captured
- [ ] Failed requests are captured and surfaced correctly
- [ ] Request details render correctly
- [ ] Response-body inspection works where Chromium exposes the body
- [ ] Filtering/search works
- [ ] Graph/list navigation works without losing session state

## Production/Web Store checks

- [ ] Exact `v0.1.1` release package has been tested before submission
- [ ] Chrome Web Store update succeeds
- [ ] Installed Chrome Web Store build reports `0.1.1`
- [ ] Chrome Web Store build opens correctly
- [ ] Chrome Web Store build captures requests correctly
- [ ] Chrome Web Store build passes the core regression checks above

## Final classification

Complete after verification:

- **Stage:** Stable / Preview / Retired
- **Channel:** Production
- **Health:** Working / Known issues / Broken

### Decision

- [ ] Mark `v0.1.1` **Stable** and safe to recommend
- [ ] Keep `v0.1.1` **Preview** pending more work/testing
- [ ] Mark `v0.1.1` **Retired/Broken** and ship another patch

Once this verification is complete, transfer the final result into [`docs/release-status.md`](../docs/release-status.md) and the root README. This file may then be archived or replaced by a GitHub release-verification issue.
