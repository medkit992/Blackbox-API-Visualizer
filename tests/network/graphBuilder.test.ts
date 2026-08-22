import { describe, expect, it } from "vitest";

import {
  buildNetworkGraph,
  getDomainNodeId,
  getEndpointNodeId,
  PAGE_NODE_ID,
} from "../../src/network/graphBuilder.js";

import { makeRequest } from "./helpers.js";

describe("buildNetworkGraph", () => {
  it("creates one page node", () => {
    const graph = buildNetworkGraph(
      [makeRequest()],
      "https://example.com/dashboard"
    );

    const page = graph.nodes.find(
      (node) => node.id === PAGE_NODE_ID
    );

    expect(page).toBeDefined();
    expect(page?.type).toBe("page");
    expect(page?.label).toBe(
      "https://example.com/dashboard"
    );
  });

  it("groups requests into domain nodes", () => {
    const requests = [
      makeRequest(),
      makeRequest(),

      makeRequest({
        url: "https://cdn.example.com/app.js",
        host: "cdn.example.com",
        path: "/app.js",
      }),
    ];

    const graph = buildNetworkGraph(
      requests,
      "https://example.com"
    );

    const domainNodes = graph.nodes.filter(
      (node) => node.type === "domain"
    );

    expect(domainNodes).toHaveLength(2);

    const apiNode = graph.nodes.find(
      (node) =>
        node.id === getDomainNodeId("api.example.com")
    );

    expect(apiNode?.requestCount).toBe(2);
  });

  it("creates endpoint nodes beneath domains", () => {
    const requests = [
      makeRequest({
        method: "GET",
        path: "/users",
      }),

      makeRequest({
        method: "GET",
        path: "/users",
      }),

      makeRequest({
        method: "POST",
        path: "/users",
      }),
    ];

    const graph = buildNetworkGraph(
      requests,
      "https://example.com"
    );

    const endpointNodes = graph.nodes.filter(
      (node) => node.type === "endpoint"
    );

    expect(endpointNodes).toHaveLength(2);

    const getEndpoint = graph.nodes.find(
      (node) =>
        node.id ===
        getEndpointNodeId(
          "GET",
          "api.example.com",
          "/users"
        )
    );

    expect(getEndpoint?.requestCount).toBe(2);
    expect(getEndpoint?.method).toBe("GET");
  });

  it("creates page-to-domain edges", () => {
    const graph = buildNetworkGraph(
      [makeRequest()],
      "https://example.com"
    );

    const domainId = getDomainNodeId(
      "api.example.com"
    );

    const edge = graph.edges.find(
      (edge) =>
        edge.source === PAGE_NODE_ID &&
        edge.target === domainId
    );

    expect(edge).toBeDefined();
    expect(edge?.requestCount).toBe(1);
  });

  it("creates domain-to-endpoint edges", () => {
    const graph = buildNetworkGraph(
      [makeRequest()],
      "https://example.com"
    );

    const domainId = getDomainNodeId(
      "api.example.com"
    );

    const endpointId = getEndpointNodeId(
      "GET",
      "api.example.com",
      "/users"
    );

    const edge = graph.edges.find(
      (edge) =>
        edge.source === domainId &&
        edge.target === endpointId
    );

    expect(edge).toBeDefined();
  });

  it("aggregates errors and transferred bytes", () => {
    const requests = [
      makeRequest({
        responseSize: 1000,
      }),

      makeRequest({
        responseSize: 2000,
        status: 500,
        statusText: "Internal Server Error",
        outcome: "server-error",
      }),
    ];

    const graph = buildNetworkGraph(
      requests,
      "https://example.com"
    );

    const domainNode = graph.nodes.find(
      (node) =>
        node.id === getDomainNodeId(
          "api.example.com"
        )
    );

    expect(domainNode?.requestCount).toBe(2);
    expect(domainNode?.transferredBytes).toBe(3000);
    expect(domainNode?.errorCount).toBe(1);
  });
});