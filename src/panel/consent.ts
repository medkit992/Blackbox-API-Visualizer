import {
  NETWORK_CONSENT_STORAGE_KEY,
  setCaptureEnabled,
  setCapturePaused,
} from "../network/capture.js";

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

const initialConsent = hasConsent();
setCaptureEnabled(initialConsent);
updateCaptureUi(initialConsent);

if (!initialConsent) {
  showConsentDialog("first-run");
}

consentAcceptButton?.addEventListener("click", () => {
  persistConsent(true);
  setCaptureEnabled(true);
  setCapturePaused(false);
  updateCaptureUi(true);
  hideConsentDialog();
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
