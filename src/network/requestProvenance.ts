import type { NormalizedRequest } from "./types.js";

export interface RequestProvenance {
  request: NormalizedRequest;
  valuePath: string;
  matchedValue: string;
  confidence: "high";
}

export type ResponseBodyLoader = (request: NormalizedRequest) => Promise<void>;

const API_CATEGORIES = new Set<NormalizedRequest["category"]>(["Fetch", "XHR"]);
const MAX_CANDIDATES = 12;
const MAX_WALK_DEPTH = 12;
const MAX_VALUES = 5000;
const COMPLETION_TOLERANCE_MS = 50;

function canonicalUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function sameResourceUrl(candidate: string, target: string, baseUrl: string): boolean {
  const left = canonicalUrl(candidate, baseUrl);
  const right = canonicalUrl(target, baseUrl);
  return Boolean(left && right && left === right);
}

function nextPath(parent: string, key: string | number, array: boolean): string {
  if (array) {
    return `${parent}[${key}]`;
  }

  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(key))) {
    return parent ? `${parent}.${key}` : String(key);
  }

  return `${parent}[${JSON.stringify(String(key))}]`;
}

function findUrlInJson(
  value: unknown,
  targetUrl: string,
  baseUrl: string
): { path: string; value: string } | null {
  let visited = 0;

  function walk(
    current: unknown,
    path: string,
    depth: number
  ): { path: string; value: string } | null {
    if (depth > MAX_WALK_DEPTH || visited >= MAX_VALUES) {
      return null;
    }

    visited += 1;

    if (typeof current === "string") {
      return sameResourceUrl(current, targetUrl, baseUrl)
        ? { path: path || "data", value: current }
        : null;
    }

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        const found = walk(
          current[index],
          nextPath(path || "data", index, true),
          depth + 1
        );
        if (found) return found;
      }
      return null;
    }

    if (!current || typeof current !== "object") {
      return null;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      const found = walk(
        child,
        nextPath(path || "data", key, false),
        depth + 1
      );
      if (found) return found;
    }

    return null;
  }

  return walk(value, "", 0);
}

function findUrlInText(
  body: string,
  targetUrl: string,
  baseUrl: string
): { path: string; value: string } | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  try {
    return findUrlInJson(JSON.parse(trimmed) as unknown, targetUrl, baseUrl);
  } catch {
    // Some APIs return text/HTML. Only accept an exact literal URL occurrence there.
  }

  if (trimmed.includes(targetUrl)) {
    return { path: "response body", value: targetUrl };
  }

  return null;
}

function completedBefore(
  candidate: NormalizedRequest,
  selected: NormalizedRequest
): boolean {
  const candidateStart = Date.parse(candidate.startedAt);
  const selectedStart = Date.parse(selected.startedAt);

  if (Number.isFinite(candidateStart) && Number.isFinite(selectedStart)) {
    const candidateEnd = candidateStart + Math.max(candidate.duration, 0);
    return candidateEnd <= selectedStart + COMPLETION_TOLERANCE_MS;
  }

  return candidate.id !== selected.id;
}

function candidateRequests(
  selected: NormalizedRequest,
  timeline: readonly NormalizedRequest[]
): NormalizedRequest[] {
  return timeline
    .filter((request) => request.id !== selected.id)
    .filter((request) => API_CATEGORIES.has(request.category))
    .filter((request) => request.status >= 200 && request.status < 300)
    .filter((request) => completedBefore(request, selected))
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, MAX_CANDIDATES);
}

export async function findRequestProvenance(
  selected: NormalizedRequest,
  timeline: readonly NormalizedRequest[],
  loadResponseBody: ResponseBodyLoader
): Promise<RequestProvenance | null> {
  for (const candidate of candidateRequests(selected, timeline)) {
    if (!candidate.responseBodyLoaded) {
      await loadResponseBody(candidate);
    }

    if (!candidate.responseBody) {
      continue;
    }

    const found = findUrlInText(candidate.responseBody, selected.url, candidate.url);
    if (!found) {
      continue;
    }

    return {
      request: candidate,
      valuePath: found.path,
      matchedValue: found.value,
      confidence: "high",
    };
  }

  return null;
}

export function formatProvenance(provenance: RequestProvenance): string {
  const request = provenance.request;
  return `${request.method} ${request.path} → ${provenance.valuePath}`;
}
