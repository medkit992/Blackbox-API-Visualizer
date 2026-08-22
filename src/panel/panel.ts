import requests, { requestsUpdated, setCapturePaused } from "../network/capture.js";
import type { GraphNode, NormalizedRequest } from "../network/types.js";
import parseRequest, { normalizeRequest } from "../network/parser.js";
import { analyzeRequest, getIssueSeverity } from "../network/analyzer.js";
import { analyzeSession, getSessionIssueSeverity } from "../network/sessionAnalyzer.js";
import { buildNetworkGraph } from "../network/graphBuilder.js";
import { buildGraphView } from "../network/graphView.js";
import cytoscape from "cytoscape";
import type {
  Core as CytoscapeCore,
  ElementDefinition,
  StylesheetStyle,
} from "cytoscape";

const normalizedRequests: NormalizedRequest[] = [];
const rawRequestsById = new Map<string, chrome.devtools.network.Request>();

let inspectedPageUrl = "";

function refreshInspectedPageUrl(): void {
  chrome.devtools.inspectedWindow.eval("location.href", (result) => {
    if (typeof result === "string") {
      inspectedPageUrl = result;
      scheduleGraphRender(false);
    }
  });
}

refreshInspectedPageUrl();

chrome.devtools.network.onNavigated.addListener(() => {
  requests.length = 0;
  normalizedRequests.length = 0;
  rawRequestsById.clear();
  expandedDomains.clear();
  resetGraphState();
  refreshInspectedPageUrl();

  document.dispatchEvent(new CustomEvent("pageReloaded"));
});

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

type RequestFilter = "All" | "Errors" | NormalizedRequest["category"];
let activeFilter: RequestFilter = "All";
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
          `<tr data-request-id="${escapeHtml(request.id)}" class="${isolatedRequestIds ? "request-row--highlighted" : ""}">
            <td>${escapeHtml(request.method)}</td>
            <td>${escapeHtml(request.url)}</td>
            <td>${request.status}</td>
            <td>${escapeHtml(request.category)}</td>
            <td>${(request.responseSize / 1024).toFixed(2)} KB</td>
            <td>${(request.duration / 1000).toFixed(3)} s</td>
          </tr>`
      )
      .join("");

    isEmptyStateVisible = filteredRequests.length === 0;
    if (emptyState) {
      emptyState.style.display = isEmptyStateVisible ? "block" : "none";
    }
  }

  renderSessionInsights();
  scheduleGraphRender(false);
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
  expandedDomains.clear();
  clearIsolatedRequests();
  resetGraphState();
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
    sessionFilterBannerText.textContent = `Filtered to ${requestIds.length} related request${requestIds.length === 1 ? "" : "s"} — ${label}`;
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
const graphStatus = document.getElementById("graph-status");
const graphEndpointLimitSelect = document.getElementById(
  "graph-endpoint-limit"
) as HTMLSelectElement | null;

const GRAPH_MAX_DOMAINS = 40;
const GRAPH_RENDER_INTERVAL_MS = 120;

let cy: CytoscapeCore | null = null;
let showErrorsOnly = false;
let graphEndpointLimit = Number(graphEndpointLimitSelect?.value ?? 25);
let graphRenderTimer: number | undefined;
let graphPendingFit = false;
let graphHasRendered = false;
let lastGraphTopology = "";

const expandedDomains = new Set<string>();

const GRAPH_STYLE: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      label: "data(label)",
      "text-wrap": "wrap",
      "text-valign": "center",
      "text-halign": "center",
      "text-max-width": "150px",
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
    selector: "node[type='endpoint']",
    style: {
      "font-size": 9,
      padding: "8px",
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
      width: "mapData(requestCount, 1, 100, 1, 5)",
      "line-color": "#303746",
      "target-arrow-color": "#303746",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 9,
      color: "#8b93a7",
      opacity: 0.8,
      "text-background-color": "#0b0d12",
      "text-background-opacity": 1,
      "text-background-padding": "2px",
    },
  },
  {
    selector: "edge[?hasErrors]",
    style: {
      "line-color": "#7f1d1d",
      "target-arrow-color": "#ef4444",
    },
  },
];

function truncateLabel(value: string, maxLength = 54): string {
  if (value.length <= maxLength) {
    return value;
  }

  const half = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}

