import requests, { requestsUpdated, setCapturePaused } from "../network/capture.js";
import type { NormalizedRequest } from "../network/types.js";
import parseRequest, { normalizeRequest } from "../network/parser.js";
import { analyzeRequest, getIssueSeverity } from "../network/analyzer.js";
import { analyzeSession, getSessionIssueSeverity } from "../network/sessionAnalyzer.js";
import { createRequestStories } from "./request-stories.js";
import type { InspectorTab } from "../network/requestStory.js";

const normalizedRequests: NormalizedRequest[] = [];
let inspectedPageUrl = "";
let selectedRequestId: string | undefined;
let activeView: "requests" | "graph" = "requests";
const storyRoot = document.getElementById("request-stories");
const stories = storyRoot ? createRequestStories(storyRoot, {
  getRequests: () => normalizedRequests,
  getPageUrl: () => inspectedPageUrl,
  inspect: (id, tab) => {
    const request = normalizedRequests.find(r => r.id === id);
    if (request) { displayRequestDetails(request); selectDetailsTab(tab); }
  },
  onSelect: (id) => { selectedRequestId = id; document.getElementById("close-details")?.click(); },
}) : undefined;

function refreshInspectedPageUrl(): void {
  chrome.devtools.inspectedWindow.eval("location.href", (result) => {
    if (typeof result === "string") inspectedPageUrl = result;
  });
}
refreshInspectedPageUrl();

function resetPanelState(): void {
  requests.length = 0;
  normalizedRequests.length = 0;
  selectedRequestId = undefined;
  clearIsolatedRequests();
  stories?.reset();
  const details = document.getElementById("request-details");
  if (details) details.hidden = true;
}
chrome.devtools.network.onNavigated.addListener(() => {
  resetPanelState();
  refreshInspectedPageUrl();
  document.dispatchEvent(new CustomEvent("pageReloaded"));
});
requestsUpdated.addEventListener("updated", () => {
  const newRequests = requests.slice(normalizedRequests.length);
  const normalizedNewRequests = newRequests.map(request => normalizeRequest(parseRequest(request)));
  normalizedRequests.push(...normalizedNewRequests);
  document.dispatchEvent(new CustomEvent("normalizedRequestsUpdated", { detail: normalizedNewRequests }));
});

const requestCount = document.getElementById("request-count");
const transferredBytes = document.getElementById("transferred-size");
const totalDuration = document.getElementById("total-duration");
const requestList = document.getElementById("request-list");
const emptyState = document.getElementById("request-empty-state");
const requestFilters = document.getElementById("request-filters");
type RequestFilter = "All" | "Errors" | NormalizedRequest["category"];
let activeFilter: RequestFilter = "All";
let isolatedRequestIds: Set<string> | null = null;
function matchesFilter(request: NormalizedRequest, filter: RequestFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Errors") return request.outcome === "client-error" || request.outcome === "server-error";
  return request.category === filter;
}
function renderRequestList(): void {
  // Do not rebuild the hidden full table/session analysis while Stories is open.
  if (activeView === "graph") { stories?.update(); return; }
  if (requestCount) requestCount.textContent = String(normalizedRequests.length);
  if (transferredBytes) transferredBytes.textContent = `${(normalizedRequests.reduce((sum, r) => sum + r.responseSize, 0) / 1024).toFixed(2)} KB`;
  if (totalDuration) totalDuration.textContent = `${(getElapsedNetworkTime(normalizedRequests) / 1000).toFixed(2)} s`;
  if (requestList) {
    const filtered = normalizedRequests.filter(r => isolatedRequestIds ? isolatedRequestIds.has(r.id) : matchesFilter(r, activeFilter));
    requestList.innerHTML = filtered.map(r => `<tr data-request-id="${escapeHtml(r.id)}" class="${isolatedRequestIds ? "request-row--highlighted " : ""}${r.id === selectedRequestId ? "selected" : ""}">
      <td>${escapeHtml(r.method)}</td><td>${escapeHtml(r.url)}</td><td>${r.status}</td><td>${escapeHtml(r.category)}</td><td>${(r.responseSize / 1024).toFixed(2)} KB</td><td>${(r.duration / 1000).toFixed(3)} s</td></tr>`).join("");
    if (emptyState) emptyState.style.display = filtered.length ? "none" : "block";
  }
  renderSessionInsights();
}
document.addEventListener("normalizedRequestsUpdated", renderRequestList);
document.addEventListener("pageReloaded", renderRequestList);
document.addEventListener("responseBodyLoaded", event => {
  const request = (event as CustomEvent<NormalizedRequest>).detail;
  if (request && normalizedRequests.includes(request)) stories?.responseLoaded(request.id);
});
requestFilters?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-category]");
  if (!target) return;
  activeFilter = target.dataset.category as RequestFilter;
  clearIsolatedRequests();
  requestFilters.querySelectorAll("[data-category]").forEach(button => button.classList.remove("active"));
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
clearRequestsButton?.addEventListener("click", () => { resetPanelState(); renderRequestList(); });

