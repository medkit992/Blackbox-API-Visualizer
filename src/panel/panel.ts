import requests, { requestsUpdated, setCapturePaused } from "../network/capture.js";
import type { NormalizedRequest } from "../network/types.js";
import parseRequest, { normalizeRequest } from "../network/parser.js";
import { analyzeRequest, getIssueSeverity } from "../network/analyzer.js";
import { analyzeSession, getSessionIssueSeverity } from "../network/sessionAnalyzer.js";
import { createRequestStories, type StoryController } from "./request-stories.js";
import { createWorkspaceNavigation, type RequestTab } from "./workspace-navigation.js";
import { filterWorkspaceRequests, formatBytes, formatDuration, requestPage, summarizeWorkspaceRequests, type RequestFilter } from "./workspace-model.js";

const normalizedRequests: NormalizedRequest[] = [];
let inspectedPageUrl = "";
let selectedRequestId: string | undefined;
let activeFilter: RequestFilter = "All";
let isolatedRequestIds: Set<string> | null = null;
let search = "", page = 0, pendingFrame = 0;
let tableDirty = true, dashboardDirty = true;
let stories: StoryController | undefined;
const requestList = document.getElementById("request-list")!;
const searchInput = document.getElementById("request-search") as HTMLInputElement;
const requestFilters = document.getElementById("request-filters")!;
const sessionFilterBanner = document.getElementById("session-filter-banner")!;
const nav = createWorkspaceNavigation(() => {
  stories?.setVisible(!nav.requestOpen && nav.view === "graph");
  renderVisibleView();
});
const storyRoot = document.getElementById("request-stories");
if (storyRoot) stories = createRequestStories(storyRoot, {
  getRequests: () => normalizedRequests,
  getPageUrl: () => inspectedPageUrl,
  inspect: (id, tab) => {
    const request = normalizedRequests.find(row => row.id === id);
    if (request) displayRequestDetails(request, tab);
  },
  onSelect: id => { selectedRequestId = id; },
});

