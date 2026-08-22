import type {
  DomainStats,
  EndpointFrequency,
  NormalizedRequest,
  SessionAnalysis,
  SessionIssue,
  SessionStats,
} from "./types.js";

// Requests firing this close together look like an accidental duplicate rather than polling
const DUPLICATE_BURST_WINDOW_MS = 2000;
// Need enough samples/timespan before calling a repeated interval "polling" instead of coincidence
const POLLING_MIN_REQUESTS = 4;
const POLLING_MIN_SPAN_MS = 5000;
const POLLING_MIN_INTERVAL_MS = 1000;
const POLLING_MAX_INTERVAL_MS = 120000;
// Relative standard deviation allowed before intervals stop looking "consistent"
const POLLING_INTERVAL_TOLERANCE = 0.25;
const REPEATED_ERROR_THRESHOLD = 3;

export function getSessionIssueSeverity(
  issue: SessionIssue
): "error" | "warning" | "info" {
  if (issue.type === "error-cluster") {
    return "error";
  }
  if (issue.type === "duplicate-requests") {
    return "warning";
  }
  return "info";
}

export function analyzeSession(requests: NormalizedRequest[]): SessionAnalysis {
  return {
    issues: [
      ...findDuplicateRequestIssues(requests),
      ...findErrorClusterIssues(requests),
    ],
    stats: buildSessionStats(requests),
  };
}

function getRequestSignature(request: NormalizedRequest): string {
  return [
    request.method,
    request.host,
    request.path,
    JSON.stringify(request.query),
    request.requestBody ?? "",
  ].join("|");
}

function groupBySignature(
  requests: NormalizedRequest[]
): Map<string, NormalizedRequest[]> {
  const groups = new Map<string, NormalizedRequest[]>();

  for (const request of requests) {
    const signature = getRequestSignature(request);
    const group = groups.get(signature);
    if (group) {
      group.push(request);
    } else {
      groups.set(signature, [request]);
    }
  }

  return groups;
}

function getSortedStartTimes(requests: NormalizedRequest[]): number[] {
  return requests
    .map((request) => new Date(request.startedAt).getTime())
    .sort((a, b) => a - b);
}

