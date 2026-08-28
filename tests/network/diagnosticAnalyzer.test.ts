import { describe, expect, it } from "vitest";

import {
  diagnoseRequest,
  extractResponseMessage,
} from "../../src/network/diagnosticAnalyzer.js";
import { makeRequest } from "./helpers.js";

describe("diagnoseRequest", () => {
  it("returns a healthy success diagnosis when no issues are detected", () => {
    const diagnosis = diagnoseRequest(makeRequest({ status: 200, statusText: "OK" }));

    expect(diagnosis.ruleId).toBe("healthy-success");
    expect(diagnosis.category).toBe("success");
    expect(diagnosis.severity).toBe("success");
    expect(diagnosis.confidence).toBe("not-applicable");
    expect(diagnosis.likelyCauses).toEqual([]);
  });

  it("uses the specific HTTP rule before generic client-error rules", () => {
    const diagnosis = diagnoseRequest(
      makeRequest({ status: 404, statusText: "Not Found", outcome: "client-error" })
    );

    expect(diagnosis.ruleId).toBe("http-404");
    expect(diagnosis.category).toBe("routing");
    expect(diagnosis.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "status", value: "404 Not Found" }),
      ])
    );
  });

  it("records whether an Authorization header was actually present", () => {
    const diagnosis = diagnoseRequest(
      makeRequest({ status: 401, statusText: "Unauthorized", outcome: "client-error" })
    );

    expect(diagnosis.ruleId).toBe("http-401");
    expect(diagnosis.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "authorization-present",
          value: "Not present",
        }),
      ])
    );
    expect(diagnosis.confidence).toBe("high");
  });

  it("uses a loaded server error message as strong diagnostic evidence", () => {
    const request = makeRequest({
      status: 404,
      statusText: "Not Found",
      outcome: "client-error",
      responseBodyLoaded: true,
      responseBody: JSON.stringify({
        code: "USER_NOT_FOUND",
        message: "User 9271 does not exist",
      }),
    });

    const diagnosis = diagnoseRequest(request);

    expect(diagnosis.confidence).toBe("high");
    expect(diagnosis.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "response-body",
          value: "User 9271 does not exist",
        }),
      ])
    );
  });
});

describe("extractResponseMessage", () => {
  it("ignores response content until the body has actually been loaded", () => {
    const request = makeRequest({
      responseBodyLoaded: false,
      responseBody: JSON.stringify({ message: "should not be read yet" }),
    });

    expect(extractResponseMessage(request)).toBeNull();
  });

  it("extracts useful nested API error text", () => {
    const request = makeRequest({
      responseBodyLoaded: true,
      responseBody: JSON.stringify({
        error: {
          details: [{ message: "Email is required" }],
        },
      }),
    });

    expect(extractResponseMessage(request)).toBe("error: Email is required");
  });
});
