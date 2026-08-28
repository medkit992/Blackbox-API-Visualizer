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
const MAX_INSPECTABLE_RESPONSE_BYTES = 2 * 1024 * 1024;
const COMPLETION_TOLERANCE_MS = 50;
const BINARY_MIME_HINT = /^(?:image|audio|video|font)\/|octet-stream|zip|gzip|pdf/i;

function canonicalUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function sameResourceUrl(
  candidate: string,
  target: string,
  baseUrls: readonly string[]
): boolean {
  for (const baseUrl of baseUrls) {
    const left = canonicalUrl(candidate, baseUrl);
    const right = canonicalUrl(target, baseUrl);
    if (left && right && left === right) {
      return true;
    }
  }

  return false;
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
  baseUrls: readonly string[]
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
      return sameResourceUrl(current, targetUrl, baseUrls)
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
  baseUrls: readonly string[]
): { path: string; value: string } | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  try {
    return findUrlInJson(JSON.parse(trimmed) as unknown, targetUrl, baseUrls);
  } catch {
    // Some APIs return text/HTML. Only accept an exact absolute URL occurrence there.
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

function isInspectableResponse(request: NormalizedRequest): boolean {
  if (request.responseSize > MAX_INSPECTABLE_RESPONSE_BYTES) {
    return false;
  }

  const mime = request.responseMimeType.trim().toLowerCase();
  return !mime || !BINARY_MIME_HINT.test(mime);
}

function latestDocumentBase(
  selected: NormalizedRequest,
  timeline: readonly NormalizedRequest[]
): string | null {
  const selectedStart = Date.parse(selected.startedAt);

  const documents = timeline
    .filter((request) => request.category === "Document")
    .filter((request) => request.id !== selected.id)
    .filter((request) => {
      const start = Date.parse(request.startedAt);
      return !Number.isFinite(selectedStart) || !Number.isFinite(start) || start <= selectedStart;
    })
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

  return documents[0]?.url ?? null;
}

function candidateRequests(
  selected: NormalizedRequest,
  timeline: readonly NormalizedRequest[]
): NormalizedRequest[] {
  return timeline
    .filter((request) => request.id !== selected.id)
    .filter((request) => API_CATEGORIES.has(request.category))
    .filter((request) => request.status >= 200 && request.status < 300)
    .filter(isInspectableResponse)
    .filter((request) => completedBefore(request, selected))
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, MAX_CANDIDATES);
}

export async function findRequestProvenance(
  selected: NormalizedRequest,
  timeline: readonly NormalizedRequest[],
  loadResponseBody: ResponseBodyLoader
): Promise<RequestProvenance | null> {
  const documentBase = latestDocumentBase(selected, timeline);

  for (const candidate of candidateRequests(selected, timeline)) {
    if (!candidate.responseBodyLoaded) {
      await loadResponseBody(candidate);
    }

    if (!candidate.responseBody) {
      continue;
    }

    const bases = documentBase
      ? [documentBase, candidate.url]
      : [candidate.url];
    const found = findUrlInText(candidate.responseBody, selected.url, bases);
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
