const requests: chrome.devtools.network.Request[] = [];
export const requestsUpdated = new EventTarget();

export const NETWORK_CONSENT_STORAGE_KEY = "blackbox-network-consent-v1";

function readInitialCaptureConsent(): boolean {
  try {
    return localStorage.getItem(NETWORK_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

function requestIdentity(request: chrome.devtools.network.Request): string {
  return [
    request.startedDateTime?.toString() ?? "",
    request.request?.method ?? "",
    request.request?.url ?? "",
    String(request.time ?? ""),
  ].join("|");
}

let seenRequestKeys = new Set<string>();
let trackedRequestLength = 0;

function syncSeenRequestKeys(): void {
  if (requests.length < trackedRequestLength) {
    seenRequestKeys = new Set(requests.map(requestIdentity));
  }

  trackedRequestLength = requests.length;
}

function appendRequest(
  request: chrome.devtools.network.Request,
  notify = true
): boolean {
  syncSeenRequestKeys();

  const key = requestIdentity(request);
  if (seenRequestKeys.has(key)) {
    return false;
  }

  seenRequestKeys.add(key);
  requests.push(request);
  trackedRequestLength = requests.length;

  if (notify) {
    requestsUpdated.dispatchEvent(new Event("updated"));
  }

  return true;
}

// Capture is disabled until the user has explicitly granted access.
let isCaptureEnabled = readInitialCaptureConsent();

// True network blocking would require the "debugger" permission, so pausing just stops capture.
let isCapturePaused = false;

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (!isCaptureEnabled || isCapturePaused) {
    return;
  }

  appendRequest(request);
});

/**
 * Seed Blackbox from the requests already visible in the DevTools Network log.
 * This prevents users from losing page-load traffic when they open the Blackbox
 * panel after the inspected page has already made requests.
 */
export function backfillCapturedRequests(): Promise<number> {
  if (!isCaptureEnabled || isCapturePaused) {
    return Promise.resolve(0);
  }

  return new Promise((resolve) => {
    chrome.devtools.network.getHAR((harLog) => {
      let added = 0;

      for (const request of harLog.entries) {
        if (appendRequest(request, false)) {
          added += 1;
        }
      }

      if (added > 0) {
        requestsUpdated.dispatchEvent(new Event("updated"));
      }

      resolve(added);
    });
  });
}

export function setCaptureEnabled(enabled: boolean): void {
  isCaptureEnabled = enabled;
}

export function setCapturePaused(paused: boolean): void {
  isCapturePaused = paused;
}

export default requests;
