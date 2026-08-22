import type {
  NormalizedRequest,
  RequestData,
  RequestOutcome,
} from "../../src/network/types.js";

let nextId = 1;

function outcomeFromStatus(status: number): RequestOutcome {
  if (status >= 200 && status < 300) {
    return "success";
  }

  if (status >= 300 && status < 400) {
    return "redirect";
  }

  if (status >= 400 && status < 500) {
    return "client-error";
  }

  if (status >= 500 && status < 600) {
    return "server-error";
  }

  return "unknown";
}

function statusTextFromStatus(status: number): string {
  const values: Record<number, string> = {
    200: "OK",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };

  return values[status] ?? "";
}

export function makeRequest(
  overrides: Partial<NormalizedRequest> = {}
): NormalizedRequest {
  const url = overrides.url ?? "https://api.example.com/users";
  const parsedUrl = new URL(url);

  const status = overrides.status ?? 200;

  const base: NormalizedRequest = {
    id: `request-${nextId++}`,

    startedAt: "2026-08-22T12:00:00.000Z",
    duration: 100,

    category: "Fetch",
    method: "GET",

    url,
    host: parsedUrl.host,
    path: parsedUrl.pathname,
    protocol: parsedUrl.protocol.replace(":", ""),

    status,
    statusText: statusTextFromStatus(status),
    outcome: outcomeFromStatus(status),

    requestMimeType: undefined,
    responseMimeType: "application/json",

    requestSize: 100,
    responseSize: 1000,

    query: [],
    requestHeaders: [],
    requestBody: undefined,

    responseHeaders: [],
    redirectUrl: undefined,

    timings: {
      blocked: 1,
      dns: 2,
      connect: 5,
      send: 2,
      wait: 70,
      receive: 20,
      ssl: 0,
      total: 100,
    },

    initiator: undefined,
    priority: undefined,
    serverIPAddress: undefined,
    connection: undefined,

    cached: false,

    raw: {} as RequestData,
  };

  return {
    ...base,
    ...overrides,
  };
}