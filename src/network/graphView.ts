import { getDomainNodeId } from "./graphBuilder.js";
import type { GraphEdge, GraphNode, NetworkGraph } from "./types.js";

export interface GraphViewOptions {
  expandedDomainIds: ReadonlySet<string>;
  errorsOnly: boolean;
  maxDomains?: number;
  maxEndpointsPerDomain?: number;
}

export interface GraphViewResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  hiddenDomainCount: number;
  hiddenEndpointCount: number;
}

const DEFAULT_MAX_DOMAINS = 40;
const DEFAULT_MAX_ENDPOINTS_PER_DOMAIN = 25;

function sortByImportance(a: GraphNode, b: GraphNode): number {
  if (a.errorCount !== b.errorCount) {
    return b.errorCount - a.errorCount;
  }
  if (a.requestCount !== b.requestCount) {
    return b.requestCount - a.requestCount;
  }
  if (a.transferredBytes !== b.transferredBytes) {
    return b.transferredBytes - a.transferredBytes;
  }
  return a.label.localeCompare(b.label);
}

export function buildGraphView(
  graph: NetworkGraph,
  options: GraphViewOptions
): GraphViewResult {
  const maxDomains = Math.max(options.maxDomains ?? DEFAULT_MAX_DOMAINS, 1);
  const maxEndpointsPerDomain = Math.max(
    options.maxEndpointsPerDomain ?? DEFAULT_MAX_ENDPOINTS_PER_DOMAIN,
    1
  );

  const pageNode = graph.nodes.find((node) => node.type === "page");
  const domainCandidates = graph.nodes
    .filter((node) => node.type === "domain")
    .filter((node) => !options.errorsOnly || node.errorCount > 0)
    .sort(sortByImportance);

  const visibleDomains = domainCandidates.slice(0, maxDomains);
  const visibleDomainIds = new Set(visibleDomains.map((node) => node.id));
  const visibleEndpoints: GraphNode[] = [];
  let hiddenEndpointCount = 0;

  for (const domain of visibleDomains) {
    if (!options.expandedDomainIds.has(domain.id) || !domain.host) {
      continue;
    }

    const endpointCandidates = graph.nodes
      .filter(
        (node) =>
          node.type === "endpoint" &&
          node.host === domain.host &&
          (!options.errorsOnly || node.errorCount > 0)
      )
      .sort(sortByImportance);

    visibleEndpoints.push(...endpointCandidates.slice(0, maxEndpointsPerDomain));
    hiddenEndpointCount += Math.max(
      endpointCandidates.length - maxEndpointsPerDomain,
      0
    );
  }

  const nodes = [
    ...(pageNode ? [pageNode] : []),
    ...visibleDomains,
    ...visibleEndpoints,
  ];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );

  return {
    nodes,
    edges,
    hiddenDomainCount: Math.max(domainCandidates.length - visibleDomains.length, 0),
    hiddenEndpointCount,
  };
}