function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function refreshInspectedPageUrl(): void {
  chrome.devtools.inspectedWindow.eval("location.href", result => {
    if (typeof result === "string") inspectedPageUrl = result;
  });
}
function resetPanelState(): void {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  requests.length = 0; normalizedRequests.length = 0;
  selectedRequestId = undefined; page = 0;
  clearIsolatedRequests(); stories?.reset();
  tableDirty = dashboardDirty = true;
  // Release detached sensitive rows immediately, even if their workspace is hidden.
  requestList.replaceChildren();
  for (const id of ["dashboard-recent-list", "session-issues-list", "session-endpoints-list", "session-domains-list"]) document.getElementById(id)?.replaceChildren();
  for (const element of document.querySelectorAll<HTMLElement>(".details-grid dd, #details-query, #details-request-body, #details-request-headers, #details-response-headers, #details-timings, #details-path, #details-method, #details-status, #details-status-text, #request-duration")) { element.textContent = ""; element.removeAttribute("title"); }
  nav.reset(); renderVisibleView();
}
chrome.devtools.network.onNavigated.addListener(() => {
  resetPanelState(); refreshInspectedPageUrl();
  document.dispatchEvent(new CustomEvent("pageReloaded"));
});
requestsUpdated.addEventListener("updated", () => {
  const added = requests.slice(normalizedRequests.length).map(request => normalizeRequest(parseRequest(request)));
  normalizedRequests.push(...added);
  document.dispatchEvent(new CustomEvent("normalizedRequestsUpdated", { detail: added }));
});
function scheduleRender(): void {
  tableDirty = dashboardDirty = true;
  if (pendingFrame || nav.requestOpen) return;
  pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; renderVisibleView(); });
}
function renderVisibleView(): void {
  if (nav.requestOpen) return;
  if (nav.view === "graph") { stories?.update(); return; }
  if (nav.view === "dashboard" && dashboardDirty) { dashboardDirty = false; renderDashboard(); }
  if (nav.view === "requests" && tableDirty) { tableDirty = false; renderRequestList(); }
}
document.addEventListener("normalizedRequestsUpdated", scheduleRender);
document.addEventListener("pageReloaded", scheduleRender);
document.addEventListener("responseBodyLoaded", event => {
  const request = (event as CustomEvent<NormalizedRequest>).detail;
  if (request && normalizedRequests.includes(request)) stories?.responseLoaded(request.id);
});
function refreshTable(resetPage = false): void {
  tableDirty = true;
  if (resetPage) { page = 0; document.querySelector(".request-table-wrapper")?.scrollTo(0, 0); }
  renderVisibleView();
}
function updateFilterButtons(): void {
  requestFilters.querySelectorAll<HTMLElement>("[data-category]").forEach(button => {
    const active = button.dataset.category === activeFilter;
    button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
  });
}
requestFilters.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-category]");
  if (!target) return;
  activeFilter = target.dataset.category as RequestFilter;
  updateFilterButtons(); refreshTable(true);
});
searchInput.addEventListener("input", () => { search = searchInput.value; refreshTable(true); });
function renderRequestList(): void {
  const filtered = filterWorkspaceRequests(normalizedRequests, activeFilter, search, isolatedRequestIds);
  const result = requestPage(filtered, page); page = result.page;
  const focused = document.activeElement instanceof HTMLElement && requestList.contains(document.activeElement)
    ? document.activeElement.closest<HTMLElement>("[data-request-id]")?.dataset.requestId : undefined;
  const wrapper = document.querySelector<HTMLElement>(".request-table-wrapper")!;
  const top = wrapper.scrollTop, left = wrapper.scrollLeft;
  requestList.innerHTML = result.rows.map(request => `<tr data-request-id="${escapeHtml(request.id)}" class="${isolatedRequestIds ? "request-row--highlighted " : ""}${request.id === selectedRequestId ? "selected" : ""}">
    <td class="method">${escapeHtml(request.method)}</td><td><button type="button" class="request-open-button" title="${escapeHtml(request.url)}" aria-label="Inspect ${escapeHtml(request.method)} ${escapeHtml(request.url)}">${escapeHtml(request.url)}</button></td><td>${request.status || "—"}</td><td>${escapeHtml(request.category)}</td><td>${formatBytes(request.responseSize)}</td><td>${formatDuration(request.duration)}</td></tr>`).join("");
  wrapper.scrollTop = top; wrapper.scrollLeft = left;
  if (focused) Array.from(requestList.querySelectorAll<HTMLElement>("[data-request-id]"))
    .find(row => row.dataset.requestId === focused)?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  const empty = document.getElementById("request-empty-state")!;
  empty.hidden = filtered.length > 0;
  empty.querySelector("h2")!.textContent = normalizedRequests.length ? "No matching requests" : "No requests captured yet";
  empty.querySelector("p")!.textContent = normalizedRequests.length ? "Change the search, category, or selection filter." : "Allow capture in Privacy, then use the inspected page.";
  setText("request-page-status", `${result.start}–${result.end} of ${filtered.length} matching · ${normalizedRequests.length} captured`);
  (document.getElementById("request-page-prev") as HTMLButtonElement).disabled = page === 0;
  (document.getElementById("request-page-next") as HTMLButtonElement).disabled = page + 1 >= result.pages;
}
for (const [id, delta] of [["request-page-prev", -1], ["request-page-next", 1]] as const) {
  document.getElementById(id)?.addEventListener("click", () => { page += delta; document.querySelector(".request-table-wrapper")?.scrollTo(0, 0); refreshTable(); });
}

