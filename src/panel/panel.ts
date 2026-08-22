import requests, { requestsUpdated, setCapturePaused } from "../network/capture.js";
import type { NormalizedRequest } from "../network/types.js";
import parseRequest, { normalizeRequest } from "../network/parser.js";
import { analyzeRequest, getIssueSeverity } from "../network/analyzer.js";
import { analyzeSession, getSessionIssueSeverity } from "../network/sessionAnalyzer.js";
import cytoscape from "cytoscape";
import type { Core as CytoscapeCore, ElementDefinition, StylesheetStyle } from "cytoscape";
import { buildNetworkGraph, getDomainNodeId } from "../network/graphBuilder.js";
import type { GraphNode } from "../network/types.js";

// Refreshed on load and after navigation so the Graph view's root node reflects the inspected page
let inspectedPageUrl = "";

function refreshInspectedPageUrl(): void {
  chrome.devtools.inspectedWindow.eval("location.href", (result) => {
    if (typeof result === "string") {
      inspectedPageUrl = result;
    }
  });
}

refreshInspectedPageUrl();

chrome.devtools.network.onNavigated.addListener(() => {
  requests.length = 0;
  normalizedRequests.length = 0;
  rawRequestsById.clear();
  expandedDomains.clear();
  refreshInspectedPageUrl();

  document.dispatchEvent(new CustomEvent("pageReloaded"));
});

const normalizedRequests: NormalizedRequest[] = [];
// Keeps the original DevTools request around so its captured content can be read via getContent()
const rawRequestsById = new Map<string, chrome.devtools.network.Request>();

requestsUpdated.addEventListener("updated", () => {
  const newRequests = requests.slice(normalizedRequests.length);

  const normalizedNewRequests = newRequests.map((request) =>
    normalizeRequest(parseRequest(request))
  );

  normalizedNewRequests.forEach((normalizedRequest, index) => {
    rawRequestsById.set(normalizedRequest.id, newRequests[index]);
  });

  normalizedRequests.push(...normalizedNewRequests);

  document.dispatchEvent(
    new CustomEvent("normalizedRequestsUpdated", {
      detail: normalizedNewRequests,
    })
  );
});

const requestCount = document.getElementById("request-count");
const transferredBytes = document.getElementById("transferred-size");
const totalDuration = document.getElementById("total-duration");
const requestList = document.getElementById("request-list");
const emptyState = document.getElementById("request-empty-state");
const requestFilters = document.getElementById("request-filters");
let isEmptyStateVisible = true;

// "All" and "Errors" are pseudo-categories layered on top of RequestCategory/RequestOutcome
type RequestFilter = "All" | "Errors" | NormalizedRequest["category"];
let activeFilter: RequestFilter = "All";

// Set when a Session Insight card is clicked, to isolate the request list to just those requests
let isolatedRequestIds: Set<string> | null = null;

function matchesFilter(request: NormalizedRequest, filter: RequestFilter): boolean {
  if (filter === "All") {
    return true;
  }
  if (filter === "Errors") {
    return request.outcome === "client-error" || request.outcome === "server-error";
  }
  return request.category === filter;
}

