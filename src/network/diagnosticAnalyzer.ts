import { analyzeRequest } from "./analyzer.js";
import {
  DIAGNOSTIC_RULES,
  type DiagnosticConfidence,
  type DiagnosticEvidence,
  type DiagnosticEvidenceDefinition,
  type DiagnosticRuleDefinition,
  type RequestDiagnosis,
} from "./diagnosticRules.js";
import type {
  Header,
  NormalizedRequest,
  RequestAnalysis,
  RequestIssueType,
} from "./types.js";

export interface DiagnosticContext {
  request: NormalizedRequest;
  analysis: RequestAnalysis;
}

const RESPONSE_MESSAGE_KEYS = [
  "message",
  "error_description",
  "errorDescription",
  "detail",
  "details",
  "reason",
  "error",
  "errors",
  "code",
  "errorCode",
  "title",
] as const;

function getHeader(headers: Header[], name: string): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(2)} s`;
  }

  return `${Math.round(milliseconds)} ms`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${bytes} B`;
}

function compactText(value: string, maximumLength = 280): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maximumLength) {
    return compacted;
  }

  return `${compacted.slice(0, maximumLength - 1)}…`;
}

function readablePrimitive(value: unknown): string | null {
  if (typeof value === "string") {
    return compactText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function findStructuredMessage(value: unknown, depth = 0): string | null {
  if (depth > 4) {
    return null;
  }

  const primitive = readablePrimitive(value);
  if (primitive) {
    return primitive;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5)) {
      const nested = findStructuredMessage(item, depth + 1);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const object = value as Record<string, unknown>;

  for (const key of RESPONSE_MESSAGE_KEYS) {
    if (!(key in object)) {
      continue;
    }

    const nested = findStructuredMessage(object[key], depth + 1);
    if (nested) {
      if (key === "message" || key === "detail" || key === "details" || key === "reason") {
        return nested;
      }

      return `${key}: ${nested}`;
    }
  }

  return null;
}

export function extractResponseMessage(request: NormalizedRequest): string | null {
  if (!request.responseBodyLoaded || !request.responseBody) {
    return null;
  }

  const mimeType = request.responseMimeType.toLowerCase();
  if (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("font/") ||
    mimeType.includes("octet-stream")
  ) {
    return null;
  }

  const body = request.responseBody.trim();
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const structuredMessage = findStructuredMessage(parsed);
    if (structuredMessage) {
      return structuredMessage;
    }
  } catch {
    // Non-JSON response bodies can still contain useful server error text.
  }

  const withoutMarkup = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const compacted = compactText(withoutMarkup);
  return compacted || null;
}

function formatInitiator(request: NormalizedRequest): string | null {
  const initiator = request.initiator;
  if (!initiator) {
    return null;
  }

  const source = initiator.url ?? initiator.type;
  if (initiator.lineNumber === undefined) {
    return source;
  }

  return `${source}:${initiator.lineNumber}`;
}

function evidenceValue(
  definition: DiagnosticEvidenceDefinition,
  request: NormalizedRequest
): string | null {
  switch (definition.source) {
    case "status":
      return `${request.status}${request.statusText ? ` ${request.statusText}` : ""}`;

    case "resource-type":
      return request.category;

    case "duration":
      return formatDuration(request.duration);

    case "server-wait": {
      const percentage =
        request.duration > 0
          ? Math.round((request.timings.wait / request.duration) * 100)
          : 0;
      return `${formatDuration(request.timings.wait)} (${percentage}% of total)`;
    }

    case "response-size":
      return formatBytes(request.responseSize);

    case "response-body":
      return extractResponseMessage(request);

    case "request-content-type":
      return getHeader(request.requestHeaders, "content-type") ?? request.requestMimeType ?? null;

    case "response-content-type":
      return getHeader(request.responseHeaders, "content-type") ?? request.responseMimeType ?? null;

    case "authorization-present":
      return getHeader(request.requestHeaders, "authorization") ? "Present" : "Not present";

    case "retry-after":
      return getHeader(request.responseHeaders, "retry-after") ?? null;

    case "location":
      return getHeader(request.responseHeaders, "location") ?? null;

    case "initiator":
      return formatInitiator(request);

    case "cache":
      return request.cached ? "Served from browser cache" : "Network response";

    case "redirect-target":
      return request.redirectUrl ?? getHeader(request.responseHeaders, "location") ?? null;
  }
}

export function collectDiagnosticEvidence(
  request: NormalizedRequest,
  definitions: readonly DiagnosticEvidenceDefinition[]
): DiagnosticEvidence[] {
  return definitions.flatMap((definition) => {
    const value = evidenceValue(definition, request);
    if (!value) {
      return [];
    }

    return [
      {
        key: definition.key,
        label: definition.label,
        value,
        ...(definition.strength ? { strength: definition.strength } : {}),
      },
    ];
  });
}

function hasIssueType(analysis: RequestAnalysis, types: readonly RequestIssueType[]): boolean {
  return analysis.issues.some((issue) => types.includes(issue.type));
}

export function matchesDiagnosticRule(
  context: DiagnosticContext,
  rule: DiagnosticRuleDefinition
): boolean {
  const { request, analysis } = context;
  const selector = rule.selector;

  if (selector.statuses && !selector.statuses.includes(request.status)) {
    return false;
  }

  if (selector.statusRange) {
    const [minimum, maximum] = selector.statusRange;
    if (request.status < minimum || request.status > maximum) {
      return false;
    }
  }

  if (selector.outcomes && !selector.outcomes.includes(request.outcome)) {
    return false;
  }

  if (selector.issueTypes && !hasIssueType(analysis, selector.issueTypes)) {
    return false;
  }

  if (
    selector.resourceCategories &&
    !selector.resourceCategories.includes(request.category)
  ) {
    return false;
  }

  if (selector.requiresNoIssues && analysis.issues.length > 0) {
    return false;
  }

  return true;
}

function raiseConfidence(confidence: DiagnosticConfidence): DiagnosticConfidence {
  if (confidence === "low") {
    return "medium";
  }

  if (confidence === "medium") {
    return "high";
  }

  return confidence;
}

function resolveConfidence(
  rule: DiagnosticRuleDefinition,
  evidence: DiagnosticEvidence[]
): DiagnosticConfidence {
  if (rule.defaultConfidence === "not-applicable") {
    return "not-applicable";
  }

  const hasAdditionalStrongEvidence = evidence.some(
    (item) => item.strength === "strong" && item.key !== "status"
  );

  return hasAdditionalStrongEvidence
    ? raiseConfidence(rule.defaultConfidence)
    : rule.defaultConfidence;
}

function selectPrimaryRule(context: DiagnosticContext): DiagnosticRuleDefinition | null {
  let selected: DiagnosticRuleDefinition | null = null;

  for (const rule of DIAGNOSTIC_RULES) {
    if (!matchesDiagnosticRule(context, rule)) {
      continue;
    }

    if (!selected || rule.priority > selected.priority) {
      selected = rule;
    }
  }

  return selected;
}

function fallbackDiagnosis(request: NormalizedRequest): RequestDiagnosis {
  return {
    ruleId: "fallback",
    title: "Request needs review",
    summary: "Blackbox does not yet have a specific diagnostic rule for this request.",
    category: "unknown",
    severity: "info",
    confidence: "low",
    evidence: [
      {
        key: "status",
        label: "HTTP status",
        value: `${request.status}${request.statusText ? ` ${request.statusText}` : ""}`,
        strength: "strong",
      },
      {
        key: "resource-type",
        label: "Resource type",
        value: request.category,
      },
    ],
    likelyCauses: [
      "The request may use an HTTP status, protocol behavior, or browser condition not covered by the current debugger rules.",
    ],
    suggestions: [
      "Inspect the response, headers, timing information, and browser Console for additional context.",
    ],
  };
}

export function diagnoseRequest(
  request: NormalizedRequest,
  analysis: RequestAnalysis = analyzeRequest(request)
): RequestDiagnosis {
  const context: DiagnosticContext = { request, analysis };
  const rule = selectPrimaryRule(context);

  if (!rule) {
    return fallbackDiagnosis(request);
  }

  const evidence = collectDiagnosticEvidence(request, rule.evidence);

  return {
    ruleId: rule.id,
    title: rule.title,
    summary: rule.summary,
    category: rule.category,
    severity: rule.severity,
    confidence: resolveConfidence(rule, evidence),
    evidence,
    likelyCauses: [...rule.likelyCauses],
    suggestions: [...rule.suggestions],
  };
}