function clearIsolatedRequests(): void { isolatedRequestIds = null; sessionFilterBanner.hidden = true; }
function isolateRequests(ids: string[], label: string): void {
  isolatedRequestIds = new Set(ids);
  activeFilter = "All"; search = ""; searchInput.value = ""; page = 0; updateFilterButtons();
  setText("session-filter-banner-text", `Selection: ${ids.length} related request${ids.length === 1 ? "" : "s"} — ${label}`);
  sessionFilterBanner.hidden = false; tableDirty = true;
  nav.setView("requests"); renderVisibleView();
}
document.getElementById("session-filter-clear")?.addEventListener("click", () => { clearIsolatedRequests(); refreshTable(true); });
document.getElementById("dashboard-browse")?.addEventListener("click", () => nav.setView("requests"));
document.getElementById("dashboard-panel")?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-dashboard-filter]");
  const filter = target?.dataset.dashboardFilter;
  if (filter !== "Errors" && filter !== "Slow") return;
  clearIsolatedRequests(); activeFilter = filter; search = ""; searchInput.value = ""; page = 0;
  updateFilterButtons(); tableDirty = true; nav.setView("requests");
});
const sessionBody = document.getElementById("session-insights-body")!;
const sessionToggle = document.getElementById("toggle-session-insights")!;
sessionToggle.addEventListener("click", () => {
  sessionBody.hidden = !sessionBody.hidden;
  sessionToggle.textContent = sessionBody.hidden ? "Show" : "Hide";
  sessionToggle.setAttribute("aria-expanded", String(!sessionBody.hidden));
});
document.getElementById("session-issues-list")?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-request-ids]");
  if (target) isolateRequests(target.dataset.requestIds?.split(",").filter(Boolean) ?? [], target.dataset.issueLabel ?? "session issue");
});
document.getElementById("session-endpoints-list")?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-method]");
  if (!target) return;
  const { method, host, path } = target.dataset;
  isolateRequests(normalizedRequests.filter(row => row.method === method && row.host === host && row.path === path).map(row => row.id), `${method} ${path}`);
});
document.getElementById("session-domains-list")?.addEventListener("click", event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-host]");
  if (target) isolateRequests(normalizedRequests.filter(row => row.host === target.dataset.host).map(row => row.id), target.dataset.host ?? "domain");
});
function renderDashboard(): void {
  const metrics = summarizeWorkspaceRequests(normalizedRequests);
  setText("request-count", String(metrics.count)); setText("transferred-size", formatBytes(metrics.bytes));
  setText("total-duration", formatDuration(metrics.span)); setText("dashboard-errors", String(metrics.errors)); setText("dashboard-slow", String(metrics.slow));
  const analysis = analyzeSession(normalizedRequests);
  document.getElementById("session-issues-list")!.innerHTML = analysis.issues.length ? analysis.issues.map(issue => `<button type="button" class="session-issue session-issue--${getSessionIssueSeverity(issue)}" data-request-ids="${escapeHtml(issue.requestIds.join(","))}" data-issue-label="${escapeHtml(issue.title)}"><span class="session-issue__title">${escapeHtml(issue.title)}</span><span class="session-issue__summary">${escapeHtml(issue.summary)}</span></button>`).join("") : '<p class="session-insights__empty">No patterns detected in captured traffic.</p>';
  document.getElementById("session-endpoints-list")!.innerHTML = analysis.stats.endpointFrequency.slice(0, 5).map(endpoint => `<button type="button" class="session-endpoint-row" data-method="${escapeHtml(endpoint.method)}" data-host="${escapeHtml(endpoint.host)}" data-path="${escapeHtml(endpoint.path)}"><span class="session-endpoint-row__label">${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.host)}${escapeHtml(endpoint.path)}</span><span>${endpoint.count}</span></button>`).join("") || '<p class="session-insights__empty">No requests captured yet.</p>';
  document.getElementById("session-domains-list")!.innerHTML = analysis.stats.domainStats.slice(0, 5).map(domain => `<button type="button" class="session-domain-row" data-host="${escapeHtml(domain.host)}"><span class="session-domain-row__label">${escapeHtml(domain.host)}</span><span class="session-domain-row__meta">${domain.requestCount} requests ${domain.errorCount ? `<span class="session-domain-row__errors">${domain.errorCount} errors</span>` : ""}</span></button>`).join("") || '<p class="session-insights__empty">No requests captured yet.</p>';
  document.getElementById("dashboard-recent-list")!.innerHTML = normalizedRequests.slice(-8).reverse().map(request => `<button type="button" class="dashboard-recent-row" data-request-id="${escapeHtml(request.id)}"><span class="method">${escapeHtml(request.method)}</span><span class="dashboard-recent-path">${escapeHtml(request.host + request.path)}</span><span>${request.status || "—"}</span><span>${formatDuration(request.duration)}</span></button>`).join("") || '<p class="workspace-note">Nothing captured yet. Allow capture in Privacy and make a request on the inspected page.</p>';
}