function renderRequestList(): void {
  if (requestCount) {
    requestCount.textContent = normalizedRequests.length.toString();
  }
  if (transferredBytes) {
    const totalBytes = normalizedRequests.reduce(
        (total, request) => total + request.responseSize,
        0
    );
    transferredBytes.textContent = `${(totalBytes / 1024).toFixed(2)} KB`;
  }
  if (totalDuration) {
    const elapsedTime = getElapsedNetworkTime(normalizedRequests);
    totalDuration.textContent = `${(elapsedTime / 1000).toFixed(2)} s`;
  }
  if (requestList) {
    const filteredRequests = isolatedRequestIds
      ? normalizedRequests.filter((request) => isolatedRequestIds!.has(request.id))
      : normalizedRequests.filter((request) => matchesFilter(request, activeFilter));

    requestList.innerHTML = filteredRequests
        .map(
            (request) =>
                `<tr data-request-id="${request.id}" class="${isolatedRequestIds ? "request-row--highlighted" : ""}"><td>${request.method}</td><td>${request.url}</td><td>${request.status}</td><td>${request.category}</td><td>${(request.responseSize/ 1024).toFixed(2)} bytes</td><td>${(request.duration/ 1000).toFixed(3)} s</td></tr>`
        )
        .join("");

    isEmptyStateVisible = filteredRequests.length === 0;
    if (emptyState) {
        emptyState.style.display = isEmptyStateVisible ? "block" : "none";
    }
  }

  renderSessionInsights();

  if (graphPanel && !graphPanel.hidden) {
    renderGraph();
  }
}

document.addEventListener("normalizedRequestsUpdated", renderRequestList);
document.addEventListener("pageReloaded", renderRequestList);

requestFilters?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-category]");
  if (!target) {
    return;
  }

  activeFilter = target.dataset.category as RequestFilter;
  clearIsolatedRequests();

  requestFilters
    .querySelectorAll("[data-category]")
    .forEach((button) => button.classList.remove("active"));
  target.classList.add("active");

  renderRequestList();
});

const toggleRecordingButton = document.getElementById("toggle-recording");
const recordingStatus = document.getElementById("recording-status");
const clearRequestsButton = document.getElementById("clear-requests");
let isPaused = false;

toggleRecordingButton?.addEventListener("click", () => {
  isPaused = !isPaused;
  setCapturePaused(isPaused);

  toggleRecordingButton.textContent = isPaused ? "Resume" : "Pause";
  if (recordingStatus) {
    recordingStatus.textContent = isPaused ? "Paused" : "Recording";
    recordingStatus.classList.toggle("recording-status--paused", isPaused);
  }
});

clearRequestsButton?.addEventListener("click", () => {
  requests.length = 0;
  normalizedRequests.length = 0;
  rawRequestsById.clear();
  clearIsolatedRequests();
  renderRequestList();
});

const sessionInsightsBody = document.getElementById("session-insights-body");
const toggleSessionInsightsButton = document.getElementById("toggle-session-insights");
const sessionIssuesList = document.getElementById("session-issues-list");
const sessionEndpointsList = document.getElementById("session-endpoints-list");
const sessionDomainsList = document.getElementById("session-domains-list");
const sessionFilterBanner = document.getElementById("session-filter-banner");
const sessionFilterBannerText = document.getElementById("session-filter-banner-text");
const sessionFilterClearButton = document.getElementById("session-filter-clear");

toggleSessionInsightsButton?.addEventListener("click", () => {
  if (!sessionInsightsBody) {
    return;
  }

  const isHidden = sessionInsightsBody.hidden;
  sessionInsightsBody.hidden = !isHidden;
  toggleSessionInsightsButton.textContent = isHidden ? "Hide" : "Show";
  toggleSessionInsightsButton.setAttribute("aria-expanded", String(isHidden));
});

function isolateRequests(requestIds: string[], label: string): void {
  isolatedRequestIds = new Set(requestIds);

  if (sessionFilterBanner && sessionFilterBannerText) {
    sessionFilterBannerText.textContent = `Filtered to ${requestIds.length} related request${requestIds.length === 1 ? "" : "s"} \u2014 ${label}`;
    sessionFilterBanner.hidden = false;
  }

  renderRequestList();
}

function clearIsolatedRequests(): void {
  isolatedRequestIds = null;

  if (sessionFilterBanner) {
    sessionFilterBanner.hidden = true;
  }
}

sessionFilterClearButton?.addEventListener("click", () => {
  clearIsolatedRequests();
  renderRequestList();
});

