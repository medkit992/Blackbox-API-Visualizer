import { describe, it, expect } from "vitest";
import {
  buildLifecycleExample, buildRequestLifecycle, inspectLifecycleContent, MAX_LIFECYCLE_BODY_CHARS,
  type LifecycleRequest, type LifecycleStepId,
} from "../../src/network/requestLifecycle.js";

const request = (overrides: Partial<LifecycleRequest> = {}): LifecycleRequest => ({
  id: "request-1", category: "Fetch", method: "GET", status: 200, duration: 125,
  cached: false, responseBodyLoaded: true, responseBody: '{"results":[{"title":"Book"}]}',
  responseMimeType: "application/json", initiator: { type: "script" },
  raw: { timings: { send: 0, wait: 120, receive: 5 } }, ...overrides,
});
const step = (input: LifecycleRequest, id: LifecycleStepId) => buildRequestLifecycle(input).steps.find(item => item.id === id)!;

describe("evidence-backed request lifecycle", () => {
  it("uses a stable eight-checkpoint order", () => {
    expect(buildRequestLifecycle(request()).steps.map(item => item.id)).toEqual(["initiator", "request", "send", "wait", "response", "parse", "data", "usage"]);
  });
  it("does not turn HTTP success and local JSON into application success", () => {
    const model = buildRequestLifecycle(request());
    expect(model.headline).toBe("HTTP succeeded");
    expect(model.content.kind).toBe("valid-json");
    expect(model.summary).toMatch(/not observed/i);
    expect(model.steps.filter(item => item.phase === "application").every(item => item.status === "unknown")).toBeTruthy();
  });
  for (const status of [400, 401, 403, 404, 429, 500, 503]) {
    it(`preserves an HTTP ${status} error without claiming parsing stopped`, () => {
      const model = buildRequestLifecycle(request({ status }));
      expect(model.tone).toBe("error"); expect(model.steps[4].status).toBe("failed");
      expect(model.content.kind).toBe("valid-json");
      expect(model.steps.slice(5).every(item => item.status === "unknown")).toBeTruthy();
      expect(model.steps[4].next).toMatch(/does not by itself reject fetch/);
    });
  }
  for (const status of [0, -1, 600, NaN, Infinity]) {
    it(`keeps missing/invalid status ${String(status)} unknown rather than guessing CORS`, () => {
      const model = buildRequestLifecycle(request({ status }));
      expect(model.steps[4].status).toBe("unknown"); expect(model.tone).toBe("neutral");
      expect(model.steps[4].summary).toMatch(/cannot be established/);
      expect(!model.steps.some(item => item.status === "not-reached")).toBeTruthy();
    });
  }
  it("keeps the missing HTTP outcome primary even when a local body check fails", () => {
    const model = buildRequestLifecycle(request({ status: 0, responseBody: "{broken" }));
    expect(model.headline).toBe("No HTTP response"); expect(model.steps[4].status).toBe("unknown");
  });
  it("does not assume a redirect completed successfully", () => {
    const model = buildRequestLifecycle(request({ status: 302 }));
    expect(model.tone).toBe("neutral"); expect(model.headline).toBe("HTTP response captured");
    expect(model.steps[4].status).toBe("completed");
  });
  it("treats 304 as validation rather than an HTTP error", () => {
    const model = buildRequestLifecycle(request({ status: 304, cached: true, responseBody: "" }));
    expect(model.headline).toBe("Cache validated"); expect(model.steps[4].status).toBe("completed");
  });
  for (const [method, status] of [["HEAD", 200], ["GET", 204], ["GET", 205]] as const) {
    it(`does not mark the empty ${method}/${status} body as a parse failure`, () => {
      const model = buildRequestLifecycle(request({ method, status, responseBody: "" }));
      expect(model.content.kind).toBe("empty"); expect(model.steps[4].status).toBe("completed");
      expect(model.steps[5].status).toBe("unknown");
    });
  }
  it("flags malformed JSON at response inspection, not at an unobserved app parser", () => {
    const input = request({ responseBody: "{bad json", responseMimeType: "application/problem+json; charset=utf-8" });
    expect(step(input, "response").status).toBe("warning");
    expect(step(input, "parse").status).toBe("unknown");
    expect(buildRequestLifecycle(input).headline).toBe("Check response format");
  });
  it("does not overwrite an HTTP error with a malformed-content warning", () => {
    expect(step(request({ status: 500, responseBody: "{bad json" }), "response").status).toBe("failed");
  });
  it("distinguishes an observed zero duration from missing and negative timings", () => {
    expect(step(request(), "send").badge).toBe("0 ms");
    for (const value of [undefined, -1, NaN, Infinity]) {
      expect(step(request({ raw: { timings: { send: value } } }), "send").status).toBe("unknown");
    }
    expect(step(request({ raw: undefined }), "wait").status).toBe("unknown");
  });
  it("does not discard measured timings merely because cache metadata exists", () => {
    const input = request({ cached: true });
    expect(step(input, "wait").badge).toBe("120 ms");
    expect(step(input, "response").evidence.join(" ")).toMatch(/does not establish whether/i);
    expect(step(request({ cached: true, raw: { timings: { wait: -1 } } }), "wait").status).toBe("unknown");
  });
  it("does not claim an external server or specific app invocation was observed", () => {
    const input = request({ category: "Image", initiator: { type: "parser" } });
    expect(step(input, "initiator").summary).toMatch(/not an observed fetch/);
    expect(step(input, "request").summary).toMatch(/does not prove/);
    expect(step(input, "parse").status).toBe("unknown");
  });
  it("keeps an absent initiator unknown", () => expect(step(request({ initiator: undefined }), "initiator").status).toBe("unknown"));
  it("does not show invented or non-finite total durations", () => {
    for (const duration of [-1, NaN, Infinity]) expect(buildRequestLifecycle(request({ duration })).metric).toMatch(/duration unavailable/);
  });
  it("does not mutate a captured request", () => {
    const input = request(); const before = JSON.stringify(input);
    buildRequestLifecycle(input); expect(JSON.stringify(input)).toBe(before);
  });
});

