import type { NormalizedRequest } from "../network/types.js";
export type RequestFilter = "All" | "Errors" | "Slow" | NormalizedRequest["category"];
export const REQUEST_PAGE_SIZE = 200;
export const SLOW_REQUEST_MS = 1000;
export type WorkspaceRequest = Pick<NormalizedRequest, "id" | "method" | "url" | "host" | "path" | "category" | "status" | "duration" | "responseSize" | "startedAt">;
export function isHttpError(request: Pick<WorkspaceRequest, "status">): boolean {
  return request.status >= 400 && request.status < 600;
}
export function filterWorkspaceRequests<T extends WorkspaceRequest>(
  requests: readonly T[], filter: RequestFilter, search: string, isolated: ReadonlySet<string> | null = null,
): T[] {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return requests.filter(request => {
    if (isolated && !isolated.has(request.id)) return false;
    if (filter === "Errors" && !isHttpError(request)) return false;
    if (filter === "Slow" && !(Number.isFinite(request.duration) && request.duration > SLOW_REQUEST_MS)) return false;
    if (!["All", "Errors", "Slow"].includes(filter) && request.category !== filter) return false;
    const haystack = `${request.method} ${request.url} ${request.status} ${request.category}`.toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}
export function requestPage<T>(rows: readonly T[], requestedPage: number): { rows: T[]; page: number; pages: number; start: number; end: number } {
  const pages = Math.max(1, Math.ceil(rows.length / REQUEST_PAGE_SIZE));
  const page = Math.min(pages - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  const offset = page * REQUEST_PAGE_SIZE;
  return { rows: rows.slice(offset, offset + REQUEST_PAGE_SIZE), page, pages, start: rows.length ? offset + 1 : 0, end: Math.min(offset + REQUEST_PAGE_SIZE, rows.length) };
}
export function summarizeWorkspaceRequests(rows: readonly WorkspaceRequest[]): { count: number; bytes: number; span: number; errors: number; slow: number } {
  let bytes = 0, first = Infinity, last = -Infinity, errors = 0, slow = 0;
  for (const row of rows) {
    if (Number.isFinite(row.responseSize)) bytes += Math.max(0, row.responseSize);
    if (isHttpError(row)) errors++;
    if (Number.isFinite(row.duration) && row.duration > SLOW_REQUEST_MS) slow++;
    const start = Date.parse(row.startedAt);
    if (Number.isFinite(start) && Number.isFinite(row.duration)) {
      first = Math.min(first, start); last = Math.max(last, start + Math.max(0, row.duration));
    }
  }
  return { count: rows.length, bytes, span: first === Infinity ? 0 : Math.max(0, last - first), errors, slow };
}
export function formatBytes(bytes: number): string {
  return !Number.isFinite(bytes) || bytes < 0 ? "Unavailable" : bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function formatDuration(ms: number): string {
  return !Number.isFinite(ms) || ms < 0 ? "Unavailable" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
