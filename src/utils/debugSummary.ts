import type { RequestAnalysis, NormalizedRequest } from "../network/types.js";
import type { RequestDiagnosis } from "../network/diagnosticRules.js";

const SENSITIVE_KEY_PATTERN = /(auth|authorization|token|secret|password|passwd|api[-_]?key|session|cookie|signature|credential|access[-_]?key)/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

export interface DebugSummaryInput {
  request: NormalizedRequest;
  analysis: RequestAnalysis;
  diagnosis?: RequestDiagnosis | null;
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

function formatDuration(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(2)} s`;
  }
  return `${Math.round(milliseconds)} ms`;
}

function redactSecrets(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(
      /([?&]|\b)([^\s=&:]+)(=|:\s*)([^\s&#,;]+)/gi,
      (match, prefix: string, key: string, separator: string, secretValue: string) => {
        if (!SENSITIVE_KEY_PATTERN.test(key)) {
          return match;
        }
        return `${prefix}${key}${separator}[REDACTED]`;
      }
    );
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";

    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }

    return redactSecrets(url.toString());
  } catch {
    return redactSecrets(rawUrl);
  }
}

function formatInitiator(request: NormalizedRequest): string | null {
  const initiator = request.initiator;
  if (!initiator) return null;

  const source = initiator.url ? sanitizeUrl(initiator.url) : initiator.type;
  if (initiator.lineNumber === undefined) {
    return source;
  }

  return `${source}:${initiator.lineNumber}`;
}

function appendList(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;

  lines.push("", heading);
  items.forEach((item, index) => {
    lines.push(`${heading === "Things to check" ? `${index + 1}.` : "-"} ${redactSecrets(item)}`);
  });
}

export function formatDebugSummary({
  request,
  analysis,
  diagnosis,
}: DebugSummaryInput): string {
  const lines: string[] = [
    "Blackbox Debug Summary",
    "",
    `${request.method} ${sanitizeUrl(request.url)}`,
    `Status: ${request.status} ${request.statusText || ""}`.trimEnd(),
    `Outcome: ${request.outcome}`,
    `Resource type: ${request.category}`,
    `Duration: ${formatDuration(request.duration)}`,
    `Response size: ${formatBytes(request.responseSize)}`,
  ];

  const initiator = formatInitiator(request);
  if (initiator) {
    lines.push(`Initiated by: ${initiator}`);
  }

  lines.push(
    `Response body: ${request.responseBodyLoaded ? "loaded locally (body omitted from copied summary)" : "not loaded"}`
  );

  if (diagnosis) {
    lines.push(
      "",
      "Diagnosis",
      diagnosis.title,
      diagnosis.summary,
      `Category: ${diagnosis.category}`,
      `Severity: ${diagnosis.severity}`
    );

    if (diagnosis.confidence !== "not-applicable") {
      lines.push(`Confidence: ${diagnosis.confidence}`);
    }

    if (diagnosis.evidence.length > 0) {
      lines.push("", "Evidence");
      diagnosis.evidence.forEach((evidence) => {
        lines.push(`- ${evidence.label}: ${redactSecrets(evidence.value)}`);
      });
    }

    appendList(lines, "Possible causes", diagnosis.likelyCauses);
    appendList(lines, "Things to check", diagnosis.suggestions);
  } else {
    lines.push("", "Detected signals");

    if (analysis.issues.length === 0) {
      lines.push("- No issues detected by the current request analyzer.");
    } else {
      analysis.issues.forEach((issue) => {
        lines.push(`- ${issue.title.replace(/^[^A-Za-z0-9]+\s*/, "")}: ${redactSecrets(issue.summary)}`);
      });
    }
  }

  lines.push(
    "",
    "Privacy note: Blackbox intentionally omits raw headers, cookies, authorization values, and response/request bodies from copied summaries."
  );

  return lines.join("\n");
}

export async function copyDebugSummary(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy was rejected by the browser.");
  }
}
