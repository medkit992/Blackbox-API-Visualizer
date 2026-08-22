const requests: chrome.devtools.network.Request[] = [];
export const requestsUpdated = new EventTarget();

// True network blocking would require the "debugger" permission, so pausing just stops capture
let isCapturePaused = false;

chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (isCapturePaused) {
    return;
  }

  requests.push(request);
  requestsUpdated.dispatchEvent(new Event("updated"));
});

export function setCapturePaused(paused: boolean): void {
  isCapturePaused = paused;
}

export default requests;