sessionIssuesList?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-request-ids]");
  if (!target) {
    return;
  }

  const requestIds = target.dataset.requestIds?.split(",").filter(Boolean) ?? [];
  const label = target.dataset.issueLabel ?? "session issue";
  isolateRequests(requestIds, label);
});

sessionEndpointsList?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-method]");
  if (!target) {
    return;
  }

  const { method, host, path } = target.dataset;
  const requestIds = normalizedRequests
    .filter(
      (request) =>
        request.method === method && request.host === host && request.path === path
    )
    .map((request) => request.id);

  isolateRequests(requestIds, `${method} ${path}`);
});

sessionDomainsList?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-host]");
  if (!target) {
    return;
  }

  const { host } = target.dataset;
  const requestIds = normalizedRequests
    .filter((request) => request.host === host)
    .map((request) => request.id);

  isolateRequests(requestIds, host ?? "domain");
});

function renderSessionInsights(): void {
  const analysis = analyzeSession(normalizedRequests);

  if (sessionIssuesList) {
    sessionIssuesList.innerHTML = analysis.issues.length
      ? analysis.issues
          .map((issue) => {
            const severity = getSessionIssueSeverity(issue);
            return `<button
              type="button"
              class="session-issue session-issue--${severity}"
              data-request-ids="${issue.requestIds.join(",")}"
              data-issue-label="${escapeHtml(issue.title)}"
            >
              <div class="session-issue__title">${escapeHtml(issue.title)}</div>
              <div class="session-issue__summary">${escapeHtml(issue.summary)}</div>
            </button>`;
          })
          .join("")
      : `<p class="session-insights__empty">No issues detected.</p>`;
  }

  if (sessionEndpointsList) {
    const topEndpoints = analysis.stats.endpointFrequency.slice(0, 5);
    sessionEndpointsList.innerHTML = topEndpoints.length
      ? topEndpoints
          .map(
            (endpoint) => `<button
              type="button"
              class="session-endpoint-row"
              data-method="${escapeHtml(endpoint.method)}"
              data-host="${escapeHtml(endpoint.host)}"
              data-path="${escapeHtml(endpoint.path)}"
            >
              <span class="session-endpoint-row__label">${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.host)}${escapeHtml(endpoint.path)}</span>
              <span>${endpoint.count}</span>
            </button>`
          )
          .join("")
      : `<p class="session-insights__empty">No requests captured yet.</p>`;
  }

  if (sessionDomainsList) {
    const topDomains = analysis.stats.domainStats.slice(0, 5);
    sessionDomainsList.innerHTML = topDomains.length
      ? topDomains
          .map(
            (domain) => `<button type="button" class="session-domain-row" data-host="${escapeHtml(domain.host)}">
              <span class="session-domain-row__label">${escapeHtml(domain.host)}</span>
              <span class="session-domain-row__meta">
                ${domain.requestCount} requests
                ${domain.errorCount > 0 ? `<span class="session-domain-row__errors">${domain.errorCount} errors</span>` : ""}
              </span>
            </button>`
          )
          .join("")
      : `<p class="session-insights__empty">No requests captured yet.</p>`;
  }
}

// ---- Graph view ----

const viewSwitch = document.getElementById("view-switch");
const requestPanel = document.getElementById("request-panel");
const graphPanel = document.getElementById("graph-panel");
const graphToolbar = document.getElementById("graph-toolbar");
const networkGraphContainer = document.getElementById("network-graph");
const graphEmptyState = document.getElementById("graph-empty-state");
const graphErrorsOnlyButton = document.getElementById("graph-errors-only");
const graphCollapseAllButton = document.getElementById("graph-collapse-all");
const graphFitButton = document.getElementById("graph-fit");

let cy: CytoscapeCore | null = null;
let showErrorsOnly = false;
// Domain node ids whose endpoint children should currently be shown
const expandedDomains = new Set<string>();

