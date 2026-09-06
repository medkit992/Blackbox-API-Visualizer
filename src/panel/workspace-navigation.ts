/** In-memory navigation only: request data never enters a URL or persistent storage. */
export type WorkspaceView = "dashboard" | "requests" | "graph";
export type RequestTab = "overview" | "lifecycle" | "diagnosis" | "request" | "response" | "timing" | "headers";
export const REQUEST_TABS: readonly RequestTab[] = ["overview", "lifecycle", "diagnosis", "request", "response", "timing", "headers"];
export function isRequestTab(value: string | undefined): value is RequestTab {
  return REQUEST_TABS.includes(value as RequestTab);
}
const names: Record<WorkspaceView, string> = { dashboard: "Dashboard", requests: "Requests", graph: "Request Stories" };
interface ScrollPosition { element: HTMLElement; top: number; left: number }
interface ViewPosition { scroll: ScrollPosition[]; focus: HTMLElement | null; requestId?: string; key?: string; inspect?: string }
export interface WorkspaceNavigation {
  readonly view: WorkspaceView;
  readonly requestOpen: boolean;
  openRequest(tab?: RequestTab): void;
  selectTab(tab: RequestTab, focus?: boolean): void;
  setView(view: WorkspaceView): void;
  back(): void;
  reset(): void;
}

