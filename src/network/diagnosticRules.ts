import type {
  RequestCategory,
  RequestIssueType,
  RequestOutcome,
} from "./types.js";

export type DiagnosticCategory =
  | "success"
  | "authentication"
  | "authorization"
  | "routing"
  | "method"
  | "validation"
  | "conflict"
  | "rate-limit"
  | "server"
  | "availability"
  | "performance"
  | "network"
  | "payload"
  | "cache"
  | "redirect"
  | "unknown";

export type DiagnosticSeverity = "success" | "info" | "warning" | "error";
export type DiagnosticConfidence = "low" | "medium" | "high" | "not-applicable";

export interface DiagnosticEvidence {
  key: string;
  label: string;
  value: string;
  strength?: "supporting" | "strong";
}

export interface DiagnosticEvidenceDefinition {
  key: string;
  label: string;
  source:
    | "status"
    | "resource-type"
    | "duration"
    | "server-wait"
    | "response-size"
    | "response-body"
    | "request-content-type"
    | "response-content-type"
    | "authorization-present"
    | "retry-after"
    | "location"
    | "initiator"
    | "cache"
    | "redirect-target";
  strength?: "supporting" | "strong";
}

export interface DiagnosticRuleSelector {
  statuses?: number[];
  statusRange?: [minimum: number, maximum: number];
  outcomes?: RequestOutcome[];
  issueTypes?: RequestIssueType[];
  resourceCategories?: RequestCategory[];
  requiresNoIssues?: boolean;
}

export interface DiagnosticRuleDefinition {
  id: string;
  priority: number;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  defaultConfidence: DiagnosticConfidence;
  selector: DiagnosticRuleSelector;
  title: string;
  summary: string;
  evidence: DiagnosticEvidenceDefinition[];
  likelyCauses: string[];
  suggestions: string[];
}

export interface RequestDiagnosis {
  ruleId: string;
  title: string;
  summary: string;
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  confidence: DiagnosticConfidence;
  evidence: DiagnosticEvidence[];
  likelyCauses: string[];
  suggestions: string[];
}

const STATUS_EVIDENCE: DiagnosticEvidenceDefinition = {
  key: "status",
  label: "HTTP status",
  source: "status",
  strength: "strong",
};

const INITIATOR_EVIDENCE: DiagnosticEvidenceDefinition = {
  key: "initiator",
  label: "Initiated by",
  source: "initiator",
  strength: "supporting",
};

const RESPONSE_BODY_EVIDENCE: DiagnosticEvidenceDefinition = {
  key: "response-body",
  label: "Server response",
  source: "response-body",
  strength: "strong",
};

/**
 * Declarative catalog for the 0.3.x request debugger.
 *
 * The diagnostic analyzer should evaluate higher-priority rules first, collect
 * matching rules, and use response/header evidence to raise or lower confidence.
 * This file intentionally contains no matching logic so wording and rule data can
 * evolve independently from the analyzer implementation.
 */