const GRAPH_LAYOUT = {
  name: "breadthfirst",
  directed: true,
  padding: 24,
  spacingFactor: 1.4,
} as const;

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      label: "data(label)",
      "text-wrap": "wrap",
      "text-valign": "center",
      "text-halign": "center",
      "text-max-width": "120px",
      width: "label",
      height: "label",
      padding: "10px",
      "background-color": "#171b24",
      "border-width": 1,
      "border-color": "#303746",
      color: "#e5e7eb",
      "font-size": 10,
      "font-family": "Inter, sans-serif",
    },
  },
  {
    selector: "node[type='page']",
    style: {
      "background-color": "#1d2230",
      "border-color": "#8b5cf6",
      "border-width": 2,
      "font-weight": "bold",
    },
  },
  {
    selector: "node[?hasErrors]",
    style: {
      "border-color": "#ef4444",
      "border-width": 2,
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-color": "#8b5cf6",
      "border-width": 2,
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#303746",
      "target-arrow-color": "#303746",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 9,
      color: "#8b93a7",
      "text-background-color": "#0b0d12",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
    },
  },
];

function buildNodeLabel(node: GraphNode): string {
  const lines = [node.label];

  if (node.type !== "page") {
    lines.push(`${node.requestCount} request${node.requestCount === 1 ? "" : "s"}`);
  }
  if (node.transferredBytes > 0) {
    lines.push(`${(node.transferredBytes / 1024).toFixed(1)} KB`);
  }
  if (node.errorCount > 0) {
    lines.push(`${node.errorCount} error${node.errorCount === 1 ? "" : "s"}`);
  }

  return lines.join("\n");
}

function switchToView(view: "requests" | "graph"): void {
  viewSwitch?.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (requestPanel) {
    requestPanel.hidden = view !== "requests";
  }
  if (graphPanel) {
    graphPanel.hidden = view !== "graph";
  }
  if (graphToolbar) {
    graphToolbar.hidden = view !== "graph";
  }

  if (view === "graph") {
    renderGraph();
  }
}

viewSwitch?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-view]");
  const view = target?.dataset.view;
  if (view === "requests" || view === "graph") {
    switchToView(view);
  }
});

graphErrorsOnlyButton?.addEventListener("click", () => {
  showErrorsOnly = !showErrorsOnly;
  graphErrorsOnlyButton.classList.toggle("active", showErrorsOnly);
  renderGraph();
});

graphCollapseAllButton?.addEventListener("click", () => {
  expandedDomains.clear();
  renderGraph();
});

graphFitButton?.addEventListener("click", () => {
  cy?.fit(undefined, 30);
});

function renderGraph(): void {
  if (!networkGraphContainer) {
    return;
  }

  if (normalizedRequests.length === 0) {
    cy?.elements().remove();
    if (graphEmptyState) {
      graphEmptyState.style.display = "block";
    }
    return;
  }
  if (graphEmptyState) {
    graphEmptyState.style.display = "none";
  }

  const graph = buildNetworkGraph(normalizedRequests, inspectedPageUrl);

  // Endpoint nodes only appear once their parent domain has been expanded
  const visibleNodes = graph.nodes.filter(
    (node) => node.type !== "endpoint" || (node.host && expandedDomains.has(getDomainNodeId(node.host)))
  );
  const shownNodes = showErrorsOnly
    ? visibleNodes.filter((node) => node.type === "page" || node.errorCount > 0)
    : visibleNodes;
  const shownNodeIds = new Set(shownNodes.map((node) => node.id));
  const shownEdges = graph.edges.filter(
    (edge) => shownNodeIds.has(edge.source) && shownNodeIds.has(edge.target)
  );

  const elements: ElementDefinition[] = [
    ...shownNodes.map((node) => ({
      data: {
        id: node.id,
        label: buildNodeLabel(node),
        type: node.type,
        hasErrors: node.errorCount > 0,
        requestIds: node.requestIds,
        host: node.host,
      },
    })),
    ...shownEdges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: `${edge.requestCount}`,
      },
    })),
  ];

  if (!cy) {
    cy = cytoscape({
      container: networkGraphContainer,
      elements,
      style: GRAPH_STYLE,
      layout: GRAPH_LAYOUT,
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;
      const type = node.data("type") as GraphNode["type"];

      if (type === "domain") {
        const domainId = node.id() as string;
        if (expandedDomains.has(domainId)) {
          expandedDomains.delete(domainId);
        } else {
          expandedDomains.add(domainId);
        }
        renderGraph();
        return;
      }

      if (type === "endpoint") {
        const requestIds = node.data("requestIds") as string[];
        const label = node.data("label") as string;
        switchToView("requests");
        isolateRequests(requestIds, label.split("\n")[0]);
      }
    });
  } else {
    cy.elements().remove();
    cy.add(elements);
    cy.layout(GRAPH_LAYOUT).run();
  }
}