const sessionInsightsBody = document.getElementById("session-insights-body");
const toggleSessionInsightsButton = document.getElementById("toggle-session-insights");
const sessionIssuesList = document.getElementById("session-issues-list");
const sessionEndpointsList = document.getElementById("session-endpoints-list");
const sessionDomainsList = document.getElementById("session-domains-list");
const sessionFilterBanner = document.getElementById("session-filter-banner");
const sessionFilterBannerText = document.getElementById("session-filter-banner-text");
const sessionFilterClearButton = document.getElementById("session-filter-clear");
toggleSessionInsightsButton?.addEventListener("click", () => {
  if (!sessionInsightsBody) return;
  const hidden = sessionInsightsBody.hidden;
  sessionInsightsBody.hidden = !hidden;
  toggleSessionInsightsButton.textContent = hidden ? "Hide" : "Show";
  toggleSessionInsightsButton.setAttribute("aria-expanded", String(hidden));
});
function isolateRequests(requestIds: string[], label: string): void {
  isolatedRequestIds = new Set(requestIds);
  if (sessionFilterBanner && sessionFilterBannerText) {
    sessionFilterBannerText.textContent = `Filtered to ${requestIds.length} related request${requestIds.length === 1 ? "" : "s"} — ${label}`;
    sessionFilterBanner.hidden = false;
  }
  renderRequestList();
}
function clearIsolatedRequests(): void { isolatedRequestIds = null; if (sessionFilterBanner) sessionFilterBanner.hidden = true; }
sessionFilterClearButton?.addEventListener("click", () => { clearIsolatedRequests(); renderRequestList(); });
sessionIssuesList?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-request-ids]");
  if (target) isolateRequests(target.dataset.requestIds?.split(",").filter(Boolean) ?? [], target.dataset.issueLabel ?? "session issue");
});
sessionEndpointsList?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-method]");
  if (!target) return;
  const { method, host, path } = target.dataset;
  isolateRequests(normalizedRequests.filter(r => r.method === method && r.host === host && r.path === path).map(r => r.id), `${method} ${path}`);
});
sessionDomainsList?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-host]");
  if (target) isolateRequests(normalizedRequests.filter(r => r.host === target.dataset.host).map(r => r.id), target.dataset.host ?? "domain");
});
function renderSessionInsights(): void {
  const analysis = analyzeSession(normalizedRequests);
  if (sessionIssuesList) sessionIssuesList.innerHTML = analysis.issues.length ? analysis.issues.map(issue => `<button type="button" class="session-issue session-issue--${getSessionIssueSeverity(issue)}" data-request-ids="${escapeHtml(issue.requestIds.join(","))}" data-issue-label="${escapeHtml(issue.title)}"><div class="session-issue__title">${escapeHtml(issue.title)}</div><div class="session-issue__summary">${escapeHtml(issue.summary)}</div></button>`).join("") : '<p class="session-insights__empty">No issues detected.</p>';
  if (sessionEndpointsList) sessionEndpointsList.innerHTML = analysis.stats.endpointFrequency.slice(0, 5).map(endpoint => `<button type="button" class="session-endpoint-row" data-method="${escapeHtml(endpoint.method)}" data-host="${escapeHtml(endpoint.host)}" data-path="${escapeHtml(endpoint.path)}"><span class="session-endpoint-row__label">${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.host)}${escapeHtml(endpoint.path)}</span><span>${endpoint.count}</span></button>`).join("") || '<p class="session-insights__empty">No requests captured yet.</p>';
  if (sessionDomainsList) sessionDomainsList.innerHTML = analysis.stats.domainStats.slice(0, 5).map(domain => `<button type="button" class="session-domain-row" data-host="${escapeHtml(domain.host)}"><span class="session-domain-row__label">${escapeHtml(domain.host)}</span><span class="session-domain-row__meta">${domain.requestCount} requests ${domain.errorCount ? `<span class="session-domain-row__errors">${domain.errorCount} errors</span>` : ""}</span></button>`).join("") || '<p class="session-insights__empty">No requests captured yet.</p>';
}

