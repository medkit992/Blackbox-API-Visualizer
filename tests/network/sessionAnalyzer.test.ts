import { describe, expect, it } from "vitest";

import {
  analyzeSession,
  getSessionIssueSeverity,
} from "../../src/network/sessionAnalyzer.js";

import { makeRequest } from "./helpers.js";

describe("analyzeSession", () => {
  it("detects duplicate request bursts", () => {
    const requests = [
      makeRequest({
        startedAt: "2026-08-22T12:00:00.000Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:00.400Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:00.800Z",
      }),
    ];

    const analysis = analyzeSession(requests);

    const duplicateIssue = analysis.issues.find(
      (issue) => issue.type === "duplicate-requests"
    );

    expect(duplicateIssue).toBeDefined();
    expect(duplicateIssue?.requestIds).toHaveLength(3);
  });

  it("detects consistent polling", () => {
    const requests = [
      makeRequest({
        startedAt: "2026-08-22T12:00:00.000Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:05.000Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:10.000Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:15.000Z",
      }),
    ];

    const analysis = analyzeSession(requests);

    expect(
      analysis.issues.some(
        (issue) => issue.type === "polling"
      )
    ).toBe(true);

    expect(
      analysis.issues.some(
        (issue) => issue.type === "duplicate-requests"
      )
    ).toBe(false);
  });

  it("does not call two repeated requests polling", () => {
    const requests = [
      makeRequest({
        startedAt: "2026-08-22T12:00:00.000Z",
      }),

      makeRequest({
        startedAt: "2026-08-22T12:00:05.000Z",
      }),
    ];

    const analysis = analyzeSession(requests);

    expect(
      analysis.issues.some(
        (issue) => issue.type === "polling"
      )
    ).toBe(false);
  });

  it("detects error clusters on the same host", () => {
    const requests = [
      makeRequest({
        url: "https://api.example.com/users/1",
        path: "/users/1",
        status: 404,
        statusText: "Not Found",
        outcome: "client-error",
      }),

      makeRequest({
        url: "https://api.example.com/users/2",
        path: "/users/2",
        status: 404,
        statusText: "Not Found",
        outcome: "client-error",
      }),

      makeRequest({
        url: "https://api.example.com/users/3",
        path: "/users/3",
        status: 404,
        statusText: "Not Found",
        outcome: "client-error",
      }),

      // Same status but different host should not join the cluster
      makeRequest({
        url: "https://cdn.example.com/missing.png",
        host: "cdn.example.com",
        path: "/missing.png",
        status: 404,
        statusText: "Not Found",
        outcome: "client-error",
      }),
    ];

    const analysis = analyzeSession(requests);

    const errorCluster = analysis.issues.find(
      (issue) => issue.type === "error-cluster"
    );

    expect(errorCluster).toBeDefined();
    expect(errorCluster?.requestIds).toHaveLength(3);
  });

  it("groups endpoint frequency by method, host, and path", () => {
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

      makeRequest({
        method: "GET",
        url: "https://other.example.com/users",
        host: "other.example.com",
        path: "/users",
      }),
    ];

    const analysis = analyzeSession(requests);

    expect(analysis.stats.endpointFrequency).toHaveLength(3);

    const getUsers = analysis.stats.endpointFrequency.find(
      (endpoint) =>
        endpoint.method === "GET" &&
        endpoint.host === "api.example.com" &&
        endpoint.path === "/users"
    );

    expect(getUsers?.count).toBe(2);
    expect(getUsers?.percentage).toBe(50);
  });

  it("builds domain statistics", () => {
    const requests = [
      makeRequest({
        duration: 100,
        responseSize: 1000,
      }),

      makeRequest({
        duration: 300,
        responseSize: 2000,
      }),

      makeRequest({
        url: "https://cdn.example.com/app.js",
        host: "cdn.example.com",
        path: "/app.js",
        duration: 50,
        responseSize: 5000,
      }),
    ];

    const analysis = analyzeSession(requests);

    const apiDomain = analysis.stats.domainStats.find(
      (domain) => domain.host === "api.example.com"
    );

    expect(apiDomain).toMatchObject({
      requestCount: 2,
      transferredBytes: 3000,
      errorCount: 0,
      averageDuration: 200,
    });
  });
});

describe("getSessionIssueSeverity", () => {
  it("treats error clusters as errors", () => {
    expect(
      getSessionIssueSeverity({
        type: "error-cluster",
        title: "",
        summary: "",
        message: "",
        requestIds: [],
      })
    ).toBe("error");
  });

  it("treats duplicate requests as warnings", () => {
    expect(
      getSessionIssueSeverity({
        type: "duplicate-requests",
        title: "",
        summary: "",
        message: "",
        requestIds: [],
      })
    ).toBe("warning");
  });

  it("treats polling as informational", () => {
    expect(
      getSessionIssueSeverity({
        type: "polling",
        title: "",
        summary: "",
        message: "",
        requestIds: [],
      })
    ).toBe("info");
  });
});