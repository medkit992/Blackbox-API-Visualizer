import "./sponsor.js";

import { analyzeRequest } from "../network/analyzer.js";
import { diagnoseRequest } from "../network/diagnosticAnalyzer.js";
import type { RequestDiagnosis } from "../network/diagnosticRules.js";
import { getBestInitiatorSource } from "../network/initiatorSource.js";
import type { NormalizedRequest, RequestAnalysis } from "../network/types.js";
import {
  copyDebugSummary,
  formatDebugSummary,
} from "../utils/debugSummary.js";
import {
  renderRequestDiagnosis,
  resetRequestDiagnosis,
} from "./request-debugger-view.js";

const requestsById = new Map<string, NormalizedRequest>();
const responseLoads = new Map<string, Promise<void>>();

const requestList = document.getElementById("request-list");
const rawResponse = document.getElementById("details-response-body");
const detailsInitiator = document.getElementById("details-initiator");
const diagnosisStatus = document.getElementById("diagnosis-status");
const copySummaryButton = document.getElementById(
  "copy-debug-summary"
) as HTMLButtonElement | null;
const closeDetailsButton = document.getElementById("close-details");

let selectedRequest: NormalizedRequest | null = null;
let selectedAnalysis: RequestAnalysis | null = null;
let selectedDiagnosis: RequestDiagnosis | null = null;

function renderResponseBody(request: NormalizedRequest): void {
  if (!rawResponse || selectedRequest?.id !== request.id) {
    return;
  }

  const content = request.responseBody ?? "";
  const encoding = request.responseBodyEncoding ?? "";
  const isImage =
    request.category === "Image" || request.responseMimeType.startsWith("image/");

  if (isImage && encoding === "base64" && content) {
    rawResponse.textContent = "";
    const image = document.createElement("img");
    image.src = `data:${request.responseMimeType};base64,${content}`;
    image.alt = request.path;
    image.className = "response-preview-image";
    rawResponse.appendChild(image);
    return;
  }

  rawResponse.textContent = content || "(empty response body)";
}

function renderInitiatorSource(request: NormalizedRequest): void {
  if (!detailsInitiator) {
    return;
  }

  const source = getBestInitiatorSource(request.initiator);
  detailsInitiator.textContent = source?.label ?? "N/A";

  if (!source) {
    detailsInitiator.title = "";
    return;
  }

  const titleParts: string[] = [];
  if (source.generatedLabel) {
    titleParts.push(`Captured location: ${source.generatedLabel}`);
  }
  if (source.url) {
    titleParts.push(source.url);
  }

  detailsInitiator.title = titleParts.join("\n");
}

function analyzeSelectedRequest(): void {
  if (!selectedRequest) {
    selectedAnalysis = null;
    selectedDiagnosis = null;
    resetRequestDiagnosis();
    return;
  }

  selectedAnalysis = analyzeRequest(selectedRequest);
  selectedDiagnosis = diagnoseRequest(selectedRequest, selectedAnalysis);
  renderRequestDiagnosis(selectedRequest, selectedDiagnosis);
}

function loadResponseBody(request: NormalizedRequest): Promise<void> {
  if (request.responseBodyLoaded) {
    renderResponseBody(request);
    return Promise.resolve();
  }

  const existingLoad = responseLoads.get(request.id);
  if (existingLoad) {
    return existingLoad;
  }

  if (rawResponse && selectedRequest?.id === request.id) {
    rawResponse.textContent = "Loading response body...";
  }

  const load = new Promise<void>((resolve) => {
    try {
      request.raw.getContent((content, encoding) => {
        request.responseBody = content ?? "";
        request.responseBodyEncoding = encoding || undefined;
        request.responseBodyLoaded = true;

        renderResponseBody(request);

        document.dispatchEvent(
          new CustomEvent("responseBodyLoaded", {
            detail: request,
          })
        );

        resolve();
      });
    } catch (error) {
      console.error("Blackbox failed to load a response body.", error);

      if (rawResponse && selectedRequest?.id === request.id) {
        rawResponse.textContent = "Response body is no longer available.";
      }

      if (selectedRequest?.id === request.id) {
        analyzeSelectedRequest();
        if (diagnosisStatus) {
          diagnosisStatus.textContent =
            "Analyzed from request metadata · response body unavailable";
        }
      }

      resolve();
    }
  }).finally(() => {
    responseLoads.delete(request.id);
  });

  responseLoads.set(request.id, load);
  return load;
}

function selectRequest(request: NormalizedRequest): void {
  selectedRequest = request;

  if (copySummaryButton) {
    copySummaryButton.disabled = false;
  }

  renderInitiatorSource(request);
  analyzeSelectedRequest();
  void loadResponseBody(request);
}

function clearRuntimeState(): void {
  requestsById.clear();
  responseLoads.clear();
  selectedRequest = null;
  selectedAnalysis = null;
  selectedDiagnosis = null;

  if (copySummaryButton) {
    copySummaryButton.disabled = true;
  }

  if (detailsInitiator) {
    detailsInitiator.textContent = "N/A";
    detailsInitiator.title = "";
  }

  resetRequestDiagnosis();
}

document.addEventListener("normalizedRequestsUpdated", (event) => {
  const detail = (event as CustomEvent<NormalizedRequest[]>).detail ?? [];
  detail.forEach((request) => requestsById.set(request.id, request));
});

document.addEventListener("responseBodyLoaded", (event) => {
  const request = (event as CustomEvent<NormalizedRequest>).detail;
  if (!request || selectedRequest?.id !== request.id) {
    return;
  }

  selectedRequest = request;
  analyzeSelectedRequest();
});

document.addEventListener("pageReloaded", clearRuntimeState);

document.getElementById("clear-requests")?.addEventListener("click", clearRuntimeState);

requestList?.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLTableRowElement>(
    "tr[data-request-id]"
  );
  const requestId = row?.dataset.requestId;

  if (!requestId) {
    return;
  }

  const request = requestsById.get(requestId);
  if (request) {
    selectRequest(request);
  }
});

closeDetailsButton?.addEventListener("click", () => {
  selectedRequest = null;
  selectedAnalysis = null;
  selectedDiagnosis = null;

  if (copySummaryButton) {
    copySummaryButton.disabled = true;
  }

  resetRequestDiagnosis();
});

copySummaryButton?.addEventListener("click", async () => {
  if (!selectedRequest) {
    return;
  }

  const analysis = selectedAnalysis ?? analyzeRequest(selectedRequest);
  const diagnosis = selectedDiagnosis ?? diagnoseRequest(selectedRequest, analysis);
  const originalLabel = copySummaryButton.textContent ?? "Copy Debug Summary";

  try {
    const summary = formatDebugSummary({
      request: selectedRequest,
      analysis,
      diagnosis,
    });

    await copyDebugSummary(summary);
    copySummaryButton.textContent = "Copied";
  } catch (error) {
    console.error("Blackbox failed to copy the debug summary.", error);
    copySummaryButton.textContent = "Copy failed";
  }

  window.setTimeout(() => {
    copySummaryButton.textContent = originalLabel;
  }, 1000);
});

resetRequestDiagnosis();
