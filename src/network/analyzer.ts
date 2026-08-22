import type { NormalizedRequest, RequestAnalysis, RequestIssue } from "./types.js";

const SLOW_REQUEST_THRESHOLD_MS = 1000;
const SLOW_SERVER_WAIT_THRESHOLD_MS = 500;
const LARGE_RESPONSE_THRESHOLD_BYTES = 1024 * 1024;

export function analyzeRequest(
  request: NormalizedRequest
): RequestAnalysis {
    const issues: RequestIssue[] = [];

    if (request.status === 401) {
      issues.push({
        type: "auth-error",
        title: "✕ Authentication failed",
        summary: "The request was not authenticated.",
        message:
          "The server rejected the request because valid authentication " +
          "credentials were not accepted.\n\n" +
          "Check:\n" +
          "• Authorization header\n" +
          "• Session cookie\n" +
          "• Expired access token",
      });
    } else if (request.status === 403) {
      issues.push({
        type: "auth-error",
        title: "✕ Access forbidden",
        summary: "The server refused access to the requested resource.",
        message:
          "The server understood the request but refused access. This often " +
          "indicates a permissions, role, ownership, or authorization-policy issue.\n\n" +
          "Check:\n" +
          "• Account/role permissions for this resource\n" +
          "• API key or token scopes\n" +
          "• Ownership of the requested resource",
      });
    } else if (request.status === 404) {
      issues.push({
        type: "not-found",
        title: "⚠ Resource not found",
        summary: "The requested resource could not be found.",
        message:
          `The server could not find ${request.path}.\n\n` +
          "Possible causes include:\n" +
          "• A misspelled URL or path parameter\n" +
          "• The resource being deleted or an ID/slug no longer existing\n" +
          "• An API version or route change\n" +
          "• The server intentionally returning 404 for a resource you're not permitted to see",
      });
    } else if (request.status === 429) {
      issues.push({
        type: "rate-limited",
        title: "✕ Rate limit exceeded",
        summary: "Too many requests were sent in a short window.",
        message:
          "The server rejected the request because too many requests were " +
          "sent in a short period of time.\n\n" +
          "Check:\n" +
          "• The Retry-After response header\n" +
          "• Client-side request throttling\n" +
          "• Concurrent requests hitting the same endpoint",
      });
    } else if (request.status >= 500) {
      issues.push({
        type: "server-error",
        title: "✕ Server failure",
        summary: `The server returned a ${request.status} error.`,
        message:
          `The server encountered an unexpected condition and returned a ` +
          `${request.status} ${request.statusText}. This is a server-side ` +
          "failure, not a problem with the request itself.\n\n" +
          "Check:\n" +
          "• Server logs for this request\n" +
          "• Upstream/dependency outages\n" +
          "• Recent deployments or configuration changes",
      });
    } else if (request.status >= 400 && request.status < 500) {
      issues.push({
        type: "client-error",
        title: "✕ Request rejected",
        summary: `The server returned ${request.status} ${request.statusText}.`,
        message:
          "The server rejected this request. Inspect the request URL, headers, " +
          "parameters, body, and response content for more information.",
      });
    }

    if (request.outcome === "redirect") {
      issues.push({
        type: "redirect",
        title: "ℹ Redirected",
        summary: request.redirectUrl
          ? `Redirected to ${request.redirectUrl}.`
          : "This request was redirected.",
        message:
          `This request was redirected${
            request.redirectUrl ? ` to ${request.redirectUrl}` : ""
          }. Redirects add an extra round trip and can hide the real ` +
          "destination of a request, which may be worth removing from a hot path.",
      });
    }

    if (request.cached) {
      issues.push({
        type: "cached-response",
        title: "ℹ Served from cache",
        summary: "Served from cache instead of the network.",
        message:
          "This response was served from the browser cache instead of the " +
          "network, so its timing and size don't reflect a live server response.",
      });
    }

    const waitPercent =
      request.duration > 0
        ? Math.round((request.timings.wait / request.duration) * 100)
        : 0;

    if (request.duration > SLOW_REQUEST_THRESHOLD_MS) {
      issues.push({
        type: "slow-request",
        title: "⚠ Slow request",
        summary: `${(request.duration / 1000).toFixed(2)}s total — ${waitPercent}% spent waiting for the response to begin.`,
        message:
          `This request took ${(request.duration / 1000).toFixed(2)} seconds to complete, ` +
          `which exceeds Blackbox's ${SLOW_REQUEST_THRESHOLD_MS}ms slow-request threshold. ` +
          `${waitPercent}% of that time passed before any response data was received.`,
      });
    }

    // Avoid restating the same fact twice when the overall request is already flagged as slow
    if (
      request.timings.wait > SLOW_SERVER_WAIT_THRESHOLD_MS &&
      request.duration <= SLOW_REQUEST_THRESHOLD_MS
    ) {
      issues.push({
        type: "slow-server-wait",
        title: "⚠ Slow response wait",
        summary: `${waitPercent}% of request time was spent waiting for the response to begin.`,
        message:
          `${(request.timings.wait / 1000).toFixed(2)} seconds passed between sending the ` +
          "request and receiving the first response data. This can include both server " +
          "processing time and network latency.",
      });
    }

    if (request.responseSize > LARGE_RESPONSE_THRESHOLD_BYTES) {
      issues.push({
        type: "large-response",
        title: "⚠ Large response payload",
        summary: `${(request.responseSize / 1024 / 1024).toFixed(2)} MB response.`,
        message:
          `The response is ${(request.responseSize / 1024 / 1024).toFixed(2)} MB, ` +
          "which is larger than typical for this type of request.\n\n" +
          "Check:\n" +
          "• Whether pagination is being used\n" +
          "• Unnecessary fields in the response\n" +
          "• Compression (gzip/br) on the server",
      });
    }

    if (issues.length === 0 && request.outcome === "unknown") {
      issues.push({
        type: "other",
        title: "ℹ Unrecognized outcome",
        summary: `Unrecognized status ${request.status}.`,
        message:
          `This request completed with status ${request.status}, which didn't ` +
          "match a known success, redirect, or error pattern. Review the raw " +
          "response for details.",
      });
    }

    return {
      severity: getSeverity(issues),
      issues,
    };
}

export function getIssueSeverity(issue: RequestIssue): "error" | "warning" | "info" {
  if (
    issue.type === "auth-error" ||
    issue.type === "rate-limited" ||
    issue.type === "server-error" ||
    issue.type === "client-error"
  ) {
    return "error";
  }

  if (
    issue.type === "not-found" ||
    issue.type === "slow-request" ||
    issue.type === "slow-server-wait" ||
    issue.type === "large-response"
  ) {
    return "warning";
  }

  return "info";
}

function getSeverity(issues: RequestIssue[]): RequestAnalysis["severity"] {
  if (issues.some((issue) => getIssueSeverity(issue) === "error")) {
    return "error";
  }

  if (issues.some((issue) => getIssueSeverity(issue) === "warning")) {
    return "warning";
  }

  if (issues.length > 0) {
    return "info";
  }

  return "none";
}