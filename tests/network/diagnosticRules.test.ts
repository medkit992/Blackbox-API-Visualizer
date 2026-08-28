import { describe, expect, it } from "vitest";

import {
  DIAGNOSTIC_RULES,
  getDiagnosticRule,
} from "../../src/network/diagnosticRules.js";

describe("diagnostic rule catalog", () => {
  it("uses unique rule ids", () => {
    const ids = DIAGNOSTIC_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains a healthy success state and specific common HTTP failures", () => {
    expect(getDiagnosticRule("healthy-success")?.category).toBe("success");
    expect(getDiagnosticRule("http-401")?.category).toBe("authentication");
    expect(getDiagnosticRule("http-403")?.category).toBe("authorization");
    expect(getDiagnosticRule("http-404")?.category).toBe("routing");
    expect(getDiagnosticRule("http-429")?.category).toBe("rate-limit");
    expect(getDiagnosticRule("http-500")?.category).toBe("server");
  });

  it("keeps the catalog ordered from highest to lowest priority", () => {
    for (let index = 1; index < DIAGNOSTIC_RULES.length; index += 1) {
      expect(DIAGNOSTIC_RULES[index - 1].priority).toBeGreaterThanOrEqual(
        DIAGNOSTIC_RULES[index].priority
      );
    }
  });
});
