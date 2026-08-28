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
      label: "api/users.ts:42",
      lineNumber: 42,
    });
  });

  it("uses the first useful JavaScript stack frame when the direct URL is missing", () => {
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
      label: "fetchUsers() · assets/app.js:142:18",
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

    expect(source?.label).toBe("loadDashboard() · dashboard/api.ts:8:4");
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