// One request selection route, shared by the table and Request Stories.
const viewSwitch = document.getElementById("view-switch");
function switchToView(view: "requests" | "graph"): void {
  activeView = view;
  document.getElementById("close-details")?.click();
  document.querySelector(".app")?.classList.toggle("rs-active", view === "graph");
  const requestPanel = document.getElementById("request-panel"), graphPanel = document.getElementById("graph-panel");
  if (requestPanel) requestPanel.hidden = view !== "requests";
  if (graphPanel) graphPanel.hidden = view !== "graph";
  viewSwitch?.querySelectorAll<HTMLElement>("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
  stories?.setVisible(view === "graph");
  if (view === "requests") renderRequestList();
}
viewSwitch?.addEventListener("click", event => {
  const view = (event.target as HTMLElement).closest<HTMLElement>("[data-view]")?.dataset.view;
  if (view === "requests" || view === "graph") switchToView(view);
});
window.addEventListener("pagehide", () => stories?.destroy(), { once: true });

function getElapsedNetworkTime(rows: NormalizedRequest[]): number {
  let first = Infinity, last = -Infinity;
  for (const r of rows) {
    const start = Date.parse(r.startedAt);
    if (!Number.isFinite(start) || !Number.isFinite(r.duration)) continue;
    first = Math.min(first, start); last = Math.max(last, start + Math.max(0, r.duration));
  }
  return first === Infinity ? 0 : Math.max(0, last - first);
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function displayRequestDetails(request: NormalizedRequest): void {
  const details = document.getElementById("request-details");
  if (!details) return;
  selectedRequestId = request.id;
  details.hidden = false;
  const values: Record<string, string> = {
    "details-method": request.method, "details-path": request.path,
    "details-status": String(request.status), "details-status-text": request.statusText,
    "details-url": request.url, "details-host": request.host, "details-type": request.category,
    "details-duration": `${(request.duration / 1000).toFixed(3)} s`,
    "details-response-size": `${(request.responseSize / 1024).toFixed(2)} KB`,
    "details-priority": request.priority || "N/A", "details-initiator": request.initiator?.type || "N/A",
    "details-server-ip": request.serverIPAddress || "N/A", "details-response-mime": request.responseMimeType || "Unknown",
    "details-query": request.query.length ? JSON.stringify(request.query, null, 2) : "N/A",
    "details-request-body": request.requestBody || "N/A",
    "details-request-headers": request.requestHeaders.length ? JSON.stringify(request.requestHeaders, null, 2) : "N/A",
    "details-response-headers": request.responseHeaders.length ? JSON.stringify(request.responseHeaders, null, 2) : "N/A",
    "details-timings": JSON.stringify(request.timings, null, 2),
  };
  for (const [id, text] of Object.entries(values)) { const element = document.getElementById(id); if (element) element.textContent = text; }
  const insights = document.getElementById("details-insights"), analysis = analyzeRequest(request);
  if (insights) insights.innerHTML = analysis.issues.length ? analysis.issues.map(issue => `<div class="insight insight--${getIssueSeverity(issue)}"><div class="insight__title">${escapeHtml(issue.title)}</div><div class="insight__summary">${escapeHtml(issue.summary)}</div></div>`).join("") : '<div class="insight insight--none"><div class="insight__title">✓ No issues detected</div></div>';
  requestList?.querySelectorAll<HTMLTableRowElement>("tr[data-request-id]").forEach(row => row.classList.toggle("selected", row.dataset.requestId === request.id));
  stories?.select(request.id);
  document.dispatchEvent(new CustomEvent("blackbox:request-selected", { detail: request }));
}
requestList?.addEventListener("click", event => {
  const id = (event.target as HTMLElement).closest<HTMLTableRowElement>("tr[data-request-id]")?.dataset.requestId;
  const request = normalizedRequests.find(r => r.id === id);
  if (request) displayRequestDetails(request);
});
document.getElementById("close-details")?.addEventListener("click", () => {
  const details = document.getElementById("request-details");
  if (details) details.hidden = true;
});
function selectDetailsTab(tab: InspectorTab): void {
  document.querySelectorAll<HTMLElement>(".details-tabs [data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>("[data-tab-content]").forEach(content => { content.hidden = content.dataset.tabContent !== tab; });
}
document.querySelector(".details-tabs")?.addEventListener("click", event => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]")?.dataset.tab;
  if (tab && ["overview", "request", "response", "headers", "timing"].includes(tab)) selectDetailsTab(tab as InspectorTab);
});
