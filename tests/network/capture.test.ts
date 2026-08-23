import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeRequest(
  url = "https://api.example.com/users",
  startedDateTime = "2026-08-23T20:00:00.000Z"
): chrome.devtools.network.Request {
  return {
    startedDateTime,
    time: 100,
    request: {
      method: "GET",
      url,
    },
  } as chrome.devtools.network.Request;
}

describe("network capture", () => {
  let finishedListener: ((request: chrome.devtools.network.Request) => void) | undefined;
  let harEntries: chrome.devtools.network.Request[];

  beforeEach(() => {
    vi.resetModules();
    harEntries = [];
    finishedListener = undefined;

    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    vi.stubGlobal("chrome", {
      devtools: {
        network: {
          onRequestFinished: {
            addListener: vi.fn(
              (listener: (request: chrome.devtools.network.Request) => void) => {
                finishedListener = listener;
              }
            ),
          },
          getHAR: vi.fn(
            (callback: (log: { entries: chrome.devtools.network.Request[] }) => void) => {
              callback({ entries: harEntries });
            }
          ),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not capture live requests before consent is enabled", async () => {
    const capture = await import("../../src/network/capture.js");
    const request = makeRequest();

    finishedListener?.(request);

    expect(capture.default).toHaveLength(0);
  });

  it("captures live requests after consent is enabled", async () => {
    const capture = await import("../../src/network/capture.js");
    const request = makeRequest();

    capture.setCaptureEnabled(true);
    finishedListener?.(request);

    expect(capture.default).toEqual([request]);
  });

  it("backfills requests that completed before the Blackbox panel opened", async () => {
    const capture = await import("../../src/network/capture.js");
    harEntries.push(
      makeRequest("https://api.example.com/initial", "2026-08-23T20:00:00.000Z"),
      makeRequest("https://api.example.com/data", "2026-08-23T20:00:01.000Z")
    );

    capture.setCaptureEnabled(true);
    const added = await capture.backfillCapturedRequests();

    expect(added).toBe(2);
    expect(capture.default).toHaveLength(2);
  });

  it("deduplicates a request seen by both live capture and HAR backfill", async () => {
    const capture = await import("../../src/network/capture.js");
    const request = makeRequest();

    capture.setCaptureEnabled(true);
    finishedListener?.(request);
    harEntries.push(request);

    const added = await capture.backfillCapturedRequests();

    expect(added).toBe(0);
    expect(capture.default).toHaveLength(1);
  });

  it("rebuilds deduplication state after the request list is cleared", async () => {
    const capture = await import("../../src/network/capture.js");
    const request = makeRequest();

    capture.setCaptureEnabled(true);
    finishedListener?.(request);
    capture.default.length = 0;
    finishedListener?.(request);

    expect(capture.default).toHaveLength(1);
  });
});