function getElapsedNetworkTime(requests: NormalizedRequest[]): number {
  if (requests.length === 0) {
    return 0;
  }

  const firstStart = Math.min(
    ...requests.map((request) =>
      new Date(request.startedAt).getTime()
    )
  );

  const lastFinish = Math.max(
    ...requests.map((request) =>
      new Date(request.startedAt).getTime() + request.duration
    )
  );

  return lastFinish - firstStart;
}

// Issue titles/summaries can embed response-controlled text (status text, redirect URL, etc.)
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayRequestDetails(request: NormalizedRequest): void {
  const detailsContainer = document.getElementById("request-details");
  if (!detailsContainer) {
    return;
  }

  detailsContainer.hidden = false;

  const detailsMethod = document.getElementById("details-method");
  const detailsPath = document.getElementById("details-path");
  const detailsStatus = document.getElementById("details-status");
  const detailsStatusText = document.getElementById("details-status-text");
  const detailsUrl = document.getElementById("details-url");
  const detailsHost = document.getElementById("details-host");
  const detailsType = document.getElementById("details-type");
  const detailsDuration = document.getElementById("details-duration");
  const detailsResponseSize = document.getElementById("details-response-size");
  const detailsPriority = document.getElementById("details-priority");
  const detailsInitiator = document.getElementById("details-initiator");
  const detailsServerIP = document.getElementById("details-server-ip");
  const detailsInsights = document.getElementById("details-insights");
  const detailsQuery = document.getElementById("details-query");
  const detailsRequestBody = document.getElementById("details-request-body");
  const loadResponseButton = document.getElementById("load-response-body");
  const detailsResponseBody = document.getElementById("details-response-body");
  const detailsRequestHeaders = document.getElementById("details-request-headers");
  const detailsResponseHeaders = document.getElementById("details-response-headers");
  const detailsTimings = document.getElementById("details-timings");

  if (detailsMethod) {
    detailsMethod.textContent = request.method;
  }

  if (detailsPath) {
    detailsPath.textContent = request.path;
  }

  if (detailsStatus) {
    detailsStatus.textContent = request.status.toString();
  }

  if (detailsStatusText) {
    detailsStatusText.textContent = request.statusText;
  }
  
  if (detailsUrl) {
    detailsUrl.textContent = request.url;
  }

  if (detailsHost) {
    detailsHost.textContent = request.host;
  }

  if (detailsType) {
    detailsType.textContent = request.category;
  }

  if (detailsDuration) {
    detailsDuration.textContent = `${(request.duration / 1000).toFixed(3)} s`;
  }

  if (detailsResponseSize) {
    detailsResponseSize.textContent = `${(request.responseSize / 1024).toFixed(2)} KB`;
  }

  if (detailsPriority) {
    detailsPriority.textContent = request.priority || "N/A";
  }

  if (detailsInitiator) {
    detailsInitiator.textContent = request.initiator?.type || "N/A";
  }

  if (detailsServerIP) {
    detailsServerIP.textContent = request.serverIPAddress || "N/A";
  }

  if (detailsInsights) {
    const analysis = analyzeRequest(request);

    detailsInsights.innerHTML = analysis.issues.length
      ? analysis.issues
          .map((issue) => {
            const severity = getIssueSeverity(issue);
            return `<div class="insight insight--${severity}">
              <div class="insight__title">${escapeHtml(issue.title)}</div>
              <div class="insight__summary">${escapeHtml(issue.summary)}</div>
            </div>`;
          })
          .join("")
      : `<div class="insight insight--none">
          <div class="insight__title">✓ No issues detected</div>
        </div>`;
  }

  if (detailsQuery) {
    detailsQuery.textContent = request.query.length > 0 ? JSON.stringify(request.query, null, 2) : "N/A";
  }

  if (detailsRequestBody) {
    detailsRequestBody.textContent = request.requestBody ? JSON.stringify(request.requestBody, null, 2) : "N/A";
  }
  
  if (loadResponseButton && detailsResponseBody) {
    detailsResponseBody.textContent = "Select \"Load Response\" to retrieve the response body.";
    // Reassigning onclick (vs. addEventListener) avoids stacking a new listener per render
    loadResponseButton.onclick = () => loadResponseBody(request, detailsResponseBody);
  }

  if (detailsRequestHeaders) {
    detailsRequestHeaders.textContent = request.requestHeaders.length > 0 ? JSON.stringify(request.requestHeaders, null, 2) : "N/A";
  }

  if (detailsResponseHeaders) {
    detailsResponseHeaders.textContent = request.responseHeaders.length > 0 ? JSON.stringify(request.responseHeaders, null, 2) : "N/A";
  }

  if (detailsTimings) {
    detailsTimings.textContent = JSON.stringify(request.timings, null, 2);
  }
}

