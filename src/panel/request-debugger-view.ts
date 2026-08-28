import type { RequestDiagnosis } from "../network/diagnosticRules.js";
import type { NormalizedRequest } from "../network/types.js";

const diagnosisRoot = document.getElementById("request-diagnosis");
const diagnosisSeverity = document.getElementById("diagnosis-severity");
const diagnosisConfidence = document.getElementById("diagnosis-confidence");
const diagnosisTitle = document.getElementById("diagnosis-title");
const diagnosisSummary = document.getElementById("diagnosis-summary");
const diagnosisMeta = document.getElementById("diagnosis-meta");
const diagnosisCategory = document.getElementById("diagnosis-category");
const diagnosisConfidenceText = document.getElementById("diagnosis-confidence-text");
const diagnosisEvidence = document.getElementById("diagnosis-evidence");
const diagnosisCauses = document.getElementById("diagnosis-causes");
const diagnosisSuggestions = document.getElementById("diagnosis-suggestions");
const diagnosisStatus = document.getElementById("diagnosis-status");

function humanize(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setSectionVisibility(container: HTMLElement | null, visible: boolean): void {
  const section = container?.closest<HTMLElement>(".diagnosis-section");
  if (section) {
    section.hidden = !visible;
  }
}

function renderEvidence(diagnosis: RequestDiagnosis): void {
  if (!diagnosisEvidence) {
    return;
  }

  diagnosisEvidence.textContent = "";
  diagnosisEvidence.classList.toggle(
    "diagnosis-list--empty",
    diagnosis.evidence.length === 0
  );
  setSectionVisibility(diagnosisEvidence, diagnosis.evidence.length > 0);

  for (const evidence of diagnosis.evidence) {
    const row = document.createElement("div");
    row.className = "diagnosis-evidence-row";

    const label = document.createElement("span");
    label.className = "diagnosis-evidence-row__label";
    label.textContent = evidence.label;

    const value = document.createElement("span");
    value.className = "diagnosis-evidence-row__value";
    value.textContent = evidence.value;

    row.append(label, value);
    diagnosisEvidence.appendChild(row);
  }
}

function renderList(
  container: HTMLElement | null,
  items: string[],
  ordered = false
): void {
  if (!container) {
    return;
  }

  container.textContent = "";
  container.classList.toggle("diagnosis-list--empty", items.length === 0);
  setSectionVisibility(container, items.length > 0);

  if (items.length === 0) {
    return;
  }

  const list = document.createElement(ordered ? "ol" : "ul");
  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.appendChild(listItem);
  }

  container.appendChild(list);
}

function severityLabel(diagnosis: RequestDiagnosis): string {
  if (diagnosis.severity === "success") {
    return "Success";
  }

  return humanize(diagnosis.severity);
}

export function renderRequestDiagnosis(
  request: NormalizedRequest,
  diagnosis: RequestDiagnosis
): void {
  if (diagnosisRoot) {
    diagnosisRoot.dataset.diagnosisState = diagnosis.severity;
    diagnosisRoot.className = `request-diagnosis request-diagnosis--${diagnosis.severity}`;
  }

  if (diagnosisSeverity) {
    diagnosisSeverity.textContent = severityLabel(diagnosis);
  }

  const confidenceApplies = diagnosis.confidence !== "not-applicable";

  if (diagnosisConfidence) {
    diagnosisConfidence.hidden = !confidenceApplies;
    diagnosisConfidence.textContent = confidenceApplies
      ? `${humanize(diagnosis.confidence)} confidence`
      : "";
  }

  if (diagnosisTitle) {
    diagnosisTitle.textContent = diagnosis.title;
  }

  if (diagnosisSummary) {
    diagnosisSummary.textContent = diagnosis.summary;
  }

  if (diagnosisMeta) {
    diagnosisMeta.hidden = false;
  }

  if (diagnosisCategory) {
    diagnosisCategory.textContent = humanize(diagnosis.category);
  }

  if (diagnosisConfidenceText) {
    const confidenceField = diagnosisConfidenceText.closest<HTMLElement>("span");
    if (confidenceField) {
      confidenceField.hidden = !confidenceApplies;
    }

    diagnosisConfidenceText.textContent = confidenceApplies
      ? humanize(diagnosis.confidence)
      : "";
  }

  renderEvidence(diagnosis);
  renderList(diagnosisCauses, diagnosis.likelyCauses);
  renderList(diagnosisSuggestions, diagnosis.suggestions, true);

  if (diagnosisStatus) {
    diagnosisStatus.textContent = request.responseBodyLoaded
      ? "Analyzed with response context"
      : "Analyzed from request metadata · loading response context";
  }
}

export function resetRequestDiagnosis(): void {
  if (diagnosisRoot) {
    diagnosisRoot.dataset.diagnosisState = "idle";
    diagnosisRoot.className = "request-diagnosis request-diagnosis--idle";
  }

  if (diagnosisSeverity) {
    diagnosisSeverity.textContent = "Not analyzed";
  }

  if (diagnosisConfidence) {
    diagnosisConfidence.hidden = true;
    diagnosisConfidence.textContent = "";
  }

  if (diagnosisTitle) {
    diagnosisTitle.textContent = "Ready for diagnostic analysis";
  }

  if (diagnosisSummary) {
    diagnosisSummary.textContent =
      "Select a captured request to see what happened, why it likely happened, and what to check next.";
  }

  if (diagnosisMeta) {
    diagnosisMeta.hidden = true;
  }

  if (diagnosisCategory) {
    diagnosisCategory.textContent = "";
  }

  if (diagnosisConfidenceText) {
    diagnosisConfidenceText.textContent = "";
  }

  for (const container of [diagnosisEvidence, diagnosisCauses, diagnosisSuggestions]) {
    if (!container) {
      continue;
    }

    container.textContent = "";
    container.classList.add("diagnosis-list--empty");
    setSectionVisibility(container, true);
  }

  if (diagnosisEvidence) {
    diagnosisEvidence.innerHTML = "<p>Signals and request facts will appear here.</p>";
  }

  if (diagnosisCauses) {
    diagnosisCauses.innerHTML = "<p>Possible causes will appear here.</p>";
  }

  if (diagnosisSuggestions) {
    diagnosisSuggestions.innerHTML = "<p>Recommended debugging steps will appear here.</p>";
  }

  if (diagnosisStatus) {
    diagnosisStatus.textContent = "Waiting for a request";
  }
}