function buildNodeLabel(node: GraphNode): string {
  const lines = [truncateLabel(node.label)];

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

function getGraphLayout(nodeCount: number) {
  return {
    name: "breadthfirst",
    directed: true,
    roots: "#page",
    fit: false,
    animate: false,
    padding: 30,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    spacingFactor: nodeCount > 80 ? 0.9 : nodeCount > 40 ? 1.0 : 1.25,
  } as const;
}

function buildTopologyKey(elements: ElementDefinition[]): string {
  return elements
    .map((element) => String(element.data?.id ?? ""))
    .sort()
    .join("|");
}

function resetGraphState(): void {
  if (graphRenderTimer !== undefined) {
    window.clearTimeout(graphRenderTimer);
    graphRenderTimer = undefined;
  }
  graphPendingFit = false;
  graphHasRendered = false;
  lastGraphTopology = "";
  cy?.elements().remove();
}

function scheduleGraphRender(fit: boolean): void {
  if (!graphPanel || graphPanel.hidden) {
    return;
  }

  graphPendingFit ||= fit;
  if (graphRenderTimer !== undefined) {
    return;
  }

  graphRenderTimer = window.setTimeout(() => {
    graphRenderTimer = undefined;
    const shouldFit = graphPendingFit;
    graphPendingFit = false;
    renderGraph(shouldFit);
  }, GRAPH_RENDER_INTERVAL_MS);
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
    requestAnimationFrame(() => {
      cy?.resize();
      renderGraph(!graphHasRendered);
    });
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
  renderGraph(true);
});

graphEndpointLimitSelect?.addEventListener("change", () => {
  graphEndpointLimit = Math.max(Number(graphEndpointLimitSelect.value) || 25, 1);
  renderGraph(true);
});

graphCollapseAllButton?.addEventListener("click", () => {
  expandedDomains.clear();
  renderGraph(true);
});

graphFitButton?.addEventListener("click", () => {
  cy?.resize();
  cy?.fit(undefined, 30);
});

if (networkGraphContainer && typeof ResizeObserver !== "undefined") {
  let resizeFrame: number | undefined;
  const graphResizeObserver = new ResizeObserver(() => {
    if (!cy || !graphPanel || graphPanel.hidden) {
      return;
    }

    if (resizeFrame !== undefined) {
      cancelAnimationFrame(resizeFrame);
    }

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined;
      cy?.resize();
    });
  });

  graphResizeObserver.observe(networkGraphContainer);
}

function renderGraph(fit = false): void {
  if (!networkGraphContainer) {
    return;
  }

  if (graphRenderTimer !== undefined) {
    window.clearTimeout(graphRenderTimer);
    graphRenderTimer = undefined;
  }

  if (normalizedRequests.length === 0) {
    cy?.elements().remove();
    lastGraphTopology = "";
    graphHasRendered = false;
    if (graphStatus) {
      graphStatus.textContent = "No network activity";
    }
    if (graphEmptyState) {
      graphEmptyState.style.display = "block";
    }
    return;
  }

  if (graphEmptyState) {
    graphEmptyState.style.display = "none";
  }

  const graph = buildNetworkGraph(normalizedRequests, inspectedPageUrl);
  const graphView = buildGraphView(graph, {
    expandedDomainIds: expandedDomains,
    errorsOnly: showErrorsOnly,
    maxDomains: GRAPH_MAX_DOMAINS,
    maxEndpointsPerDomain: graphEndpointLimit,
  });

  if (graphStatus) {
    const hiddenParts: string[] = [];
    if (graphView.hiddenDomainCount > 0) {
      hiddenParts.push(`${graphView.hiddenDomainCount} domains hidden`);
    }
    if (graphView.hiddenEndpointCount > 0) {
      hiddenParts.push(`${graphView.hiddenEndpointCount} endpoints hidden`);
    }

    graphStatus.textContent = `${graphView.nodes.length} nodes · ${graphView.edges.length} connections${
      hiddenParts.length ? ` · ${hiddenParts.join(" · ")}` : ""
    }`;
  }

  const elements: ElementDefinition[] = [
    ...graphView.nodes.map((node) => ({
      data: {
        id: node.id,
        label: buildNodeLabel(node),
        type: node.type,
        hasErrors: node.errorCount > 0,
        requestIds: node.requestIds,
        requestCount: node.requestCount,
        transferredBytes: node.transferredBytes,
        errorCount: node.errorCount,
        host: node.host,
      },
    })),
    ...graphView.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: `${edge.requestCount}`,
        requestCount: edge.requestCount,
        hasErrors: edge.errorCount > 0,
      },
    })),
  ];

  const topology = buildTopologyKey(elements);
  const topologyChanged = topology !== lastGraphTopology;

  if (!cy) {
    cy = cytoscape({
      container: networkGraphContainer,
      elements,
      style: GRAPH_STYLE,
      layout: { name: "preset" },
      minZoom: 0.08,
      maxZoom: 3,
      wheelSensitivity: 0.18,
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
        renderGraph(true);
        return;
      }

      if (type === "endpoint") {
        const requestIds = node.data("requestIds") as string[];
        const label = node.data("label") as string;
        switchToView("requests");
        isolateRequests(requestIds, label.split("\n")[0]);
      }
    });
  } else if (topologyChanged) {
    cy.batch(() => {
      cy?.elements().remove();
      cy?.add(elements);
    });
  } else {
    cy.batch(() => {
      for (const element of elements) {
        const id = String(element.data?.id ?? "");
        if (!id) {
          continue;
        }
        cy?.getElementById(id).data(element.data ?? {});
      }
    });
  }

  lastGraphTopology = topology;
  graphHasRendered = true;

  if (topologyChanged) {
    const layout = cy.layout(getGraphLayout(graphView.nodes.length));
    if (fit) {
      cy.one("layoutstop", () => {
        cy?.resize();
        cy?.fit(undefined, 30);
      });
    }
    layout.run();
  } else if (fit) {
    cy.resize();
    cy.fit(undefined, 30);
  }
}

