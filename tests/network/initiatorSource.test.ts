import { describe, expect, it } from "vitest";

import {
  formatInitiatorSource,
  getBestInitiatorSource,
} from "../../src/network/initiatorSource.js";

describe("getBestInitiatorSource", () => {
  it("uses a direct initiator URL before the stack when Chrome provides one", () => {
    const source = getBestInitiatorSource({
      type: "script",
      url: "https://example.com/src/api/users.ts?cache=1",
      lineNumber: 41,
      stack: {
        callFrames: [
          {
            functionName: "ignoredFrame",
            url: "https://example.com/assets/bundle.js",
            lineNumber: 10,
            columnNumber: 2,
          },
        ],
      },
    });

    expect(source).toMatchObject({
      source: "direct",
      label: "users.ts:42",
      lineNumber: 42,
    });
  });

  it("puts the readable file before the function name", () => {
    const source = getBestInitiatorSource({
      type: "script",
      stack: {
        callFrames: [
          {
            functionName: "fetchUsers",
            url: "https://example.com/assets/app.js",
            lineNumber: 141,
            columnNumber: 17,
          },
        ],
      },
    });

    expect(source).toMatchObject({
      source: "stack",
      label: "app.js:142:18 · fetchUsers()",
      functionName: "fetchUsers",
      lineNumber: 142,
      columnNumber: 18,
    });
  });

  it("walks parent stacks when the nearest stack has no usable URL", () => {
    const source = getBestInitiatorSource({
      type: "script",
      stack: {
        callFrames: [{ functionName: "fetch", url: "" }],
        parent: {
          callFrames: [
            {
              functionName: "loadDashboard",
              url: "webpack:///src/dashboard/api.ts",
              lineNumber: 7,
              columnNumber: 3,
            },
          ],
        },
      },
    });

    expect(source?.label).toBe("api.ts:8:4 · loadDashboard()");
  });

  it("normalizes a hashed student build filename and drops a useless minified function", () => {
    const source = getBestInitiatorSource({
      type: "script",
      stack: {
        callFrames: [
          {
            functionName: "x0",
            url: "https://student.example.com/js/main.82e7f31e.js",
            lineNumber: 1,
            columnNumber: 19039,
          },
        ],
      },
    });

    expect(source).toMatchObject({
      label: "main.js:2:19040",
      generatedLabel: "js/main.82e7f31e.js:2:19040",
      likelyBuiltAsset: true,
    });
  });

  it("reduces a minified function chain to the readable function and normalizes the build hash", () => {
    const source = getBestInitiatorSource({
      type: "script",
      stack: {
        callFrames: [
          {
            functionName: "o.cg.o.cg.fetch",
            url: "https://github.githubassets.com/assets/fetch-utilities-c744d246983ad6ac.js",
            lineNumber: 2,
            columnNumber: 5269,
          },
        ],
      },
    });

    expect(source).toMatchObject({
      label: "fetch-utilities.js:3:5270 · fetch()",
      functionName: "fetch",
      generatedLabel: "assets/fetch-utilities-c744d246983ad6ac.js:3:5270",
      likelyBuiltAsset: true,
    });
  });

  it("does not invent a TypeScript source file from generated JavaScript", () => {
    const source = getBestInitiatorSource({
      type: "script",
      stack: {
        callFrames: [
          {
            functionName: "loadData",
            url: "https://example.com/assets/main.A1b2C3d4.js",
            lineNumber: 4,
            columnNumber: 10,
          },
        ],
      },
    });

    expect(source?.label).toBe("main.js:5:11 · loadData()");
    expect(source?.label).not.toContain(".ts");
  });

  it("keeps the initiator type as the final fallback", () => {
    expect(
      formatInitiatorSource({
        type: "script",
        stack: { callFrames: [] },
      })
    ).toBe("script");
  });

  it("returns null when no initiator information exists", () => {
    expect(formatInitiatorSource(undefined)).toBeNull();
  });
});
