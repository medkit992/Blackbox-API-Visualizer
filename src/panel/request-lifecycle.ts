import {
  buildLifecycleExample, buildRequestLifecycle,
  type LifecycleExample, type LifecycleRequest, type LifecycleStepId,
  type LifecycleStatus, type LifecycleTarget, type RequestLifecycle,
} from "../network/requestLifecycle.js";

export interface RequestLifecycleView {
  root: HTMLElement;
  render(request: LifecycleRequest): void;
  reset(): void;
}
let instanceId = 0;
const symbols: Record<LifecycleStatus, string> = {
  completed: "✓", failed: "×", warning: "!", unknown: "?", "not-reached": "–", "not-applicable": "–",
};
const targets: Record<LifecycleTarget, string> = {
  source: "View source context", request: "Inspect request", response: "Open Response Explorer",
  timing: "Inspect timing", diagnosis: "Read Request Diagnosis",
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function navigateToDetails(target: LifecycleTarget): void {
  const tab = target === "source" || target === "diagnosis" ? "overview" : target;
  const button = document.querySelector<HTMLButtonElement>(`.details-tabs button[data-tab="${tab}"]`);
  button?.click();
  if (target === "source" || target === "diagnosis") {
    const detail = document.getElementById(target === "source" ? "details-source" : "request-diagnosis");
    if (detail) {
      detail.tabIndex = -1;
      detail.scrollIntoView({ block: "start" });
      detail.focus({ preventScroll: true });
    }
  } else button?.focus();
}

/** One native button per checkpoint: CSS reflows the same controls from ring to stepper. */
export function createRequestLifecycleView(
  anchor: HTMLElement,
  navigate: (target: LifecycleTarget) => void = navigateToDetails,
): RequestLifecycleView {
  const prefix = `request-lifecycle-${++instanceId}`;
  const root = element("section", "request-lifecycle");
  root.hidden = true;
  root.setAttribute("aria-labelledby", `${prefix}-title`);
  const header = element("header", "lc-header");
  const heading = element("div", "lc-heading");
  const title = element("h2", "lc-title", "Request lifecycle"); title.id = `${prefix}-title`;
  const modeBadge = element("span", "lc-mode", "Captured request");
  heading.append(title, modeBadge);
  const toggle = element("button", "lc-toggle", "Collapse");
  toggle.type = "button"; toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-controls", `${prefix}-body`);
  header.append(heading, toggle);
  const body = element("div", "lc-body"); body.id = `${prefix}-body`;
  const controls = element("div", "lc-controls");
  const exampleLabel = element("label", "lc-example-label", "Data source");
  const examples = element("select", "lc-examples"); examples.id = `${prefix}-examples`;
  exampleLabel.htmlFor = examples.id;
  for (const [value, label] of [
    ["captured", "Selected request"], ["success", "Example: successful lifecycle"],
    ["http-error", "Example: 404 with valid JSON"], ["parse-error", "Example: 200 with parse failure"],
  ]) {
    const option = element("option", "", label); option.value = value; examples.append(option);
  }
  controls.append(exampleLabel, examples);
  const scope = element("p", "lc-scope");
  const workspace = element("div", "lc-workspace");
  const map = element("div", "lc-map");
  const core = element("div", "lc-core");
  const headline = element("strong", "lc-headline");
  const metric = element("span", "lc-metric");
  const summary = element("span", "lc-summary");
  core.append(element("span", "lc-zones", "Network → Application"), headline, metric, summary);

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 400 400"); svg.classList.add("lc-track");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  const segments: SVGPathElement[] = [];
  const arrows: SVGPathElement[] = [];
  const point = (angle: number) => ({ x: 200 + 139 * Math.cos(angle * Math.PI / 180), y: 200 + 139 * Math.sin(angle * Math.PI / 180) });
  for (let index = 0; index < 8; index++) {
    const angle = -90 + index * 45;
    const start = point(angle + 5); const end = point(angle + 40);
    const midpoint = point(angle + 22.5);
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", `M ${start.x} ${start.y} A 139 139 0 0 1 ${end.x} ${end.y}`);
    path.classList.add("lc-segment"); segments.push(path); svg.append(path);
    const arrow = document.createElementNS(svgNS, "path");
    arrow.setAttribute("d", "M -5 -4 L 0 0 L -5 4");
    arrow.setAttribute("transform", `translate(${midpoint.x} ${midpoint.y}) rotate(${angle + 112.5})`);
    arrow.classList.add("lc-arrow"); arrows.push(arrow); svg.append(arrow);
  }
  const stepsList = element("ol", "lc-steps"); stepsList.setAttribute("aria-label", "Request lifecycle checkpoints");
  const controlsByStep = Array.from({ length: 8 }, (_, index) => {
    const li = element("li", "lc-step");
    const angle = (-90 + index * 45) * Math.PI / 180;
    li.style.setProperty("--lc-x", `${50 + 34.75 * Math.cos(angle)}%`);
    li.style.setProperty("--lc-y", `${50 + 34.75 * Math.sin(angle)}%`);
    const button = element("button", "lc-checkpoint"); button.type = "button";
    button.setAttribute("aria-controls", `${prefix}-detail`);
    const icon = element("span", "lc-icon"); icon.setAttribute("aria-hidden", "true");
    const words = element("span", "lc-words");
    const name = element("span", "lc-name"); const badge = element("span", "lc-state");
    words.append(name, badge); button.append(icon, words); li.append(button); stepsList.append(li);
    button.addEventListener("click", () => { if (model) { selected = model.steps[index].id; if (model.mode === "captured") liveSelected = selected; renderSelection(); } });
    return { li, button, icon, name, badge };
  });
  map.append(svg, core, stepsList);
  const detail = element("section", "lc-detail"); detail.id = `${prefix}-detail`;
  detail.setAttribute("aria-live", "polite"); detail.setAttribute("aria-labelledby", `${prefix}-step-title`);
  const phase = element("p", "lc-phase");
  const stepTitle = element("h3", "lc-step-title"); stepTitle.id = `${prefix}-step-title`;
  const stepSummary = element("p", "lc-step-summary");
  const evidence = element("ul", "lc-evidence");
  const nextLabel = element("h4", "lc-next-label", "What to check next");
  const next = element("p", "lc-next");
  const action = element("button", "lc-action"); action.type = "button";
  detail.append(phase, stepTitle, stepSummary, evidence, nextLabel, next, action);
  workspace.append(map, detail);
  const legend = element("p", "lc-legend", "✓ Observed / completed   × Problem   ! Check   ? Not observed   – Not reached / not applicable");
  const boundary = element("p", "lc-boundary", "The loop returns to code; it is not a retry. Dotted stages have no application telemetry.");
  body.append(controls, scope, workspace, legend, boundary); root.append(header, body); anchor.before(root);

  let live: RequestLifecycle | null = null;
  let model: RequestLifecycle | null = null;
  let selected: LifecycleStepId = "response";
  let liveSelected: LifecycleStepId = "response";
  let current: LifecycleRequest | null = null;

  function renderSelection(): void {
    if (!model) return;
    const step = model.steps.find(item => item.id === selected) ?? model.steps[4];
    selected = step.id;
    for (let index = 0; index < controlsByStep.length; index++) {
      controlsByStep[index].button.setAttribute("aria-pressed", String(model.steps[index].id === selected));
    }
    phase.textContent = `${step.phase === "context" ? "Browser context" : step.phase === "network" ? "Network / HTTP" : "Application"} · ${step.badge}`;
    detail.dataset.status = step.status;
    stepTitle.textContent = step.label; stepSummary.textContent = step.summary;
    evidence.replaceChildren(...step.evidence.map(fact => element("li", "", fact)));
    next.textContent = step.next;
    action.hidden = !step.target || model.mode !== "captured";
    action.textContent = step.target ? targets[step.target] : "";
  }
  function paint(): void {
    if (!model) return;
    root.hidden = false; root.dataset.mode = model.mode; root.dataset.tone = model.tone;
    modeBadge.textContent = model.mode === "example" ? "Simulated example" : "Captured request";
    scope.textContent = model.mode === "example"
      ? "Learning example only — not your page, not live traffic. Return to Selected request to inspect your capture."
      : "Finished request · passive evidence. Application checkpoints stay unknown unless actually observed.";
    headline.textContent = model.headline; metric.textContent = model.metric; summary.textContent = model.summary;
    model.steps.forEach((step, index) => {
      const control = controlsByStep[index]; control.li.dataset.status = step.status; control.li.dataset.phase = step.phase;
      control.button.dataset.step = step.id;
      control.button.setAttribute("aria-label", `${step.label}, ${step.phase}, ${step.badge}`);
      control.icon.textContent = symbols[step.status]; control.name.textContent = step.label; control.badge.textContent = step.badge;
      // Incoming evidence determines the next segment. The return-to-code edge is
      // always conceptual, including in the completed teaching example.
      const state = index === 7 ? "unknown" : model!.steps[index + 1].status;
      segments[index].dataset.status = state; arrows[index].dataset.status = state;
    });
    renderSelection();
  }
  action.addEventListener("click", () => {
    const step = model?.steps.find(item => item.id === selected);
    if (model?.mode === "captured" && step?.target) navigate(step.target);
  });
  examples.addEventListener("change", () => {
    const value = examples.value;
    model = value === "success" || value === "http-error" || value === "parse-error"
      ? buildLifecycleExample(value as LifecycleExample) : live;
    selected = model?.mode === "captured" ? liveSelected : model?.focus ?? "response";
    paint();
  });
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "Expand" : "Collapse";
    toggle.setAttribute("aria-expanded", String(!body.hidden));
  });
  return {
    root,
    render(request) {
      const changed = current !== request || current?.id !== request.id;
      current = request; live = buildRequestLifecycle(request);
      if (changed) { examples.value = "captured"; selected = liveSelected = live.focus; }
      if (examples.value === "captured") model = live;
      paint();
    },
    reset() {
      current = null; live = null; model = null; root.hidden = true;
      examples.value = "captured"; selected = liveSelected = "response";
      for (const node of [headline, metric, summary, scope, phase, stepTitle, stepSummary, evidence, next, action]) node.textContent = "";
      for (const control of controlsByStep) control.button.setAttribute("aria-pressed", "false");
    },
  };
}