function getElapsedNetworkTime(requests: NormalizedRequest[]): number {
  if (requests.length === 0) {
    return 0;
  }

  const firstStart = Math.min(
    ...requests.map((request) => new Date(request.startedAt).getTime())
  );

  const lastFinish = Math.max(
    ...requests.map(
      (request) => new Date(request.startedAt).getTime() + request.duration
    )
  );

  return lastFinish - firstStart;
}

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
  const detailsResponseMime = document.getElementById("details-response-mime");
  const detailsRequestHeaders = document.getElementById("details-request-headers");
  const detailsResponseHeaders = document.getElementById("details-response-headers");
  const detailsTimings = document.getElementById("details-timings");

  if (detailsMethod) detailsMethod.textContent = request.method;
  if (detailsPath) detailsPath.textContent = request.path;
  if (detailsStatus) detailsStatus.textContent = request.status.toString();
  if (detailsStatusText) detailsStatusText.textContent = request.statusText;
  if (detailsUrl) detailsUrl.textContent = request.url;
  if (detailsHost) detailsHost.textContent = request.host;
  if (detailsType) detailsType.textContent = request.category;
  if (detailsDuration) {
    detailsDuration.textContent = `${(request.duration / 1000).toFixed(3)} s`;
  }
  if (detailsResponseSize) {
    detailsResponseSize.textContent = `${(request.responseSize / 1024).toFixed(2)} KB`;
  }
  if (detailsPriority) detailsPriority.textContent = request.priority || "N/A";
  if (detailsInitiator) detailsInitiator.textContent = request.initiator?.type || "N/A";
  if (detailsServerIP) detailsServerIP.textContent = request.serverIPAddress || "N/A";
  if (detailsResponseMime) detailsResponseMime.textContent = request.responseMimeType || "Unknown";

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
    detailsQuery.textContent =
      request.query.length > 0 ? JSON.stringify(request.query, null, 2) : "N/A";
  }

  if (detailsRequestBody) {
    detailsRequestBody.textContent = request.requestBody
      ? request.requestBody
      : "N/A";
  }

  if (loadResponseButton && detailsResponseBody) {
    detailsResponseBody.textContent =
      'Select "Load Response" to retrieve the response body.';
    loadResponseButton.onclick = () => loadResponseBody(request, detailsResponseBody);
  }

  if (detailsRequestHeaders) {
    detailsRequestHeaders.textContent =
      request.requestHeaders.length > 0
        ? JSON.stringify(request.requestHeaders, null, 2)
        : "N/A";
  }

  if (detailsResponseHeaders) {
    detailsResponseHeaders.textContent =
      request.responseHeaders.length > 0
        ? JSON.stringify(request.responseHeaders, null, 2)
        : "N/A";
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
