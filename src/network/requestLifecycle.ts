import type { NormalizedRequest } from "./types.js";

/** A finished HAR entry is evidence of capture, not an application execution trace. */
export type LifecycleRequest = Pick<NormalizedRequest,
  "id" | "category" | "method" | "status" | "duration" | "cached" |
  "responseBodyLoaded" | "responseBody" | "responseBodyEncoding" |
  "responseMimeType" | "initiator"
> & { raw?: { timings?: Partial<NormalizedRequest["raw"]["timings"]> } };
export type LifecycleStepId = "initiator" | "request" | "send" | "wait" | "response" | "parse" | "data" | "usage";
export type LifecycleStatus = "completed" | "failed" | "warning" | "unknown" | "not-reached" | "not-applicable";
export type LifecycleTarget = "source" | "request" | "response" | "timing" | "diagnosis";
export interface LifecycleStep {
  id: LifecycleStepId;
  label: string;
  phase: "context" | "network" | "application";
  status: LifecycleStatus;
  badge: string;
  summary: string;
  evidence: string[];
  next: string;
  target?: LifecycleTarget;
}
export interface RequestLifecycle {
  requestId: string;
  mode: "captured" | "example";
  headline: string;
  summary: string;
  metric: string;
  tone: "success" | "warning" | "error" | "neutral";
  focus: LifecycleStepId;
  steps: LifecycleStep[];
  content: ResponseContentCheck;
}
export type LifecycleExample = "success" | "http-error" | "parse-error";
export const MAX_LIFECYCLE_BODY_CHARS = 256_000;
export interface ResponseContentCheck {
  kind: "unavailable" | "empty" | "not-json" | "encoded" | "too-large" | "valid-json" | "invalid-json";
  summary: string;
}

