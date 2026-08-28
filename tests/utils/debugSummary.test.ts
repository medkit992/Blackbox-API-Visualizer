import { describe, expect, it } from "vitest";

import type { RequestDiagnosis } from "../../src/network/diagnosticRules.js";
import { formatDebugSummary } from "../../src/utils/debugSummary.js";
import { makeRequest } from "../network/helpers.js";

describe("formatDebugSummary", () => {
  it("copies useful request context without raw bodies or sensitive query values", () => {
    const request = makeRequest({
      url: "https://api.example.com/users?token=super-secret&search=andrew",
      responseBodyLoaded: true,
      responseBody: '{"token":"do-not-copy","name":"Andrew"}',
      initiator: {
        type: "script",
        url: "https://example.com/app.js?apiKey=initiator-secret",
        lineNumber: 42,
      },
    });

    const summary = formatDebugSummary({
      request,
      analysis: {
        severity: "none",
        issues: [],
      },
    });

    expect(summary).toContain("Blackbox Debug Summary");
    expect(summary).toContain("No issues detected");
    expect(summary).toContain("Browser initiator:");
    expect(summary).toContain("body omitted from copied summary");
    expect(summary).not.toContain("super-secret");
    expect(summary).not.toContain("initiator-secret");
    expect(summary).not.toContain("do-not-copy");
  });

  it("keeps the friendly browser initiator and exact generated location for hashed builds", () => {
    const request = makeRequest({
      initiator: {
        type: "script",
        stack: {
          callFrames: [
            {
              functionName: "x0",
              url: "https://student.example.com/js/main.82e7f31e.js",
              lineNumber: 1,
              columnNumber: 183666,
            },
          ],
        },
      },
    });

    const summary = formatDebugSummary({
      request,
      analysis: {
        severity: "none",
        issues: [],
      },
    });

    expect(summary).toContain("Browser initiator: main.js:2:183667");
    expect(summary).toContain(
      "Generated browser location: js/main.82e7f31e.js:2:183667"
    );
  });

  it("formats a structured diagnosis without changing the clipboard path", () => {
    const request = makeRequest({ status: 404, statusText: "Not Found", outcome: "client-error" });
    const diagnosis: RequestDiagnosis = {
      ruleId: "http-404",
      title: "Resource not found",
      summary: "The server could not find the requested route or resource.",
      category: "routing",
      severity: "warning",
      confidence: "medium",
      evidence: [
        {
          key: "status",
          label: "HTTP status",
          value: "404 Not Found",
          strength: "strong",
        },
      ],
      likelyCauses: ["The route may be incorrect."],
      suggestions: ["Verify the request URL."],
    };

    const summary = formatDebugSummary({
      request,
      analysis: {
        severity: "warning",
        issues: [],
      },
      diagnosis,
    });

    expect(summary).toContain("Diagnosis");
    expect(summary).toContain("Category: routing");
    expect(summary).toContain("Confidence: medium");
    expect(summary).toContain("HTTP status: 404 Not Found");
    expect(summary).toContain("1. Verify the request URL.");
  });
});
