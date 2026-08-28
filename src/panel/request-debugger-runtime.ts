import "./sponsor.js";

import { analyzeRequest } from "../network/analyzer.js";
import { diagnoseRequest } from "../network/diagnosticAnalyzer.js";
import type { RequestDiagnosis } from "../network/diagnosticRules.js";
import { getBestInitiatorSource } from "../network/initiatorSource.js";
import {
  buildRequestSourceContext,
  type RequestSourceContext,
} from "../network/requestSourceContext.js";
import { withSourceContext } from "../network/sourceContextDiagnosis.js";
import type { NormalizedRequest, RequestAnalysis } from "../network/types.js";
import {
  copyDebugSummary,
  formatDebugSummary,
} from "../utils/debugSummary.js";
import {
  getSourceResources,
  resetSourceResources,
} from "./devtoolsResources.js";
import {
  renderRequestDiagnosis,
  resetRequestDiagnosis,
} from "./request-debugger-view.js";

const requestsById = new Map<string, NormalizedRequest>();
const requestTimeline: NormalizedRequest[] = [];
const responseLoads = new Map<string, Promise<void>>();

const requestList = document.getElementById("request-list");
const rawResponse = document.getElementById("details-response-body");
const detailsSource = document.getElementById("details-source");
const detailsRelationship = document.getElementById("details-relationship");
const detailsInitiator = document.getElementById("details-initiator");
const diagnosisStatus = document.getElementById("diagnosis-status");
const copySummaryButton = document.getElementById(
  "copy-debug-summary"
) as HTMLButtonElement | null;
const closeDetailsButton = document.getElementById("close-details");

let selectedRequest: NormalizedRequest | null = null;
let selectedAnalysis: RequestAnalysis | null = null;
let selectedDiagnosis: RequestDiagnosis | null = null;
let selectedSourceContext: RequestSourceContext | null = null;
let sourceResolutionVersion = 0;

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

function renderSourceMetadata(
  request: NormalizedRequest,
  context: RequestSourceContext | null
): void {
  const immediate = getBestInitiatorSource(request.initiator);
  const browserInitiator = context?.browserInitiator?.label ?? immediate?.label ?? "N/A";
  const source = context?.primarySource ?? browserInitiator;

  if (detailsSource) {
    detailsSource.textContent = source;
    detailsSource.title = context?.authoredSource?.url ?? immediate?.url ?? "";
  }

  if (detailsRelationship) {
    detailsRelationship.textContent = context
      ? context.relationship ?? "Direct request / no upstream match"
      : "Resolving source context…";
  }

  if (detailsInitiator) {
    detailsInitiator.textContent = browserInitiator;
    detailsInitiator.title = context?.browserInitiator?.url ?? immediate?.url ?? "";
  }
}

function analyzeSelectedRequest(): void {
  if (!selectedRequest) {
    selectedAnalysis = null;
    selectedDiagnosis = null;
    resetRequestDiagnosis();
    return;
  }

  selectedAnalysis = analyzeRequest(selectedRequest);
  selectedDiagnosis = withSourceContext(
    diagnoseRequest(selectedRequest, selectedAnalysis),
    selectedSourceContext
  );
  renderRequestDiagnosis(selectedRequest, selectedDiagnosis);

  if (selectedSourceContext && diagnosisStatus) {
    diagnosisStatus.textContent = selectedRequest.responseBodyLoaded
      ? "Analyzed with response and source context"
      : "Analyzed with source context · loading response context";
  }
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

async function resolveSelectedSourceContext(request: NormalizedRequest): Promise<void> {
  const version = ++sourceResolutionVersion;

  if (diagnosisStatus && selectedRequest?.id === request.id) {
    diagnosisStatus.textContent = "Analyzing request · resolving source context";
  }

  try {
    const resources = await getSourceResources(requestTimeline);
    const context = await buildRequestSourceContext({
      request,
      timeline: requestTimeline,
      resources,
      loadResponseBody,
    });

    if (
      version !== sourceResolutionVersion ||
      selectedRequest?.id !== request.id
    ) {
      return;
    }

    selectedSourceContext = context;
    renderSourceMetadata(request, context);
    analyzeSelectedRequest();
  } catch (error) {
    console.error("Blackbox failed to resolve request source context.", error);

    if (version === sourceResolutionVersion && selectedRequest?.id === request.id) {
      if (diagnosisStatus) {
        diagnosisStatus.textContent = request.responseBodyLoaded
          ? "Analyzed with response context · source mapping unavailable"
          : "Analyzed from request metadata · source mapping unavailable";
      }
    }
  }
}

function selectRequest(request: NormalizedRequest): void {
  selectedRequest = request;
  selectedSourceContext = null;

  if (copySummaryButton) {
    copySummaryButton.disabled = false;
  }

  renderSourceMetadata(request, null);
  analyzeSelectedRequest();
  void loadResponseBody(request);
  void resolveSelectedSourceContext(request);
}

function clearRuntimeState(): void {
  sourceResolutionVersion += 1;
  requestsById.clear();
  requestTimeline.length = 0;
  responseLoads.clear();
  resetSourceResources();
  selectedRequest = null;
  selectedAnalysis = null;
  selectedDiagnosis = null;
  selectedSourceContext = null;

  if (copySummaryButton) {
    copySummaryButton.disabled = true;
  }

  for (const element of [detailsSource, detailsRelationship, detailsInitiator]) {
    if (element) {
      element.textContent = "N/A";
      element.title = "";
    }
  }

  resetRequestDiagnosis();
}

document.addEventListener("normalizedRequestsUpdated", (event) => {
  const detail = (event as CustomEvent<NormalizedRequest[]>).detail ?? [];
  detail.forEach((request) => {
    requestsById.set(request.id, request);
    requestTimeline.push(request);
  });
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
  sourceResolutionVersion += 1;
  selectedRequest = null;
  selectedAnalysis = null;
  selectedDiagnosis = null;
  selectedSourceContext = null;

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
  const diagnosis =
    selectedDiagnosis ??
    withSourceContext(
      diagnoseRequest(selectedRequest, analysis),
      selectedSourceContext
    );
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