describe("bounded local content checks", () => {
  for (const [body, shape] of [["null", "null"], ["false", "boolean"], ["12", "number"], ['"hi"', "string"], ["[]", "array"], ["{}", "object"]]) {
    it(`accepts JSON ${body} without conflating it with app parsing`, () => {
      const result = inspectLifecycleContent(request({ responseBody: body }));
      expect(result.kind).toBe("valid-json"); expect(result.summary).toMatch(new RegExp(shape));
      expect(result.summary).toMatch(/does not prove your app/);
    });
  }
  it("does not assume non-JSON content is an error", () => expect(inspectLifecycleContent(request({ responseBody: "<html>OK</html>", responseMimeType: "text/html" })).kind).toBe("not-json"));
  it("does not parse base64 content as JSON", () => expect(inspectLifecycleContent(request({ responseBodyEncoding: "base64" })).kind).toBe("encoded"));
  it("checks the size before parsing or trimming", () => expect(inspectLifecycleContent(request({ responseBody: " ".repeat(MAX_LIFECYCLE_BODY_CHARS + 1) })).kind).toBe("too-large"));
  it("does not load an unavailable response", () => {
    const input = request({ responseBodyLoaded: false });
    expect(inspectLifecycleContent(input).kind).toBe("unavailable");
    expect(input.responseBodyLoaded).toBe(false);
  });
  it("treats a loaded but absent body as unavailable, not invalid JSON", () => expect(inspectLifecycleContent(request({ responseBody: undefined })).kind).toBe("unavailable"));
  it("caches checks but invalidates when body, availability, MIME, or encoding changes", () => {
    const input = request({ responseBodyLoaded: false }); const first = inspectLifecycleContent(input);
    expect(inspectLifecycleContent(input)).toBe(first);
    input.responseBodyLoaded = true; expect(inspectLifecycleContent(input).kind).toBe("valid-json");
    input.responseBody = "broken"; expect(inspectLifecycleContent(input).kind).toBe("invalid-json");
    input.responseMimeType = "text/plain"; expect(inspectLifecycleContent(input).kind).toBe("not-json");
    input.responseBodyEncoding = "base64"; expect(inspectLifecycleContent(input).kind).toBe("encoded");
  });
  it("does not copy response values or parser exception text into summaries", () => {
    const secret = "secret-value-that-must-not-appear";
    for (const responseBody of [`{"token":"${secret}"}`, `{invalid:${secret}`]) {
      expect(!JSON.stringify(buildRequestLifecycle(request({ responseBody }))).includes(secret)).toBeTruthy();
    }
  });
});

describe("isolated lifecycle learning examples", () => {
  it("completes the successful example without changing captured semantics", () => {
    const model = buildLifecycleExample("success");
    expect(model.mode).toBe("example"); expect(model.steps.every(item => item.status === "completed")).toBeTruthy();
    expect(step(request(), "usage").status).toBe("unknown");
  });
  it("shows successful parsing after a 404", () => {
    const model = buildLifecycleExample("http-error");
    expect(model.steps[4].status).toBe("failed");
    expect(model.steps.slice(5).every(item => item.status === "completed")).toBeTruthy();
  });
  it("marks only the known later success path as not reached after a simulated parse failure", () => {
    const model = buildLifecycleExample("parse-error");
    expect(model.focus).toBe("parse"); expect(model.steps[5].status).toBe("failed");
    expect(model.steps.slice(6).every(item => item.status === "not-reached")).toBeTruthy();
  });
  it("cannot navigate a teaching example into real captured evidence", () => {
    for (const example of ["success", "http-error", "parse-error"] as const) {
      const model = buildLifecycleExample(example);
      expect(model.steps.every(item => !item.target)).toBeTruthy();
      expect(model.steps.every(item => item.evidence.every(fact => /simulated|example/i.test(fact)))).toBeTruthy();
    }
  });
});