export const DIAGNOSTIC_RULES: readonly DiagnosticRuleDefinition[] = [
  {
    id: "preflight-failure",
    priority: 120,
    category: "network",
    severity: "error",
    defaultConfidence: "medium",
    selector: {
      resourceCategories: ["Preflight"],
      outcomes: ["client-error", "server-error", "unknown"],
    },
    title: "Preflight request failed",
    summary: "The browser's CORS preflight did not complete successfully.",
    evidence: [STATUS_EVIDENCE, INITIATOR_EVIDENCE, RESPONSE_BODY_EVIDENCE],
    likelyCauses: [
      "The server may not allow the requesting origin.",
      "The requested method or headers may not be included in the server's CORS policy.",
      "The preflight endpoint may be failing before the actual request can run.",
    ],
    suggestions: [
      "Check Access-Control-Allow-Origin on the preflight response.",
      "Check Access-Control-Allow-Methods and Access-Control-Allow-Headers.",
      "Verify the OPTIONS request reaches the intended server or proxy.",
    ],
  },
  {
    id: "http-401",
    priority: 115,
    category: "authentication",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statuses: [401] },
    title: "Authentication failed",
    summary: "The server did not accept valid authentication for this request.",
    evidence: [
      STATUS_EVIDENCE,
      {
        key: "authorization-present",
        label: "Authorization header",
        source: "authorization-present",
        strength: "strong",
      },
      RESPONSE_BODY_EVIDENCE,
      INITIATOR_EVIDENCE,
    ],
    likelyCauses: [
      "Authentication credentials may be missing.",
      "An access token or session may be expired or invalid.",
      "The credentials may belong to a different environment, audience, or API.",
    ],
    suggestions: [
      "Confirm the expected authentication header or session cookie is being sent.",
      "Refresh or reissue the credential and retry the request.",
      "Inspect the response body for a server-provided authentication error code.",
    ],
  },
  {
    id: "http-403",
    priority: 114,
    category: "authorization",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statuses: [403] },
    title: "Access forbidden",
    summary: "The server understood the request but refused access to the resource.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The current user, token, or API key may not have permission for this resource.",
      "A role, ownership rule, or authorization policy may block the operation.",
      "The credential may be valid but missing a required scope.",
    ],
    suggestions: [
      "Check the user's role and ownership of the requested resource.",
      "Verify token or API-key scopes.",
      "Inspect the response body for the server's authorization reason.",
    ],
  },
  {
    id: "http-429",
    priority: 113,
    category: "rate-limit",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [429] },
    title: "Rate limit exceeded",
    summary: "The server is rejecting requests because too many were sent in the allowed window.",
    evidence: [
      STATUS_EVIDENCE,
      {
        key: "retry-after",
        label: "Retry-After",
        source: "retry-after",
        strength: "strong",
      },
      RESPONSE_BODY_EVIDENCE,
      INITIATOR_EVIDENCE,
    ],
    likelyCauses: [
      "The client may be sending requests too frequently.",
      "Several components or browser tabs may be sharing the same quota.",
      "Retry logic may be repeating requests without backoff.",
    ],
    suggestions: [
      "Honor Retry-After or provider-specific rate-limit headers.",
      "Add throttling, debouncing, caching, or exponential backoff where appropriate.",
      "Check for duplicate or polling requests hitting the same endpoint.",
    ],
  },
  {
    id: "http-404",
    priority: 112,
    category: "routing",
    severity: "warning",
    defaultConfidence: "medium",
    selector: { statuses: [404] },
    title: "Resource not found",
    summary: "The server could not find the requested route or resource.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The URL, route, or path parameter may be incorrect.",
      "The requested resource may have been deleted or may not exist.",
      "The API route or version may have changed.",
      "Some APIs intentionally return 404 for resources the caller is not allowed to discover.",
    ],
    suggestions: [
      "Verify the request URL and path parameters.",
      "Confirm the requested ID, slug, or resource still exists.",
      "Check the API's current route and version documentation.",
    ],
  },
  {
    id: "http-405",
    priority: 111,
    category: "method",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [405] },
    title: "HTTP method not allowed",
    summary: "The route exists, but it does not accept the HTTP method used by this request.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The client may be using GET, POST, PUT, PATCH, or DELETE on the wrong route.",
      "The server route may have changed its supported methods.",
    ],
    suggestions: [
      "Verify the HTTP method expected by the endpoint.",
      "Check the Allow response header when present.",
      "Confirm the client is calling the intended route.",
    ],
  },
  {
    id: "http-408",
    priority: 110,
    category: "network",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statuses: [408] },
    title: "Request timed out",
    summary: "The server stopped waiting for the request to complete.",
    evidence: [STATUS_EVIDENCE, { key: "duration", label: "Duration", source: "duration" }, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The request may have taken too long to upload or complete.",
      "An intermediary proxy or server timeout may be shorter than expected.",
      "The network connection may be unstable or stalled.",
    ],
    suggestions: [
      "Retry the request and compare timing behavior.",
      "Check client, proxy, gateway, and server timeout settings.",
      "Inspect whether a large upload or slow connection is involved.",
    ],
  },
  {
    id: "http-409",
    priority: 109,
    category: "conflict",
    severity: "warning",
    defaultConfidence: "medium",
    selector: { statuses: [409] },
    title: "Resource state conflict",
    summary: "The request conflicts with the resource's current state.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The resource may have changed since the client last read it.",
      "The request may attempt to create a duplicate or violate a uniqueness rule.",
      "Concurrent writes may be competing for the same resource.",
    ],
    suggestions: [
      "Inspect the response body for the conflicting field or state.",
      "Refresh the resource before retrying the write.",
      "Check uniqueness, version, or optimistic-locking requirements.",
    ],
  },
  {
    id: "http-410",
    priority: 108,
    category: "routing",
    severity: "warning",
    defaultConfidence: "high",
    selector: { statuses: [410] },
    title: "Resource is gone",
    summary: "The server indicates that this resource was intentionally removed and is no longer available.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE],
    likelyCauses: [
      "The resource was permanently deleted.",
      "The endpoint was intentionally retired.",
    ],
    suggestions: [
      "Stop retrying the removed resource unless the API documents another recovery path.",
      "Update the client to the replacement resource or endpoint when one exists.",
    ],
  },
  {
    id: "http-413",
    priority: 107,
    category: "payload",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [413] },
    title: "Request payload is too large",
    summary: "The server or intermediary rejected the request because its payload exceeds an allowed size.",
    evidence: [STATUS_EVIDENCE, { key: "request-content-type", label: "Request content type", source: "request-content-type" }, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The request body or uploaded file exceeds the server's configured limit.",
      "A reverse proxy or gateway may enforce a smaller limit than the application server.",
    ],
    suggestions: [
      "Reduce or split the payload when possible.",
      "Check upload limits on the application server, reverse proxy, and API gateway.",
    ],
  },
  {
    id: "http-415",
    priority: 106,
    category: "payload",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [415] },
    title: "Unsupported content type",
    summary: "The server does not accept the request body's media type.",
    evidence: [
      STATUS_EVIDENCE,
      { key: "request-content-type", label: "Request content type", source: "request-content-type", strength: "strong" },
      RESPONSE_BODY_EVIDENCE,
    ],
    likelyCauses: [
      "Content-Type may be missing or incorrect.",
      "The endpoint may expect JSON, form data, multipart data, or another format.",
    ],
    suggestions: [
      "Compare Content-Type with the endpoint's expected request format.",
      "Confirm the body encoding matches the declared Content-Type.",
    ],
  },
  {
    id: "http-422",
    priority: 105,
    category: "validation",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statuses: [422] },
    title: "Request validation failed",
    summary: "The server understood the request format but rejected one or more values.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "A required field may be missing.",
      "A field may have an invalid type, format, range, or value.",
      "The payload may violate a business validation rule.",
    ],
    suggestions: [
      "Read the response body for field-level validation details.",
      "Compare the submitted payload with the API schema.",
      "Verify required fields and allowed values.",
    ],
  },
  {
    id: "http-400",
    priority: 104,
    category: "validation",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statuses: [400] },
    title: "Bad request",
    summary: "The server rejected the request as invalid or malformed.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The request body, query parameters, or path parameters may be malformed.",
      "A required value or header may be missing.",
      "The payload may not match the endpoint's expected schema.",
    ],
    suggestions: [
      "Inspect the response body for a validation or parsing message.",
      "Compare the request URL, headers, and body with a known-good request.",
      "Validate serialized JSON or form data before sending it.",
    ],
  },
  {
    id: "http-502",
    priority: 103,
    category: "server",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [502] },
    title: "Bad gateway",
    summary: "A gateway or proxy received an invalid response from an upstream service.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, { key: "duration", label: "Duration", source: "duration" }],
    likelyCauses: [
      "An upstream application or dependency may be unavailable or returning invalid responses.",
      "A reverse proxy, load balancer, or gateway may be misconfigured.",
    ],
    suggestions: [
      "Check upstream service health and logs.",
      "Inspect proxy, gateway, and load-balancer logs/configuration.",
      "Retry to determine whether the failure is transient.",
    ],
  },
  {
    id: "http-503",
    priority: 102,
    category: "availability",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [503] },
    title: "Service unavailable",
    summary: "The server is temporarily unable to handle the request.",
    evidence: [STATUS_EVIDENCE, { key: "retry-after", label: "Retry-After", source: "retry-after" }, RESPONSE_BODY_EVIDENCE],
    likelyCauses: [
      "The service may be overloaded, restarting, or under maintenance.",
      "A required dependency may be unavailable.",
    ],
    suggestions: [
      "Check service health and deployment status.",
      "Honor Retry-After when the server provides it.",
      "Check dependent services and infrastructure health.",
    ],
  },
  {
    id: "http-504",
    priority: 101,
    category: "availability",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [504] },
    title: "Gateway timed out",
    summary: "A gateway or proxy did not receive an upstream response before its timeout expired.",
    evidence: [STATUS_EVIDENCE, { key: "duration", label: "Duration", source: "duration" }, { key: "server-wait", label: "Server wait", source: "server-wait" }],
    likelyCauses: [
      "The upstream service may be too slow or unavailable.",
      "A gateway timeout may be shorter than the upstream operation requires.",
    ],
    suggestions: [
      "Inspect upstream server timing and logs.",
      "Check gateway/proxy timeout configuration.",
      "Look for slow database queries or dependency calls on the server.",
    ],
  },
  {
    id: "http-500",
    priority: 100,
    category: "server",
    severity: "error",
    defaultConfidence: "high",
    selector: { statuses: [500] },
    title: "Internal server error",
    summary: "The server encountered an unexpected condition while processing the request.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "Application code may have thrown an unhandled error.",
      "A database, filesystem, or external dependency may have failed.",
      "A recent server deployment or configuration change may have introduced the failure.",
    ],
    suggestions: [
      "Check server logs for this request and timestamp.",
      "Inspect recent backend deployments and configuration changes.",
      "Check dependent services, databases, and queues.",
    ],
  },
  {
    id: "generic-server-error",
    priority: 90,
    category: "server",
    severity: "error",
    defaultConfidence: "medium",
    selector: { statusRange: [500, 599], issueTypes: ["server-error"] },
    title: "Server-side failure",
    summary: "The server returned a 5xx response while processing this request.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, { key: "duration", label: "Duration", source: "duration" }],
    likelyCauses: [
      "The application or an upstream dependency may have failed.",
      "The server may be overloaded or misconfigured.",
    ],
    suggestions: [
      "Inspect server and dependency logs.",
      "Compare against recent deployments or infrastructure changes.",
      "Retry once to determine whether the failure is transient.",
    ],
  },
  {
    id: "generic-client-error",
    priority: 80,
    category: "validation",
    severity: "error",
    defaultConfidence: "low",
    selector: { statusRange: [400, 499], issueTypes: ["client-error"] },
    title: "Request rejected",
    summary: "The server rejected the request with a client-error response.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: [
      "The URL, headers, query parameters, or request body may not match what the endpoint expects.",
      "The request may violate an API-specific rule not represented by a more specific HTTP status.",
    ],
    suggestions: [
      "Inspect the response body first; APIs often include the exact rejection reason.",
      "Compare this request with a known-good request to the same endpoint.",
      "Verify the endpoint's required headers, parameters, and payload schema.",
    ],
  },
  {
    id: "slow-request",
    priority: 70,
    category: "performance",
    severity: "warning",
    defaultConfidence: "high",
    selector: { issueTypes: ["slow-request"] },
    title: "Slow request",
    summary: "The request exceeded Blackbox's slow-request threshold.",
    evidence: [
      { key: "duration", label: "Total duration", source: "duration", strength: "strong" },
      { key: "server-wait", label: "Server wait", source: "server-wait", strength: "strong" },
      INITIATOR_EVIDENCE,
    ],
    likelyCauses: [
      "Server processing may be slow.",
      "Network latency, connection setup, or a large transfer may be contributing.",
      "The endpoint may be doing more work or returning more data than expected.",
    ],
    suggestions: [
      "Compare server-wait time with receive/connection timing.",
      "Check backend traces or logs when server wait dominates.",
      "Inspect response size and whether the endpoint can paginate or return less data.",
    ],
  },
  {
    id: "slow-server-wait",
    priority: 69,
    category: "performance",
    severity: "warning",
    defaultConfidence: "high",
    selector: { issueTypes: ["slow-server-wait"] },
    title: "Slow response wait",
    summary: "Most of the delay occurred before the first response data arrived.",
    evidence: [
      { key: "server-wait", label: "Server wait", source: "server-wait", strength: "strong" },
      { key: "duration", label: "Total duration", source: "duration" },
      INITIATOR_EVIDENCE,
    ],
    likelyCauses: [
      "The server may be spending significant time processing the request.",
      "Network latency between the client and server may be high.",
      "An upstream dependency may be delaying the server response.",
    ],
    suggestions: [
      "Check backend timing/tracing for slow application work.",
      "Compare other requests to the same host for similar wait times.",
      "Inspect database and upstream-service latency.",
    ],
  },
  {
    id: "large-response",
    priority: 68,
    category: "payload",
    severity: "warning",
    defaultConfidence: "high",
    selector: { issueTypes: ["large-response"] },
    title: "Large response payload",
    summary: "The response is large enough to affect transfer, parsing, and rendering performance.",
    evidence: [
      { key: "response-size", label: "Response size", source: "response-size", strength: "strong" },
      { key: "response-content-type", label: "Response content type", source: "response-content-type" },
      { key: "duration", label: "Duration", source: "duration" },
    ],
    likelyCauses: [
      "The endpoint may return more records or fields than the client needs.",
      "Pagination or filtering may be missing.",
      "Compression may be absent or ineffective.",
    ],
    suggestions: [
      "Use pagination, filtering, or field selection where possible.",
      "Check gzip/brotli compression on text responses.",
      "Avoid transferring unused data to the client.",
    ],
  },
  {
    id: "redirect",
    priority: 60,
    category: "redirect",
    severity: "info",
    defaultConfidence: "high",
    selector: { issueTypes: ["redirect"], outcomes: ["redirect"] },
    title: "Request redirected",
    summary: "The server redirected this request to another location.",
    evidence: [
      STATUS_EVIDENCE,
      { key: "redirect-target", label: "Redirect target", source: "redirect-target", strength: "strong" },
      { key: "location", label: "Location header", source: "location" },
    ],
    likelyCauses: [
      "The client may be using an old or non-canonical URL.",
      "The server may intentionally redirect HTTP, hostnames, routes, or authentication flows.",
    ],
    suggestions: [
      "Confirm the redirect target is expected.",
      "Use the final URL directly when the redirect is unnecessary and on a hot path.",
    ],
  },
  {
    id: "cached-response",
    priority: 50,
    category: "cache",
    severity: "info",
    defaultConfidence: "high",
    selector: { issueTypes: ["cached-response"] },
    title: "Response served from cache",
    summary: "The browser reused a cached response instead of performing a normal network transfer.",
    evidence: [
      { key: "cache", label: "Cache", source: "cache", strength: "strong" },
      STATUS_EVIDENCE,
      { key: "duration", label: "Duration", source: "duration" },
    ],
    likelyCauses: [
      "Normal browser caching behavior is satisfying this request.",
    ],
    suggestions: [
      "No action is needed when caching is expected.",
      "Disable cache in DevTools when you need to measure a live network response.",
    ],
  },
  {
    id: "status-zero-network-failure",
    priority: 45,
    category: "network",
    severity: "warning",
    defaultConfidence: "low",
    selector: { statuses: [0], outcomes: ["unknown"] },
    title: "Request did not receive a normal HTTP response",
    summary: "The browser recorded this request without a standard HTTP status code.",
    evidence: [STATUS_EVIDENCE, INITIATOR_EVIDENCE, { key: "duration", label: "Duration", source: "duration" }],
    likelyCauses: [
      "The request may have been canceled or blocked by the browser.",
      "A CORS, DNS, TLS, connectivity, or extension-level failure may have occurred.",
      "The page may have navigated away before the request completed.",
    ],
    suggestions: [
      "Compare the request with Chrome's Network and Console error details.",
      "Check CORS, DNS, TLS, and connectivity errors.",
      "Check whether code canceled the request with AbortController or navigation.",
    ],
  },
  {
    id: "healthy-success",
    priority: 10,
    category: "success",
    severity: "success",
    defaultConfidence: "not-applicable",
    selector: { outcomes: ["success"], requiresNoIssues: true },
    title: "Request completed successfully",
    summary: "The server accepted the request and Blackbox did not detect an obvious network or performance issue.",
    evidence: [
      STATUS_EVIDENCE,
      { key: "resource-type", label: "Resource type", source: "resource-type" },
      { key: "duration", label: "Duration", source: "duration" },
      { key: "response-size", label: "Response size", source: "response-size" },
      INITIATOR_EVIDENCE,
    ],
    likelyCauses: [],
    suggestions: ["No action is needed unless the response content is unexpected."],
  },
  {
    id: "unknown-outcome",
    priority: 0,
    category: "unknown",
    severity: "info",
    defaultConfidence: "low",
    selector: { outcomes: ["unknown"] },
    title: "Outcome needs review",
    summary: "Blackbox does not yet have a specific diagnostic rule for this request outcome.",
    evidence: [STATUS_EVIDENCE, RESPONSE_BODY_EVIDENCE, INITIATOR_EVIDENCE],
    likelyCauses: ["The request may use a protocol or browser behavior not covered by the current rule catalog."],
    suggestions: [
      "Inspect the response body, headers, timing, and browser Console for more context.",
      "Add a dedicated diagnostic rule if this pattern is common and well understood.",
    ],
  },
] as const;

export function getDiagnosticRule(id: string): DiagnosticRuleDefinition | undefined {
  return DIAGNOSTIC_RULES.find((rule) => rule.id === id);
}