// Only a small summary is retained; keys are weak and no response is requested here.
const contentChecks = new WeakMap<object, {
  body: string | undefined; encoding: string | undefined; mime: string; loaded: boolean;
  result: ResponseContentCheck;
}>();
export function inspectLifecycleContent(request: LifecycleRequest): ResponseContentCheck {
  const cached = contentChecks.get(request);
  if (cached && cached.body === request.responseBody && cached.encoding === request.responseBodyEncoding &&
      cached.mime === request.responseMimeType && cached.loaded === request.responseBodyLoaded) return cached.result;
  const body = request.responseBody;
  let result: ResponseContentCheck;
  if (!request.responseBodyLoaded || body === undefined) {
    result = { kind: "unavailable", summary: "Response content has not been made available to this view." };
  } else if (request.responseBodyEncoding) {
    result = { kind: "encoded", summary: "Encoded content is not parsed by the lifecycle. Inspect it in Response." };
  } else if (body.length > MAX_LIFECYCLE_BODY_CHARS) {
    result = { kind: "too-large", summary: "Local JSON check skipped: content exceeds the 256,000-character limit." };
  } else if (!body.trim()) {
    result = { kind: "empty", summary: "The captured body is empty. That alone is not a parsing failure." };
  } else {
    const declaredJson = /(?:^|[\/+])json(?:\s*;|\s*$)/i.test(request.responseMimeType);
    try {
      const value: unknown = JSON.parse(body);
      const shape = value === null ? "null" : Array.isArray(value) ? `an array (${value.length} items)` :
        typeof value === "object" ? "an object" : `a ${typeof value}`;
      result = { kind: "valid-json", summary: `Blackbox's local check found valid JSON: ${shape}. This does not prove your app parsed or used it.` };
    } catch {
      result = declaredJson
        ? { kind: "invalid-json", summary: "The captured body is labeled JSON but failed Blackbox's local JSON check. The application's parser was not observed." }
        : { kind: "not-json", summary: "This body is not JSON. HTML, text, images, and other response formats can be intentional." };
    }
  }
  contentChecks.set(request, { body, encoding: request.responseBodyEncoding, mime: request.responseMimeType, loaded: request.responseBodyLoaded, result });
  return result;
}
const milliseconds = (value: number): string => `${Math.round(value * 10) / 10} ms`;
function timingStep(id: "send" | "wait", request: LifecycleRequest): LifecycleStep {
  // Normalization replaces unavailable HAR timings with zero. Read the raw value
  // so a missing phase and an observed zero-duration phase stay distinguishable.
  const value = request.raw?.timings?.[id];
  const observed = typeof value === "number" && Number.isFinite(value) && value >= 0;
  return {
    id, label: id === "send" ? "Send" : "Wait", phase: "network",
    status: observed ? "completed" : "unknown",
    badge: observed ? milliseconds(value) : "Not exposed",
    summary: id === "send" ? "Time Chrome attributed to sending this request, when that phase was exposed." :
        "Time Chrome attributed to waiting for the response. This is not a measurement of server execution alone.",
    evidence: observed ? [`HAR ${id}: ${milliseconds(value)}.`] : ["Chrome did not expose a usable duration for this phase."],
    next: "Open Timing to inspect the available phases. Missing measurements are not zero-duration events.",
    target: "timing",
  };
}
function applicationSteps(): LifecycleStep[] {
  return [
    { id: "parse", label: "Parse", phase: "application", status: "unknown", badge: "Not observed",
      summary: "Receiving a Response and parsing its body are separate operations.",
      evidence: ["HAR does not tell Blackbox whether your code called response.json(), response.text(), or another reader."],
      next: "Check the body reader and await its result in your code. Response Explorer parses a separate local copy.", target: "response" },
    { id: "data", label: "Data ready", phase: "application", status: "unknown", badge: "Not observed",
      summary: "Blackbox cannot tell whether a parsed value became available in your application.",
      evidence: ["A locally inspectable JSON body is not evidence that your application's parsing Promise resolved."],
      next: "Check that you await the parsing operation before accessing its result.", target: "source" },
    { id: "usage", label: "Use data", phase: "application", status: "unknown", badge: "Not observed",
      summary: "A successful HTTP response does not prove that rendering or property access succeeded.",
      evidence: ["Application property access and rendering are outside this passive capture's visibility."],
      next: "Compare your code's property path with Response Explorer, then check the Console for application errors.", target: "response" },
  ];
}
export function buildRequestLifecycle(request: LifecycleRequest): RequestLifecycle {
  const status = request.status;
  const hasStatus = Number.isInteger(status) && status >= 100 && status <= 599;
  const httpError = hasStatus && status >= 400;
  const httpSuccess = hasStatus && status >= 200 && status < 300;
  const content = inspectLifecycleContent(request);
  const bodyless = request.method.toUpperCase() === "HEAD" || status === 204 || status === 205 || status === 304;
  const contentConcern = hasStatus && content.kind === "invalid-json" && !bodyless;
  const response: LifecycleStep = {
    id: "response", label: "Response", phase: "network",
    status: httpError ? "failed" : contentConcern ? "warning" : hasStatus ? "completed" : "unknown",
    badge: hasStatus ? `HTTP ${status}` : "No HTTP status",
    summary: httpError ? "An HTTP error response was captured. Your code may still read and parse its body." :
      httpSuccess ? "An HTTP success response was captured. Application-level success is a separate question." :
      status === 304 ? "The server reported Not Modified. This is cache validation, not an HTTP error." :
      hasStatus ? "An HTTP response was captured. A redirect or informational response is not proof of the final application outcome." :
        "No HTTP status was exposed. The exact failure point and cause cannot be established from this record alone.",
    evidence: [hasStatus ? `Captured HTTP status: ${status}.` : "Status 0 or an unavailable status is not an HTTP response code.",
      ...(request.cached ? ["Cache metadata is present. That does not establish whether this call contacted a server."] : []),
      ...(bodyless ? ["This method/status does not normally include a response body."] : []), content.summary],
    next: httpError ? "Inspect Request Diagnosis and the response. An HTTP 4xx/5xx does not by itself reject fetch() or prevent JSON parsing." :
      contentConcern ? "Inspect the raw response and Content-Type. Check whether the endpoint returned malformed or unexpected content." :
      !hasStatus ? "Check Chrome's Network and Console for cancellation, connection, or CORS evidence; do not assume a particular cause." :
        "Inspect the returned data, then check parsing and data access in your code if the page still fails.",
    target: httpError || !hasStatus ? "diagnosis" : "response",
  };
  const origin = request.initiator?.type;
  return {
    requestId: request.id, mode: "captured", content,
    headline: httpError ? "HTTP error response" : contentConcern ? "Check response format" : httpSuccess ? "HTTP succeeded" :
      status === 304 ? "Cache validated" : hasStatus ? "HTTP response captured" : "No HTTP response",
    summary: "Application handling not observed",
    metric: `${hasStatus ? `HTTP ${status}` : "No HTTP status"} · ${Number.isFinite(request.duration) && request.duration >= 0 ? milliseconds(request.duration) : "duration unavailable"}`,
    tone: httpError ? "error" : contentConcern ? "warning" : httpSuccess ? "success" : "neutral",
    focus: "response",
    steps: [
      { id: "initiator", label: "Initiator", phase: "context", status: origin ? "completed" : "unknown",
        badge: origin ? "Recorded" : "Not exposed",
        summary: "Where Chrome says this request originated. This is context, not an observed fetch() invocation.",
        evidence: [origin ? `Browser initiator type: ${origin}.` : "An initiator was not exposed for this record."],
        next: "Inspect the source context. Parser, browser, and script requests do not all follow the same JavaScript lifecycle.", target: "source" },
      { id: "request", label: "Request", phase: "network", status: "completed", badge: "Captured",
        summary: "Chrome recorded this request. Capture alone does not prove that bytes reached an external server.",
        evidence: ["This is a finished HAR entry, not a live pending-request trace."],
        next: "Inspect the method, destination, parameters, and body sent by your application.", target: "request" },
      timingStep("send", request), timingStep("wait", request), response, ...applicationSteps(),
    ],
  };
}

