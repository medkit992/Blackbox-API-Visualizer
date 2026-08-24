import type { ResponseExplorerSelection } from "./response-explorer.js";

const responseTab = document.getElementById("tab-response");
const responseToolbar = responseTab?.querySelector<HTMLElement>(".response-toolbar");
const rawResponse = document.getElementById("details-response-body") as HTMLPreElement | null;

if (responseTab && responseToolbar && rawResponse) {
  const explorer = document.createElement("div");
  explorer.className = "response-explorer";
  explorer.innerHTML = `
    <div class="response-explorer__toolbar">
      <div class="response-explorer__view-toggle" role="group" aria-label="Response view">
        <button id="response-view-tree" type="button" class="active" aria-pressed="true">Tree</button>
        <button id="response-view-raw" type="button" aria-pressed="false">Raw</button>
      </div>
      <span id="response-explorer-status" class="response-explorer__status">Load a response to explore it</span>
    </div>

    <div id="response-tree" class="response-explorer__tree" aria-live="polite">
      <p class="response-explorer__placeholder">
        Load a JSON response to explore its structure and select a value.
      </p>
    </div>

    <section id="response-selection" class="response-explorer__selection" hidden aria-live="polite">
      <div class="response-explorer__selection-header">
        <h3>Selected Value</h3>
      </div>
      <div class="response-explorer__selection-grid">
        <div class="response-explorer__field">
          <span class="response-explorer__field-label">Type</span>
          <span id="response-selected-type" class="response-explorer__field-value">—</span>
        </div>
        <div class="response-explorer__field">
          <span class="response-explorer__field-label">Value</span>
          <span id="response-selected-value" class="response-explorer__field-value">—</span>
        </div>
        <div class="response-explorer__field">
          <span class="response-explorer__field-label">JavaScript path</span>
          <div class="response-explorer__path-row">
            <code id="response-selected-path" class="response-explorer__field-value">—</code>
            <button id="copy-response-path" class="response-explorer__copy-path" type="button" disabled>Copy Path</button>
          </div>
        </div>
      </div>
    </section>
  `;

  responseToolbar.insertAdjacentElement("afterend", explorer);
  rawResponse.classList.add("response-explorer__raw");
  explorer.insertBefore(rawResponse, explorer.querySelector("#response-selection"));
  rawResponse.hidden = true;

  const treeButton = explorer.querySelector<HTMLButtonElement>("#response-view-tree")!;
  const rawButton = explorer.querySelector<HTMLButtonElement>("#response-view-raw")!;
  const tree = explorer.querySelector<HTMLElement>("#response-tree")!;
  const status = explorer.querySelector<HTMLElement>("#response-explorer-status")!;
  const selectionPanel = explorer.querySelector<HTMLElement>("#response-selection")!;
  const selectedType = explorer.querySelector<HTMLElement>("#response-selected-type")!;
  const selectedValue = explorer.querySelector<HTMLElement>("#response-selected-value")!;
  const selectedPath = explorer.querySelector<HTMLElement>("#response-selected-path")!;
  const copyPathButton = explorer.querySelector<HTMLButtonElement>("#copy-response-path")!;

  let currentSelection: ResponseExplorerSelection | null = null;

  function setView(view: "tree" | "raw"): void {
    const showTree = view === "tree";
    tree.hidden = !showTree;
    rawResponse.hidden = showTree;
    treeButton.classList.toggle("active", showTree);
    rawButton.classList.toggle("active", !showTree);
    treeButton.setAttribute("aria-pressed", String(showTree));
    rawButton.setAttribute("aria-pressed", String(!showTree));
  }

  treeButton.addEventListener("click", () => {
    if (!treeButton.disabled) setView("tree");
  });
  rawButton.addEventListener("click", () => setView("raw"));

  copyPathButton.addEventListener("click", async () => {
    if (!currentSelection) return;
    await navigator.clipboard.writeText(currentSelection.path);
    const previous = copyPathButton.textContent;
    copyPathButton.textContent = "Copied";
    window.setTimeout(() => {
      copyPathButton.textContent = previous;
    }, 900);
  });

  function getType(value: unknown): ResponseExplorerSelection["type"] {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "object";
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    return "boolean";
  }

  function formatValue(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "object") {
      return Array.isArray(value)
        ? `Array(${value.length})`
        : `Object(${Object.keys(value as Record<string, unknown>).length})`;
    }
    return String(value);
  }

  function nextPath(parentPath: string, key: string | number, parentIsArray: boolean): string {
    if (parentIsArray) return `${parentPath}[${key}]`;
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key))) return `${parentPath}.${key}`;
    return `${parentPath}[${JSON.stringify(String(key))}]`;
  }

  function clearSelection(): void {
    currentSelection = null;
    selectionPanel.hidden = true;
    copyPathButton.disabled = true;
    selectedType.textContent = "—";
    selectedValue.textContent = "—";
    selectedPath.textContent = "—";
  }

  function showTreeMessage(message: string, statusMessage: string): void {
    clearSelection();
    tree.innerHTML = `<p class="response-explorer__placeholder"></p>`;
    const placeholder = tree.querySelector<HTMLElement>(".response-explorer__placeholder");
    if (placeholder) placeholder.textContent = message;
    treeButton.disabled = false;
    status.textContent = statusMessage;
    setView("tree");
  }

  function selectValue(path: string, value: unknown): void {
    currentSelection = { path, type: getType(value), value: formatValue(value) };
    selectedPath.textContent = currentSelection.path;
    selectedType.textContent = currentSelection.type;
    selectedValue.textContent = currentSelection.value;
    copyPathButton.disabled = false;
    selectionPanel.hidden = false;
  }

  function createNode(label: string, value: unknown, path: string, depth: number): HTMLElement {
    const node = document.createElement("div");
    node.className = "response-tree__node";

    const type = getType(value);
    const expandable = type === "object" || type === "array";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "response-tree__row";
    row.style.setProperty("--tree-depth", String(depth));

    const disclosure = document.createElement("span");
    disclosure.className = "response-tree__disclosure";
    disclosure.textContent = expandable ? "›" : "";

    const key = document.createElement("span");
    key.className = "response-tree__key";
    key.textContent = label;

    const preview = document.createElement("span");
    preview.className = `response-tree__value response-tree__value--${type}`;
    preview.textContent = formatValue(value);

    row.append(disclosure, key, preview);
    node.append(row);

    let children: HTMLElement | null = null;
    let expanded = false;

    const expand = (): void => {
      if (!expandable) return;
      if (!children) {
        children = document.createElement("div");
        children.className = "response-tree__children";
        const entries = Array.isArray(value)
          ? value.map((item, index) => [index, item] as const)
          : Object.entries(value as Record<string, unknown>);

        entries.forEach(([childKey, childValue]) => {
          children!.append(
            createNode(
              String(childKey),
              childValue,
              nextPath(path, childKey, Array.isArray(value)),
              depth + 1
            )
          );
        });
        node.append(children);
      }
      expanded = !expanded;
      children.hidden = !expanded;
      disclosure.textContent = expanded ? "⌄" : "›";
      row.setAttribute("aria-expanded", String(expanded));
    };

    row.addEventListener("click", () => {
      selectValue(path, value);
      expand();
    });

    return node;
  }

  function renderResponse(): void {
    const body = rawResponse.textContent ?? "";

    if (body.includes('Select "Load Response"')) {
      showTreeMessage(
        "Load a JSON response to explore its structure and select a value.",
        "Load a response to explore it"
      );
      return;
    }

    if (body === "Loading response body...") {
      showTreeMessage("Loading response body…", "Loading response…");
      return;
    }

    if (rawResponse.querySelector("img")) {
      clearSelection();
      treeButton.disabled = true;
      status.textContent = "Image response";
      setView("raw");
      return;
    }

    if (!body || body === "(empty response body)" || body === "Response body is no longer available.") {
      clearSelection();
      treeButton.disabled = true;
      status.textContent = body || "Empty response";
      setView("raw");
      return;
    }

    try {
      const parsed = JSON.parse(body) as unknown;
      clearSelection();
      tree.innerHTML = "";
      tree.append(createNode("data", parsed, "data", 0));
      treeButton.disabled = false;
      status.textContent = "JSON response · select any value for its JS path";
      setView("tree");
    } catch {
      clearSelection();
      tree.innerHTML = `<p class="response-explorer__placeholder">This response is not valid JSON. Use Raw to inspect the response body.</p>`;
      treeButton.disabled = true;
      status.textContent = "Non-JSON response";
      setView("raw");
    }
  }

  new MutationObserver(renderResponse).observe(rawResponse, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  renderResponse();
}
