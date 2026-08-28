import { describe, expect, it } from "vitest";

import parseRequest, {
  normalizeRequest,
} from "../../src/network/parser.js";

function makeChromeRequest(): chrome.devtools.network.Request {
  return {
    startedDateTime: "2026-08-22T12:00:00.000Z",
    time: 250,

    request: {
      method: "POST",
      url: "https://api.example.com/users?page=2",
      httpVersion: "h2",

      headers: [
        {
          name: "Content-Type",
          value: "application/json",
        },
      ],

      queryString: [
        {
          name: "page",
          value: "2",
        },
      ],

      cookies: [],

      headersSize: 100,
      bodySize: 50,

      postData: {
        mimeType: "application/json",
        text: '{"name":"Andrew"}',
        params: [],
      },
    },

    response: {
      status: 200,
      statusText: "OK",
      httpVersion: "h2",

      headers: [
        {
          name: "Content-Type",
          value: "application/json",
        },
      ],

      cookies: [],

      redirectURL: "",

      headersSize: 200,
      bodySize: 1000,

      content: {
        size: 1000,
        mimeType: "application/json",
        text: '{"success":true}',
      },
    },

    cache: {
      beforeRequest: null,
      afterRequest: null,
    },

    timings: {
      blocked: 1,
      dns: 5,
      connect: 10,
      send: 2,
      wait: 200,
      receive: 32,
      ssl: 7,
    },

    serverIPAddress: "203.0.113.10",
    connection: "123",

    _resourceType: "fetch",

    _initiator: {
      type: "script",
      url: "https://example.com/app.js",
      lineNumber: 42,
      stack: {
        callFrames: [
          {
            functionName: "loadUsers",
            url: "https://example.com/app.js",
            lineNumber: 42,
            columnNumber: 7,
          },
        ],
      },
    },

    _priority: "High",
  } as unknown as chrome.devtools.network.Request;
}

describe("parseRequest", () => {
  it("converts a Chrome request into RequestData and preserves initiator context", () => {
    const parsed = parseRequest(makeChromeRequest());

    expect(parsed.request.method).toBe("POST");
    expect(parsed.request.url).toBe(
      "https://api.example.com/users?page=2"
    );

    expect(parsed.response.status).toBe(200);

    expect(parsed._resourceType).toBe("Fetch");
    expect(parsed._priority).toBe("High");

    expect(parsed._initiator).toEqual({
      type: "script",
      url: "https://example.com/app.js",
      lineNumber: 42,
      stack: {
        callFrames: [
          {
            functionName: "loadUsers",
            url: "https://example.com/app.js",
            lineNumber: 42,
            columnNumber: 7,
          },
        ],
      },
    });
  });

  it("preserves a response-content loader for later debugger context", () => {
    const parsed = parseRequest(makeChromeRequest());
    let loadedContent = "";

    parsed.getContent((content) => {
      loadedContent = content;
    });

    expect(loadedContent).toBe('{"success":true}');
  });
});

describe("normalizeRequest", () => {
  it("flattens request information", () => {
    const normalized = normalizeRequest(
      parseRequest(makeChromeRequest())
    );

    expect(normalized.method).toBe("POST");

    expect(normalized.host).toBe("api.example.com");
    expect(normalized.path).toBe("/users");
    expect(normalized.protocol).toBe("https");

    expect(normalized.category).toBe("Fetch");

    expect(normalized.status).toBe(200);
    expect(normalized.outcome).toBe("success");

    expect(normalized.requestSize).toBe(150);
    expect(normalized.responseSize).toBe(1200);

    expect(normalized.query).toEqual([
      {
        name: "page",
        value: "2",
      },
    ]);

    expect(normalized.responseBody).toBe('{"success":true}');
    expect(normalized.responseBodyLoaded).toBe(true);
  });

  it("falls back to content size when response body size is unknown", () => {
    const chromeRequest = makeChromeRequest();

    chromeRequest.response.headersSize = -1;
    chromeRequest.response.bodySize = -1;
    chromeRequest.response.content.size = 2048;

    const normalized = normalizeRequest(
      parseRequest(chromeRequest)
    );

    expect(normalized.responseSize).toBe(2048);
  });

  it("normalizes negative timing values to zero", () => {
    const chromeRequest = makeChromeRequest();

    chromeRequest.timings.blocked = -1;
    chromeRequest.timings.dns = -1;
    chromeRequest.timings.ssl = -1;

    const normalized = normalizeRequest(
      parseRequest(chromeRequest)
    );

    expect(normalized.timings.blocked).toBe(0);
    expect(normalized.timings.dns).toBe(0);
    expect(normalized.timings.ssl).toBe(0);
  });

  it("classifies HTTP error outcomes", () => {
    const chromeRequest = makeChromeRequest();

    chromeRequest.response.status = 404;
    chromeRequest.response.statusText = "Not Found";

    const normalized = normalizeRequest(
      parseRequest(chromeRequest)
    );

    expect(normalized.outcome).toBe("client-error");
  });
});