function getIntervals(sortedTimes: number[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < sortedTimes.length; i++) {
    intervals.push(sortedTimes[i] - sortedTimes[i - 1]);
  }
  return intervals;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function relativeStdDev(values: number[]): number {
  const mean = average(values);
  if (mean === 0) {
    return 0;
  }
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function findDuplicateRequestIssues(
  requests: NormalizedRequest[]
): SessionIssue[] {
  const issues: SessionIssue[] = [];

  for (const group of groupBySignature(requests).values()) {
    if (group.length < 2) {
      continue;
    }

    const sortedTimes = getSortedStartTimes(group);
    const intervals = getIntervals(sortedTimes);
    const averageInterval = average(intervals);
    const burstSpan = sortedTimes[sortedTimes.length - 1] - sortedTimes[0];
    const first = group[0];

    const looksLikePolling =
      group.length >= POLLING_MIN_REQUESTS &&
      burstSpan >= POLLING_MIN_SPAN_MS &&
      averageInterval >= POLLING_MIN_INTERVAL_MS &&
      averageInterval <= POLLING_MAX_INTERVAL_MS &&
      relativeStdDev(intervals) <= POLLING_INTERVAL_TOLERANCE;

    if (looksLikePolling) {
      issues.push({
        type: "polling",
        title: "ℹ Polling detected",
        summary: `${first.method} ${first.path} was requested ${group.length} times, roughly every ${(averageInterval / 1000).toFixed(1)}s.`,
        message:
          `${first.method} ${first.path}\n` +
          `Every ~${(averageInterval / 1000).toFixed(1)} seconds\n` +
          `${group.length} requests observed`,
        requestIds: group.map((request) => request.id),
      });
      continue;
    }

    const looksLikeBurstDuplicate = burstSpan <= DUPLICATE_BURST_WINDOW_MS;

    if (!looksLikeBurstDuplicate) {
      // Repeats spread far apart (e.g. hours) are treated as normal usage, not an issue
      continue;
    }

    const totalBytes = group.reduce(
      (total, request) => total + request.responseSize,
      0
    );
    const totalDuration = group.reduce(
      (total, request) => total + request.duration,
      0
    );

    issues.push({
      type: "duplicate-requests",
      title: "⚠ Repeated request",
      summary: `${first.method} ${first.path} was requested ${group.length} times within ${(burstSpan / 1000).toFixed(2)}s.`,
      message:
        `${first.method} ${first.path} was requested ${group.length} times.\n\n` +
        `Total transferred: ${(totalBytes / 1024).toFixed(1)} KB\n` +
        `Combined request time: ${(totalDuration / 1000).toFixed(2)}s`,
      requestIds: group.map((request) => request.id),
    });
  }

  return issues;
}

function findErrorClusterIssues(requests: NormalizedRequest[]): SessionIssue[] {
  const issues: SessionIssue[] = [];
  // Keyed by status+host so unrelated 404s on different domains aren't reported as one cluster
  const requestsByStatusAndHost = new Map<string, NormalizedRequest[]>();

  for (const request of requests) {
    if (request.outcome !== "client-error" && request.outcome !== "server-error") {
      continue;
    }

    const key = `${request.status}|${request.host}`;
    const group = requestsByStatusAndHost.get(key);
    if (group) {
      group.push(request);
    } else {
      requestsByStatusAndHost.set(key, [request]);
    }
  }

  for (const group of requestsByStatusAndHost.values()) {
    if (group.length < REPEATED_ERROR_THRESHOLD) {
      continue;
    }

    const status = group[0].status;
    const statusText = group[0].statusText;
    const host = group[0].host;
    const affectedEndpoints = Array.from(
      new Set(group.map((request) => request.path))
    );

    issues.push({
      type: "error-cluster",
      title: `✕ Repeated ${status} ${statusText}`,
      summary: `${group.length} requests to ${host} returned ${status} ${statusText}.`,
      message:
        `${group.length} requests to ${host} returned ${status} ${statusText}.\n\n` +
        "Affected endpoints:\n" +
        affectedEndpoints.map((path) => `• ${path}`).join("\n"),
      requestIds: group.map((request) => request.id),
    });
  }

  return issues;
}

function buildSessionStats(requests: NormalizedRequest[]): SessionStats {
  const totalRequests = requests.length;
  const totalTransferredBytes = requests.reduce(
    (total, request) => total + request.responseSize,
    0
  );

  return {
    totalRequests,
    totalTransferredBytes,
    averageDuration: average(requests.map((request) => request.duration)),
    endpointFrequency: buildEndpointFrequency(requests),
    domainStats: buildDomainStats(requests),
  };
}

function buildEndpointFrequency(
  requests: NormalizedRequest[]
): EndpointFrequency[] {
  const requestsByEndpoint = new Map<string, NormalizedRequest[]>();

  for (const request of requests) {
    const key = `${request.method}|${request.host}|${request.path}`;
    const group = requestsByEndpoint.get(key);
    if (group) {
      group.push(request);
    } else {
      requestsByEndpoint.set(key, [request]);
    }
  }

  const total = requests.length;

  return Array.from(requestsByEndpoint.values())
    .map((group) => ({
      method: group[0].method,
      host: group[0].host,
      path: group[0].path,
      count: group.length,
      percentage: total > 0 ? (group.length / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildDomainStats(requests: NormalizedRequest[]): DomainStats[] {
  const requestsByHost = new Map<string, NormalizedRequest[]>();

  for (const request of requests) {
    const group = requestsByHost.get(request.host);
    if (group) {
      group.push(request);
    } else {
      requestsByHost.set(request.host, [request]);
    }
  }

  return Array.from(requestsByHost.entries())
    .map(([host, group]) => ({
      host,
      requestCount: group.length,
      transferredBytes: group.reduce(
        (total, request) => total + request.responseSize,
        0
      ),
      errorCount: group.filter(
        (request) =>
          request.outcome === "client-error" || request.outcome === "server-error"
      ).length,
      averageDuration: average(group.map((request) => request.duration)),
    }))
    .sort((a, b) => b.requestCount - a.requestCount);
}