function displayRequestDetails(request: NormalizedRequest, tab: RequestTab = "overview"): void {
  selectedRequestId = request.id;
  const values: Record<string, string> = {
    "details-method": request.method, "details-path": request.path,
    "details-status": request.status ? String(request.status) : "No HTTP response", "details-status-text": request.statusText,
    "request-duration": formatDuration(request.duration), "details-url": request.url, "details-host": request.host, "details-type": request.category,
    "details-duration": formatDuration(request.duration), "details-response-size": formatBytes(request.responseSize),
    "details-priority": request.priority || "N/A", "details-initiator": request.initiator?.type || "N/A",
    "details-server-ip": request.serverIPAddress || "N/A", "details-response-mime": request.responseMimeType || "Unknown",
    "details-query": request.query.length ? JSON.stringify(request.query, null, 2) : "No query parameters.",
    "details-request-body": request.requestBody || "No request body captured.",
    "details-request-headers": request.requestHeaders.length ? JSON.stringify(request.requestHeaders, null, 2) : "No request headers captured.",
    "details-response-headers": request.responseHeaders.length ? JSON.stringify(request.responseHeaders, null, 2) : "No response headers captured.",
    "details-timings": JSON.stringify(request.raw.timings, null, 2),
  };
  for (const [id, text] of Object.entries(values)) setText(id, text);
  document.getElementById("details-path")!.title = request.url;
  const analysis = analyzeRequest(request);
  document.getElementById("details-insights")!.innerHTML = analysis.issues.length ? analysis.issues.map(issue => `<div class="insight insight--${getIssueSeverity(issue)}"><div class="insight__title">${escapeHtml(issue.title)}</div><div class="insight__summary">${escapeHtml(issue.summary)}</div></div>`).join("") : '<div class="insight insight--none"><div class="insight__title">No additional signals detected</div></div>';
  requestList.querySelectorAll<HTMLTableRowElement>("tr[data-request-id]").forEach(row => row.classList.toggle("selected", row.dataset.requestId === request.id));
  nav.openRequest(tab);
  document.dispatchEvent(new CustomEvent("blackbox:request-selected", { detail: request }));
}
function inspectClick(event: Event): void {
  const id = (event.target as HTMLElement).closest<HTMLElement>("[data-request-id]")?.dataset.requestId;
  const request = normalizedRequests.find(row => row.id === id);
  if (request) displayRequestDetails(request);
}
requestList.addEventListener("click", inspectClick);
document.getElementById("dashboard-recent-list")?.addEventListener("click", inspectClick);

const toggleRecordingButton = document.getElementById("toggle-recording")!;
const recordingStatus = document.getElementById("recording-status")!;
let isPaused = false;
for (const id of ["consent-accept", "consent-revoke"]) document.getElementById(id)?.addEventListener("click", () => { isPaused = false; });
toggleRecordingButton.addEventListener("click", () => {
  isPaused = !isPaused; setCapturePaused(isPaused);
  toggleRecordingButton.textContent = isPaused ? "Resume" : "Pause";
  recordingStatus.textContent = isPaused ? "Paused" : "Recording";
  recordingStatus.classList.toggle("recording-status--paused", isPaused);
});
document.getElementById("clear-requests")?.addEventListener("click", resetPanelState);
window.addEventListener("pagehide", () => { if (pendingFrame) cancelAnimationFrame(pendingFrame); stories?.destroy(); }, { once: true });
refreshInspectedPageUrl(); renderVisibleView();
