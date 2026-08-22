import { describe, expect, it } from "vitest";

import {
  analyzeRequest,
  getIssueSeverity,
} from "../../src/network/analyzer.js";

import { makeRequest } from "./helpers.js";

describe("analyzeRequest", () => {
  it("detects authentication failures", () => {
    const request = makeRequest({
      status: 401,
      statusText: "Unauthorized",
      outcome: "client-error",
    });

    const result = analyzeRequest(request);

    expect(result.severity).toBe("error");

    expect(
      result.issues.some(
        (issue) => issue.type === "auth-error"
      )
    ).toBe(true);
  });

  it("detects generic client errors", () => {
    const request = makeRequest({
      status: 422,
      statusText: "Unprocessable Content",
      outcome: "client-error",
    });

    const result = analyzeRequest(request);

    expect(
      result.issues.some(
        (issue) => issue.type === "client-error"
      )
    ).toBe(true);
  });

  it("detects server errors", () => {
    const request = makeRequest({
      status: 503,
      statusText: "Service Unavailable",
      outcome: "server-error",
    });

    const result = analyzeRequest(request);

    expect(result.severity).toBe("error");

    expect(
      result.issues.some(
        (issue) => issue.type === "server-error"
      )
    ).toBe(true);
  });

  it("detects a slow request", () => {
    const request = makeRequest({
      duration: 1500,

      timings: {
        blocked: 20,
        dns: 20,
        connect: 50,
        send: 10,
        wait: 1200,
        receive: 200,
        ssl: 0,
        total: 1500,
      },
    });

    const result = analyzeRequest(request);

    expect(
      result.issues.some(
        (issue) => issue.type === "slow-request"
      )
    ).toBe(true);

    // Should not duplicate the warning with slow-server-wait
    expect(
      result.issues.some(
        (issue) => issue.type === "slow-server-wait"
      )
    ).toBe(false);
  });

  it("detects a slow response wait independently", () => {
    const request = makeRequest({
      duration: 800,

      timings: {
        blocked: 20,
        dns: 20,
        connect: 20,
        send: 10,
        wait: 650,
        receive: 80,
        ssl: 0,
        total: 800,
      },
    });

    const result = analyzeRequest(request);

    expect(
      result.issues.some(
        (issue) => issue.type === "slow-server-wait"
      )
    ).toBe(true);
  });

  it("detects large responses", () => {
    const request = makeRequest({
      responseSize: 2 * 1024 * 1024,
    });

    const result = analyzeRequest(request);

    expect(
      result.issues.some(
        (issue) => issue.type === "large-response"
      )
    ).toBe(true);
  });

  it("detects redirects", () => {
    const request = makeRequest({
      status: 302,
      statusText: "Found",
      outcome: "redirect",
      redirectUrl: "https://example.com/login",
    });

    const result = analyzeRequest(request);

    expect(
      result.issues.some(
        (issue) => issue.type === "redirect"
      )
    ).toBe(true);
  });

  it("returns no issues for a normal request", () => {
    const request = makeRequest();

    const result = analyzeRequest(request);

    expect(result.severity).toBe("none");
    expect(result.issues).toHaveLength(0);
  });
});

describe("getIssueSeverity", () => {
  it("marks authentication errors as errors", () => {
    expect(
      getIssueSeverity({
        type: "auth-error",
        title: "",
        summary: "",
        message: "",
      })
    ).toBe("error");
  });

  it("marks slow requests as warnings", () => {
    expect(
      getIssueSeverity({
        type: "slow-request",
        title: "",
        summary: "",
        message: "",
      })
    ).toBe("warning");
  });

  it("marks cache information as info", () => {
    expect(
      getIssueSeverity({
        type: "cached-response",
        title: "",
        summary: "",
        message: "",
      })
    ).toBe("info");
  });
});