import type {
  GraphEdge,
  GraphNode,
  NetworkGraph,
  NormalizedRequest,
} from "./types.js";

export const PAGE_NODE_ID = "page";

export function getDomainNodeId(host: string): string {
  return `domain:${host}`;
}

export function getEndpointNodeId(
  method: string,
  host: string,
  path: string
): string {
  return `endpoint:${method}|${host}|${path}`;
}

// Level 1 (page -> domain) is always included; level 2 (domain -> endpoint) nodes/edges
// are also returned so the UI can reveal them per-domain on expand without rebuilding the graph.
export function buildNetworkGraph(
  requests: NormalizedRequest[],
  pageUrl: string
): NetworkGraph {
  const pageNode = buildPageNode(requests, pageUrl);
  const domainLevel = buildDomainLevel(requests);
  const endpointLevel = buildEndpointLevel(requests);

  return {
    nodes: [pageNode, ...domainLevel.nodes, ...endpointLevel.nodes],
    edges: [...domainLevel.edges, ...endpointLevel.edges],
  };
}

function buildPageNode(
  requests: NormalizedRequest[],
  pageUrl: string
): GraphNode {
  return {
    id: PAGE_NODE_ID,
    type: "page",
    label: pageUrl || "Current Page",
    requestCount: requests.length,
    transferredBytes: sum(requests, (request) => request.responseSize),
    errorCount: requests.filter(isError).length,
    averageDuration: average(requests.map((request) => request.duration)),
    requestIds: requests.map((request) => request.id),
  };
}

function buildDomainLevel(requests: NormalizedRequest[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const requestsByHost = groupBy(requests, (request) => request.host);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const [host, group] of requestsByHost) {
    const nodeId = getDomainNodeId(host);
    const requestIds = group.map((request) => request.id);

    nodes.push({
      id: nodeId,
      type: "domain",
      label: host,
      requestCount: group.length,
      transferredBytes: sum(group, (request) => request.responseSize),
      errorCount: group.filter(isError).length,
      averageDuration: average(group.map((request) => request.duration)),
      host,
      requestIds,
    });

    edges.push({
      id: `edge:${PAGE_NODE_ID}->${nodeId}`,
      source: PAGE_NODE_ID,
      target: nodeId,
      requestCount: group.length,
      transferredBytes: sum(group, (request) => request.responseSize),
      errorCount: group.filter(isError).length,
      requestIds,
    });
  }

  return { nodes, edges };
}

function buildEndpointLevel(requests: NormalizedRequest[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const requestsByEndpoint = groupBy(
    requests,
    (request) => `${request.method}|${request.host}|${request.path}`
  );
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const group of requestsByEndpoint.values()) {
    const first = group[0];
    const domainNodeId = getDomainNodeId(first.host);
    const nodeId = getEndpointNodeId(first.method, first.host, first.path);
    const requestIds = group.map((request) => request.id);

    nodes.push({
      id: nodeId,
      type: "endpoint",
      label: `${first.method} ${first.path}`,
      requestCount: group.length,
      transferredBytes: sum(group, (request) => request.responseSize),
      errorCount: group.filter(isError).length,
      averageDuration: average(group.map((request) => request.duration)),
      host: first.host,
      method: first.method,
      path: first.path,
      requestIds,
    });

    edges.push({
      id: `edge:${domainNodeId}->${nodeId}`,
      source: domainNodeId,
      target: nodeId,
      requestCount: group.length,
      transferredBytes: sum(group, (request) => request.responseSize),
      errorCount: group.filter(isError).length,
      requestIds,
    });
  }

  return { nodes, edges };
}

function isError(request: NormalizedRequest): boolean {
  return request.outcome === "client-error" || request.outcome === "server-error";
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

function sum<T>(items: T[], valueFn: (item: T) => number): number {
  return items.reduce((total, item) => total + valueFn(item), 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}