/** Isolated teaching fixtures. Never merged into capture or presented as app telemetry. */
export function buildLifecycleExample(example: LifecycleExample): RequestLifecycle {
  const request: LifecycleRequest = {
    id: `lifecycle-example-${example}`, category: "Fetch", method: "GET", status: example === "http-error" ? 404 : 200,
    duration: 180, cached: false, responseBodyLoaded: true, responseMimeType: "application/json",
    responseBody: example === "parse-error" ? "{broken json" : example === "http-error" ? '{"error":"Not found"}' : '{"results":[{"title":"Example book"}]}',
    initiator: { type: "script" }, raw: { timings: { send: 1, wait: 154, receive: 25 } },
  };
  const model = buildRequestLifecycle(request);
  model.mode = "example";
  model.summary = example === "parse-error" ? "Example: application parsing failed" : example === "http-error" ? "Example: error body parsed successfully" : "Example: data returned to your code";
  model.headline = example === "parse-error" ? "Failed at parsing" : example === "success" ? "Lifecycle completed" : "HTTP error, valid JSON";
  model.tone = example === "parse-error" || example === "http-error" ? "error" : "success";
  model.focus = example === "parse-error" ? "parse" : example === "success" ? "usage" : "response";
  for (const step of model.steps) {
    step.evidence = step.evidence.map(fact => `Simulated: ${fact}`);
    step.target = undefined;
    if (step.phase !== "application") continue;
    step.status = example === "parse-error" ? step.id === "parse" ? "failed" : "not-reached" : "completed";
    step.badge = step.status === "failed" ? "Parse failed" : step.status === "not-reached" ? "Not reached" : "Completed";
    step.summary = step.status === "failed" ? "In this example, response.json() rejects because the body is not valid JSON." :
      step.status === "not-reached" ? "This example exits its success path when parsing rejects. These later steps are not reached, not additional failures." :
      step.id === "parse" ? "In this example, the code awaits response.json() and parsing succeeds." :
      step.id === "data" ? "In this example, the parsing Promise resolves to a JavaScript value." :
        "In this example, code reads the parsed value. The loop returns to code; it does not send another request.";
    step.evidence = ["This is a controlled teaching example, not an observation of the inspected page."];
    step.next = example === "http-error" ? "An HTTP error can have a valid JSON body. Check response.ok separately from parsing." :
      example === "parse-error" ? "Inspect the response format before assuming that a 200 response guarantees usable JSON." :
        "Receiving the Response, parsing it, and using the data are separate steps.";
  }
  return model;
}
