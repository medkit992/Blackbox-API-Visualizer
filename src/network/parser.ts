import type {
  InitiatorType,
  NormalizedRequest,
  NormalizedTimings,
  RequestCategory,
  RequestData,
  RequestOutcome,
  ResourcePriority,
} from "./types.js";

function normalizeResourceType(resourceType: string | null | undefined): RequestCategory | undefined {
  const resourceTypes: Record<string, RequestCategory> = {
    document: "Document",
    stylesheet: "Stylesheet",
    image: "Image",
    media: "Media",
    font: "Font",
    script: "Script",
    texttrack: "TextTrack",
    xhr: "XHR",
    fetch: "Fetch",
    prefetch: "Prefetch",
    eventsource: "EventSource",
    websocket: "WebSocket",
    manifest: "Manifest",
    "signed-exchange": "SignedExchange",
    ping: "Ping",
    "csp-violation-report": "CSPViolationReport",
    preflight: "Preflight",
    other: "Other",
  };

  return resourceType ? resourceTypes[resourceType] : undefined;
}

function normalizeInitiator(initiator: chrome.devtools.network.Request["_initiator"]): RequestData["_initiator"] {
  if (!initiator || typeof initiator === "string") {
    return undefined;
  }

  const rawInitiator = initiator as {
    type?: string;
    url?: string;
    lineNumber?: number | null;
    stack?: unknown;
  };

  const initiatorTypes: InitiatorType[] = [
    "parser",
    "script",
    "preload",
    "SignedExchange",
    "preflight",
    "FedCM",
    "other",
  ];
  const type = initiatorTypes.includes(rawInitiator.type as InitiatorType)
    ? rawInitiator.type as InitiatorType
    : "other";

  return {
    type,
    ...(rawInitiator.url ? { url: rawInitiator.url } : {}),
    ...(rawInitiator.lineNumber !== null && rawInitiator.lineNumber !== undefined
      ? { lineNumber: rawInitiator.lineNumber }
      : {}),
    ...(rawInitiator.stack !== undefined ? { stack: rawInitiator.stack } : {}),
  };
}

function normalizePriority(priority: string | null | undefined): ResourcePriority | undefined {
  const priorities: ResourcePriority[] = ["VeryLow", "Low", "Medium", "High", "VeryHigh"];
  return priority && priorities.includes(priority as ResourcePriority)
    ? priority as ResourcePriority
    : undefined;
}

export default function parseRequest(request: chrome.devtools.network.Request): RequestData {
  const requestData: RequestData = {
    startedDateTime: request.startedDateTime.toString(),
    time: request.time,
    request: {
      method: request.request.method,
      url: request.request.url,
      httpVersion: request.request.httpVersion,
      headers: request.request.headers,
      queryString: request.request.queryString,
      cookies: request.request.cookies,
      headersSize: request.request.headersSize,
      bodySize: request.request.bodySize,
      postData: {
        mimeType: request.request.postData?.mimeType || "",
        text: request.request.postData?.text || "",
        params: JSON.stringify(request.request.postData?.params || []),
      }
    },
    response: {
      status: request.response.status,
      statusText: request.response.statusText,
      httpVersion: request.response.httpVersion,
      headers: request.response.headers,
      cookies: request.response.cookies,
      redirectURL: request.response.redirectURL,
      headersSize: request.response.headersSize,
      bodySize: request.response.bodySize,
      content: {
        size: request.response.content.size,
        compression: request.response.content.compression,
        mimeType: request.response.content.mimeType,
        text: request.response.content.text,
        encoding: request.response.content.encoding,
      }
    },
    cache: {
        beforeRequest: request.cache.beforeRequest,
        afterRequest: request.cache.afterRequest,
    },
    timings: {
        blocked: request.timings.blocked,
        dns: request.timings.dns,
        connect: request.timings.connect,
        send: request.timings.send,
        wait: request.timings.wait,
        receive: request.timings.receive,
        ssl: request.timings.ssl,
    },
    serverIPAddress: request.serverIPAddress,
    connection: request.connection,
    _resourceType: normalizeResourceType(request._resourceType),
    _initiator: normalizeInitiator(request._initiator),
    _priority: normalizePriority(request._priority),
    getContent(callback): void {
      if (typeof request.getContent === "function") {
        request.getContent((content, encoding) => {
          callback(content ?? "", encoding ?? "");
        });
        return;
      }

      callback(
        request.response.content.text ?? "",
        request.response.content.encoding ?? ""
      );
    }
    };

    return requestData;
}

function normalizeOutcome(status: number): RequestOutcome {
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

function normalizeTimings(timings: RequestData["timings"]): NormalizedTimings {
  const blocked = Math.max(timings.blocked ?? 0, 0);
  const dns = Math.max(timings.dns ?? 0, 0);
  const connect = Math.max(timings.connect ?? 0, 0);
  const send = Math.max(timings.send ?? 0, 0);
  const wait = Math.max(timings.wait ?? 0, 0);
  const receive = Math.max(timings.receive ?? 0, 0);
  const ssl = Math.max(timings.ssl ?? 0, 0);

  return {
    blocked,
    dns,
    connect,
    send,
    wait,
    receive,
    ssl,
    total: blocked + dns + connect + send + wait + receive,
  };
}

export function normalizeRequest(requestData: RequestData): NormalizedRequest {
  const url = new URL(requestData.request.url);

  const requestBodySize = Math.max(requestData.request.bodySize, 0);
  // bodySize can be -1 when unknown; fall back to the decoded content size
  const responseBodySize =
    requestData.response.bodySize >= 0
      ? requestData.response.bodySize
      : Math.max(requestData.response.content.size, 0);
  const requestHeadersSize = Math.max(requestData.request.headersSize, 0);
  const responseHeadersSize = Math.max(requestData.response.headersSize, 0);
  const hasInlineResponseBody = requestData.response.content.text !== undefined;

  return {
    id: crypto.randomUUID(),
    startedAt: requestData.startedDateTime,
    duration: requestData.time,

    category: requestData._resourceType ?? "Other",
    method: requestData.request.method,
    url: requestData.request.url,
    host: url.host,
    path: url.pathname,
    protocol: url.protocol.replace(":", ""),

    status: requestData.response.status,
    statusText: requestData.response.statusText,
    outcome: normalizeOutcome(requestData.response.status),

    requestMimeType: requestData.request.postData.mimeType || undefined,
    responseMimeType: requestData.response.content.mimeType,
    requestSize: requestHeadersSize + requestBodySize,
    responseSize: responseHeadersSize + responseBodySize,

    query: requestData.request.queryString,
    requestHeaders: requestData.request.headers,
    requestBody: requestData.request.postData.text || undefined,

    responseHeaders: requestData.response.headers,
    redirectUrl: requestData.response.redirectURL || undefined,
    responseBody: requestData.response.content.text,
    responseBodyEncoding: requestData.response.content.encoding,
    responseBodyLoaded: hasInlineResponseBody,

    timings: normalizeTimings(requestData.timings),

    initiator: requestData._initiator,
    priority: requestData._priority,
    serverIPAddress: requestData.serverIPAddress,
    connection: requestData.connection,

    cached: Boolean(requestData.cache.beforeRequest || requestData.cache.afterRequest),

    raw: requestData,
  };
}
