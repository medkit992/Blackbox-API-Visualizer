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

// Capture is disabled until the user has explicitly granted access.
let isCaptureEnabled = readInitialCaptureConsent();

// True network blocking would require the "debugger" permission, so pausing just stops capture.
let isCapturePaused = false;

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (!isCaptureEnabled || isCapturePaused) {
    return;
  }

  requests.push(request);
  requestsUpdated.dispatchEvent(new Event("updated"));
});

export function setCaptureEnabled(enabled: boolean): void {
  isCaptureEnabled = enabled;
}

export function setCapturePaused(paused: boolean): void {
  isCapturePaused = paused;
}

export default requests;
