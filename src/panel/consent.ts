import {
  backfillCapturedRequests,
  NETWORK_CONSENT_STORAGE_KEY,
  setCaptureEnabled,
  setCapturePaused,
} from "../network/capture.js";

// The consent overlay is intentionally visible in CSS until this module runs.
// If a bad production package ships without executable JavaScript, users see a
// privacy/capture failure instead of a misleading static "Recording" UI.
document.documentElement.classList.add("blackbox-initialized");

const consentOverlay = document.getElementById("network-consent");
const consentAcceptButton = document.getElementById("consent-accept");
const consentDeclineButton = document.getElementById("consent-decline");
const consentRevokeButton = document.getElementById("consent-revoke");
const consentCloseButton = document.getElementById("consent-close");
const privacySettingsButton = document.getElementById("privacy-settings");
const recordingStatus = document.getElementById("recording-status");
const toggleRecordingButton = document.getElementById(
  "toggle-recording"
) as HTMLButtonElement | null;

function hasConsent(): boolean {
  try {
    return localStorage.getItem(NETWORK_CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

function persistConsent(granted: boolean): void {
  try {
    if (granted) {
      localStorage.setItem(NETWORK_CONSENT_STORAGE_KEY, "granted");
    } else {
      localStorage.removeItem(NETWORK_CONSENT_STORAGE_KEY);
    }
  } catch {
    // If storage is unavailable, treat consent as session-only.
  }
}

function updateCaptureUi(granted: boolean): void {
  if (recordingStatus) {
    recordingStatus.textContent = granted ? "Recording" : "Consent required";
    recordingStatus.classList.toggle("recording-status--paused", !granted);
  }

  if (toggleRecordingButton) {
    toggleRecordingButton.disabled = !granted;
    toggleRecordingButton.textContent = "Pause";
  }
}

function showConsentDialog(mode: "first-run" | "settings"): void {
  if (!consentOverlay) {
    return;
  }

  const granted = hasConsent();

  consentOverlay.hidden = false;
  consentOverlay.dataset.mode = mode;

  if (consentAcceptButton) {
    consentAcceptButton.hidden = granted;
  }
  if (consentDeclineButton) {
    consentDeclineButton.hidden = granted || mode === "settings";
  }
  if (consentRevokeButton) {
    consentRevokeButton.hidden = !granted;
  }
  if (consentCloseButton) {
    consentCloseButton.hidden = mode === "first-run" && !granted;
  }
}

function hideConsentDialog(): void {
  if (consentOverlay) {
    consentOverlay.hidden = true;
  }
}

function backfillExistingTraffic(): void {
  void backfillCapturedRequests().catch((error: unknown) => {
    console.error("Blackbox failed to backfill the DevTools network log.", error);
  });
}

const initialConsent = hasConsent();
setCaptureEnabled(initialConsent);
updateCaptureUi(initialConsent);

if (initialConsent) {
  hideConsentDialog();

  // Wait for both panel modules to finish registering their listeners before
  // dispatching the initial HAR backfill event.
  window.addEventListener("load", backfillExistingTraffic, { once: true });
} else {
  showConsentDialog("first-run");
}

consentAcceptButton?.addEventListener("click", () => {
  persistConsent(true);
  setCaptureEnabled(true);
  setCapturePaused(false);
  updateCaptureUi(true);
  hideConsentDialog();
  backfillExistingTraffic();
});

consentDeclineButton?.addEventListener("click", () => {
  persistConsent(false);
  setCaptureEnabled(false);
  updateCaptureUi(false);
  hideConsentDialog();
});

consentRevokeButton?.addEventListener("click", () => {
  persistConsent(false);
  setCaptureEnabled(false);
  setCapturePaused(false);
  updateCaptureUi(false);

  // Reuse the existing Clear handler so captured session data disappears immediately.
  document.getElementById("clear-requests")?.click();

  showConsentDialog("settings");
});

consentCloseButton?.addEventListener("click", hideConsentDialog);

privacySettingsButton?.addEventListener("click", () => {
  showConsentDialog("settings");
});
