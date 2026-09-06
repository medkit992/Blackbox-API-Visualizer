import "./request-lifecycle.css";
import { createRequestLifecycleView } from "./request-lifecycle.js";
import type { LifecycleTarget } from "../network/requestLifecycle.js";
import type { RequestDiagnosis } from "../network/diagnosticRules.js";
import type { NormalizedRequest } from "../network/types.js";

const diagnosisRoot = document.getElementById("request-diagnosis");
const lifecycleAnchor = document.getElementById("request-lifecycle-anchor") ?? diagnosisRoot;
function navigateLifecycle(target: LifecycleTarget): void {
  const tab = target === "source" ? "overview" : target;
  const button = document.querySelector<HTMLButtonElement>(`.details-tabs [data-tab="${tab}"]`);
  button?.click();
  if (target === "source" || target === "diagnosis") {
    const evidence = document.getElementById(target === "source" ? "details-source" : "request-diagnosis");
    if (evidence) { evidence.tabIndex = -1; evidence.scrollIntoView({ block: "nearest" }); evidence.focus({ preventScroll: true }); }
  } else button?.focus({ preventScroll: true });
}
const lifecycleView = lifecycleAnchor ? createRequestLifecycleView(lifecycleAnchor, navigateLifecycle) : null;
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
const summaryTitle = document.getElementById("summary-diagnosis-title");
const summaryText = document.getElementById("summary-diagnosis-text");

function humanize(value: string): string {
  return value.split("-").filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function setSectionVisibility(container: HTMLElement | null, visible: boolean): void {
  const section = container?.closest<HTMLElement>(".diagnosis-section");
  if (section) section.hidden = !visible;
}
function renderEvidence(diagnosis: RequestDiagnosis): void {
  if (!diagnosisEvidence) return;
  diagnosisEvidence.textContent = "";
  diagnosisEvidence.classList.toggle("diagnosis-list--empty", diagnosis.evidence.length === 0);
  setSectionVisibility(diagnosisEvidence, diagnosis.evidence.length > 0);
  for (const evidence of diagnosis.evidence) {
    const row = document.createElement("div"); row.className = "diagnosis-evidence-row";
    const label = document.createElement("span"); label.className = "diagnosis-evidence-row__label"; label.textContent = evidence.label;
    const value = document.createElement("span"); value.className = "diagnosis-evidence-row__value"; value.textContent = evidence.value;
    row.append(label, value); diagnosisEvidence.appendChild(row);
  }
}
function renderList(container: HTMLElement | null, items: string[], ordered = false): void {
  if (!container) return;
  container.textContent = "";
  container.classList.toggle("diagnosis-list--empty", items.length === 0);
  setSectionVisibility(container, items.length > 0);
  if (!items.length) return;
  const list = document.createElement(ordered ? "ol" : "ul");
  for (const item of items) { const li = document.createElement("li"); li.textContent = item; list.appendChild(li); }
  container.appendChild(list);
}
export function renderRequestDiagnosis(request: NormalizedRequest, diagnosis: RequestDiagnosis): void {
  lifecycleView?.render(request);
  if (diagnosisRoot) { diagnosisRoot.dataset.diagnosisState = diagnosis.severity; diagnosisRoot.className = `request-diagnosis request-diagnosis--${diagnosis.severity}`; }
  if (diagnosisSeverity) diagnosisSeverity.textContent = diagnosis.severity === "success" ? "Success" : humanize(diagnosis.severity);
  const confidenceApplies = diagnosis.confidence !== "not-applicable";
  if (diagnosisConfidence) { diagnosisConfidence.hidden = !confidenceApplies; diagnosisConfidence.textContent = confidenceApplies ? `${humanize(diagnosis.confidence)} confidence` : ""; }
  if (diagnosisTitle) diagnosisTitle.textContent = diagnosis.title;
  if (diagnosisSummary) diagnosisSummary.textContent = diagnosis.summary;
  // The Summary reuses the same diagnosis; it is not a second analysis pipeline.
  if (summaryTitle) summaryTitle.textContent = diagnosis.title;
  if (summaryText) summaryText.textContent = diagnosis.summary;
  if (diagnosisMeta) diagnosisMeta.hidden = false;
  if (diagnosisCategory) diagnosisCategory.textContent = humanize(diagnosis.category);
  if (diagnosisConfidenceText) {
    const field = diagnosisConfidenceText.closest<HTMLElement>("span"); if (field) field.hidden = !confidenceApplies;
    diagnosisConfidenceText.textContent = confidenceApplies ? humanize(diagnosis.confidence) : "";
  }
  renderEvidence(diagnosis); renderList(diagnosisCauses, diagnosis.likelyCauses); renderList(diagnosisSuggestions, diagnosis.suggestions, true);
  if (diagnosisStatus) diagnosisStatus.textContent = request.responseBodyLoaded ? "Analyzed with response context" : "Analyzed from request metadata · loading response context";
}
export function resetRequestDiagnosis(): void {
  lifecycleView?.reset();
  if (diagnosisRoot) { diagnosisRoot.dataset.diagnosisState = "idle"; diagnosisRoot.className = "request-diagnosis request-diagnosis--idle"; }
  if (diagnosisSeverity) diagnosisSeverity.textContent = "Not analyzed";
  if (diagnosisConfidence) { diagnosisConfidence.hidden = true; diagnosisConfidence.textContent = ""; }
  if (diagnosisTitle) diagnosisTitle.textContent = "Ready for diagnostic analysis";
  if (diagnosisSummary) diagnosisSummary.textContent = "Select a captured request to see what happened, why it likely happened, and what to check next.";
  if (summaryTitle) summaryTitle.textContent = "Select a request";
  if (summaryText) summaryText.textContent = "";
  if (diagnosisMeta) diagnosisMeta.hidden = true;
  if (diagnosisCategory) diagnosisCategory.textContent = "";
  if (diagnosisConfidenceText) diagnosisConfidenceText.textContent = "";
  for (const container of [diagnosisEvidence, diagnosisCauses, diagnosisSuggestions]) {
    if (!container) continue;
    container.textContent = ""; container.classList.add("diagnosis-list--empty"); setSectionVisibility(container, true);
  }
  if (diagnosisEvidence) diagnosisEvidence.innerHTML = "<p>Signals and request facts will appear here.</p>";
  if (diagnosisCauses) diagnosisCauses.innerHTML = "<p>Possible causes will appear here.</p>";
  if (diagnosisSuggestions) diagnosisSuggestions.innerHTML = "<p>Recommended debugging steps will appear here.</p>";
  if (diagnosisStatus) diagnosisStatus.textContent = "Waiting for a request";
}