function loadResponseBody(
  request: NormalizedRequest,
  detailsResponseBody: HTMLElement
): void {
  detailsResponseBody.textContent = "Loading response body...";

  const rawRequest = rawRequestsById.get(request.id);
  if (!rawRequest) {
    detailsResponseBody.textContent = "Response body is no longer available.";
    return;
  }

  // Reads the response DevTools already captured instead of re-sending the request
  rawRequest.getContent((content, encoding) => {
    if (!content) {
      detailsResponseBody.textContent = "(empty response body)";
      return;
    }

    const isImage =
      request.category === "Image" || request.responseMimeType.startsWith("image/");

    if (isImage && encoding === "base64") {
      detailsResponseBody.textContent = "";
      const image = document.createElement("img");
      image.src = `data:${request.responseMimeType};base64,${content}`;
      image.alt = request.path;
      image.className = "response-preview-image";
      detailsResponseBody.appendChild(image);
      return;
    }

    detailsResponseBody.textContent = content;
  });
}

requestList?.addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLTableRowElement>(
    "tr[data-request-id]"
  );

  if (!row) {
    return;
  }

  const request = normalizedRequests.find(
    (request) => request.id === row.dataset.requestId
  );

  if (request) {
    displayRequestDetails(request);
  }
});

const closeDetailsButton = document.getElementById("close-details");

closeDetailsButton?.addEventListener("click", () => {
  const detailsContainer = document.getElementById("request-details");

  if (detailsContainer) {
    detailsContainer.hidden = true;
  }
});

const detailsTabs = document.querySelector(".details-tabs");

detailsTabs?.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]");
  if (!target) {
    return;
  }

  const selectedTab = target.dataset.tab;

  detailsTabs
    .querySelectorAll("[data-tab]")
    .forEach((button) => button.classList.remove("active"));
  target.classList.add("active");

  document
    .querySelectorAll<HTMLElement>("[data-tab-content]")
    .forEach((content) => {
      content.hidden = content.dataset.tabContent !== selectedTab;
    });
});