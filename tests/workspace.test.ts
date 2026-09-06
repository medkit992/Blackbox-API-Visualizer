import { describe, expect, it } from "vitest";
import { filterWorkspaceRequests, formatBytes, formatDuration, isHttpError, requestPage, summarizeWorkspaceRequests, REQUEST_PAGE_SIZE, type WorkspaceRequest } from "../src/panel/workspace-model.js";
import { isRequestTab, REQUEST_TABS } from "../src/panel/workspace-navigation.js";
function row(id: string, changes: Partial<WorkspaceRequest> = {}): WorkspaceRequest {
  return { id, method: "GET", url: "https://api.test/books", host: "api.test", path: "/books", category: "Fetch", status: 200, duration: 100, responseSize: 1024, startedAt: "2026-01-01T00:00:00.000Z", ...changes };
}
describe("workspace request filtering", () => {
  const rows = [row("ok"), row("bad", { status: 401 }), row("slow", { duration: 1001 }), row("image", { category: "Image", url: "https://cdn.test/cover.png" })];
  it("keeps every request available with All", () => expect(filterWorkspaceRequests(rows, "All", "")).toEqual(rows));
  it("filters categories", () => expect(filterWorkspaceRequests(rows, "Image", "").map(r => r.id)).toEqual(["image"]));
  it("filters HTTP errors without inventing an HTTP error for status zero", () => {
    expect(filterWorkspaceRequests([...rows, row("unknown", { status: 0 })], "Errors", "").map(r => r.id)).toEqual(["bad"]);
  });
  it("uses the documented strict slow threshold", () => expect(filterWorkspaceRequests([...rows, row("edge", { duration: 1000 })], "Slow", "").map(r => r.id)).toEqual(["slow"]));
  it("searches method, URL, status and type with case-insensitive AND terms", () => expect(filterWorkspaceRequests(rows, "All", " GET   API.test 401 fetch ").map(r => r.id)).toEqual(["bad"]));
  it("combines search with the selected category", () => expect(filterWorkspaceRequests(rows, "Image", "books")).toEqual([]));
  it("combines issue selection with search and category", () => {
    expect(filterWorkspaceRequests(rows, "Fetch", "200", new Set(["bad", "slow"])).map(r => r.id)).toEqual(["slow"]);
  });
  it("an empty selection matches no rows, not all rows", () => expect(filterWorkspaceRequests(rows, "All", "", new Set())).toEqual([]));
  it("search is literal, not a regular expression", () => expect(filterWorkspaceRequests(rows, "All", ".*[")).toEqual([]));
  it("never mutates captured order", () => {
    const before = [...rows]; filterWorkspaceRequests(rows, "Errors", ""); expect(rows).toEqual(before);
  });
});
describe("bounded request pages", () => {
  const rows = Array.from({ length: 503 }, (_, i) => i);
  it("renders at most 200 rows per page", () => expect(requestPage(rows, 0).rows).toHaveLength(REQUEST_PAGE_SIZE));
  it("preserves capture order across pages", () => expect(requestPage(rows, 1).rows).toEqual(rows.slice(200, 400)));
  it("clamps a page after filtering shrinks the result", () => expect(requestPage([1, 2], 99)).toEqual({ rows: [1, 2], page: 0, pages: 1, start: 1, end: 2 }));
  it("handles empty results", () => expect(requestPage([], 0)).toEqual({ rows: [], page: 0, pages: 1, start: 0, end: 0 }));
  it("handles negative and non-finite pages", () => {
    for (const page of [-1, NaN, Infinity]) expect(requestPage(rows, page).page).toBe(0);
  });
  it("retains every row without duplicates or omission", () => expect([0, 1, 2].flatMap(page => requestPage(rows, page).rows)).toEqual(rows));
});
describe("honest session statistics", () => {
  it("uses the elapsed capture span, not the sum of overlapping requests", () => {
    expect(summarizeWorkspaceRequests([row("a", { duration: 1000 }), row("b", { duration: 1000 })]).span).toBe(1000);
  });
  it("accounts for later start times", () => expect(summarizeWorkspaceRequests([row("a"), row("b", { startedAt: "2026-01-01T00:00:01.000Z", duration: 200 })]).span).toBe(1200));
  it("never turns missing size/timing into negative statistics", () => {
    expect(summarizeWorkspaceRequests([row("a", { responseSize: -1, duration: NaN, startedAt: "invalid" })])).toEqual({ count: 1, bytes: 0, span: 0, errors: 0, slow: 0 });
  });
  it("reports the full input session", () => {
    expect(summarizeWorkspaceRequests([row("ok"), row("bad", { status: 500, duration: 2000 })])).toMatchObject({ count: 2, bytes: 2048, errors: 1, slow: 1 });
  });
  it("has a truthful empty state", () => expect(summarizeWorkspaceRequests([])).toEqual({ count: 0, bytes: 0, span: 0, errors: 0, slow: 0 }));
  it("distinguishes unknown, successful, redirect, and error status codes", () => {
    for (const status of [0, 200, 304, 600]) expect(isHttpError({ status })).toBe(false);
    for (const status of [400, 401, 429, 500, 599]) expect(isHttpError({ status })).toBe(true);
  });
  it("formats missing measurements explicitly while preserving measured zero", () => {
    expect(formatDuration(-1)).toBe("Unavailable"); expect(formatDuration(0)).toBe("0 ms");
    expect(formatBytes(NaN)).toBe("Unavailable"); expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB"); expect(formatBytes(1048576)).toBe("1.0 MB"); expect(formatDuration(1200)).toBe("1.20 s");
  });
});
describe("request workspace destinations", () => {
  it("provides seven tools and retains the overview compatibility route", () => {
    expect(REQUEST_TABS).toEqual(["overview", "lifecycle", "diagnosis", "request", "response", "timing", "headers"]);
    for (const tab of REQUEST_TABS) expect(isRequestTab(tab)).toBe(true);
  });
  it("rejects unsupported destinations", () => { expect(isRequestTab("experiment")).toBe(false); expect(isRequestTab(undefined)).toBe(false); });
});