/** Reuses mounted panels, including the response tree and lifecycle checkpoints. */
export function createWorkspaceNavigation(onViewChanged: (view: WorkspaceView) => void): WorkspaceNavigation {
  const app = document.querySelector<HTMLElement>(".app")!;
  const details = document.getElementById("request-details")!;
  const heading = document.getElementById("request-heading")!;
  const backButton = document.getElementById("close-details")!;
  const primary = document.getElementById("view-switch")!;
  const tabs = document.querySelector<HTMLElement>(".details-tabs")!;
  const panels: Record<WorkspaceView, HTMLElement> = {
    dashboard: document.getElementById("dashboard-panel")!,
    requests: document.getElementById("request-panel")!,
    graph: document.getElementById("graph-panel")!,
  };
  const positions = new Map<WorkspaceView, ViewPosition>();
  let view: WorkspaceView = "dashboard";
  let requestOpen = false;
  let activeTab: RequestTab = "overview";

  function remember(): void {
    const root = panels[view];
    const focus = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
    positions.set(view, {
      focus,
      key: focus?.dataset.key, inspect: focus?.dataset.inspect,
      requestId: focus?.closest<HTMLElement>("[data-request-id]")?.dataset.requestId,
      scroll: [root, ...Array.from(root.querySelectorAll<HTMLElement>("[data-preserve-scroll], .rs-root, .rs-rail, .rs-content, .rs-endpoints"))]
        .map(element => ({ element, top: element.scrollTop, left: element.scrollLeft })),
    });
  }
  function restore(focus: boolean): void {
    const position = positions.get(view);
    for (const saved of position?.scroll ?? []) {
      if (saved.element.isConnected) { saved.element.scrollTop = saved.top; saved.element.scrollLeft = saved.left; }
    }
    if (!focus) return;
    let target = position?.focus;
    // Resolve the exact Story tool before a generic request-container fallback.
    if (!target?.isConnected && position?.key) target = Array.from(panels[view].querySelectorAll<HTMLElement>("[data-key]")).find(item => item.dataset.key === position.key);
    if (!target?.isConnected && position?.inspect) target = Array.from(panels[view].querySelectorAll<HTMLElement>("[data-inspect]")).find(item => item.dataset.inspect === position.inspect);
    if (!target?.isConnected && position?.requestId) {
      // Request rows may have been refreshed after traffic arrived during inspection.
      const row = Array.from(panels[view].querySelectorAll<HTMLElement>("[data-request-id]"))
        .find(item => item.dataset.requestId === position.requestId);
      target = row?.matches("button") ? row : row?.querySelector<HTMLElement>("button") ?? null;
    }
    if (!target?.isConnected || !target.getClientRects().length) {
      target = primary.querySelector<HTMLElement>(`[data-view="${view}"]`);
    }
    target?.focus({ preventScroll: true });
  }
  function paint(): void {
    for (const key of Object.keys(panels) as WorkspaceView[]) panels[key].hidden = requestOpen || key !== view;
    details.hidden = !requestOpen;
    app.classList.toggle("rs-active", !requestOpen && view === "graph");
    app.classList.toggle("request-open", requestOpen);
    app.dataset.workspace = requestOpen ? "request" : view;
    backButton.textContent = `← ${names[view]}`;
    backButton.setAttribute("aria-label", `Back to ${names[view]}`);
    primary.querySelectorAll<HTMLElement>("[data-view]").forEach(button => {
      const current = button.dataset.view === view;
      button.classList.toggle("active", current);
      if (current) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
  }
  function closeRequest(): void {
    if (!requestOpen) return;
    requestOpen = false;
    document.dispatchEvent(new CustomEvent("blackbox:request-closed"));
  }
  function selectTab(tab: RequestTab, focus = false): void {
    activeTab = tab;
    tabs.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    details.querySelectorAll<HTMLElement>("[data-tab-content]").forEach(panel => { panel.hidden = panel.dataset.tabContent !== tab; });
    const button = tabs.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
    if (focus) {
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  function back(): void {
    if (!requestOpen) return;
    closeRequest(); paint(); onViewChanged(view); restore(true);
  }
  function setView(next: WorkspaceView): void {
    if (!requestOpen && next === view) return;
    if (!requestOpen) remember();
    closeRequest(); view = next; paint(); onViewChanged(view); restore(false);
  }
  primary.addEventListener("click", event => {
    const next = (event.target as HTMLElement).closest<HTMLElement>("[data-view]")?.dataset.view;
    if (next === "dashboard" || next === "requests" || next === "graph") setView(next);
  });
  backButton.addEventListener("click", back);
  tabs.addEventListener("click", event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]")?.dataset.tab;
    if (isRequestTab(tab)) selectTab(tab, true);
  });
  // Manual-activation tabs: arrows choose a tab; Enter/Space activate it.
  tabs.addEventListener("keydown", event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>("[data-tab]"));
    const index = buttons.indexOf(button);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons.forEach((item, i) => { item.tabIndex = i === next ? 0 : -1; });
    buttons[next].focus({ preventScroll: true });
    buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  tabs.addEventListener("focusout", event => {
    if (event.relatedTarget instanceof Node && tabs.contains(event.relatedTarget)) return;
    tabs.querySelectorAll<HTMLElement>("[data-tab]").forEach(button => { button.tabIndex = button.dataset.tab === activeTab ? 0 : -1; });
  });
  details.addEventListener("click", event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-open-tab]")?.dataset.openTab;
    if (isRequestTab(tab)) selectTab(tab, true);
  });
  paint(); selectTab("overview");
  return {
    get view() { return view; }, get requestOpen() { return requestOpen; },
    selectTab, setView, back,
    openRequest(tab = "overview") {
      if (!requestOpen) remember();
      requestOpen = true;
      details.querySelectorAll<HTMLElement>("[data-tab-content]").forEach(panel => { panel.scrollTop = 0; });
      details.scrollTop = 0;
      paint(); selectTab(tab); onViewChanged(view);
      heading.focus({ preventScroll: true });
    },
    reset() {
      const hadRequestFocus = details.contains(document.activeElement);
      closeRequest(); positions.clear();
      for (const panel of Object.values(panels)) {
        panel.scrollTop = 0;
        panel.querySelectorAll<HTMLElement>("[data-preserve-scroll]").forEach(element => { element.scrollTop = 0; element.scrollLeft = 0; });
      }
      paint(); selectTab("overview"); onViewChanged(view);
      if (hadRequestFocus) primary.querySelector<HTMLElement>(`[data-view="${view}"]`)?.focus({ preventScroll: true });
    },
  };
}
