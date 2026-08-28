import { describe, expect, it } from "vitest";

import { buildRequestSourceContext } from "../../src/network/requestSourceContext.js";
import type { SourceResource } from "../../src/network/sourceMapResolver.js";
import { makeRequest } from "./helpers.js";

function resource(url: string, content: string): SourceResource {
  return {
    url,
    getContent: async () => content,
  };
}

describe("buildRequestSourceContext", () => {
  it("traces a rendered resource through its API response back to authored request code", async () => {
    const endpoint =
      "https://us-central1-nft-cloud-functions.cloudfunctions.net/explore";
    const imageUrl = "https://cdn.example.com/nfts/dragon.png";

    const apiRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "Fetch",
      method: "GET",
      url: endpoint,
      path: "/explore",
      responseBodyLoaded: true,
      responseBody: JSON.stringify({
        items: [{ image: imageUrl }],
      }),
      initiator: {
        type: "script",
        stack: {
          callFrames: [
            {
              functionName: "fetch",
              url: "https://student.example.com/bundle.js",
              lineNumber: 120,
              columnNumber: 20,
            },
          ],
        },
      },
    });

    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      method: "GET",
      url: imageUrl,
      path: "/nfts/dragon.png",
      initiator: {
        type: "script",
        stack: {
          callFrames: [
            {
              functionName: "setValueForProperty",
              url: "https://student.example.com/bundle.js",
              lineNumber: 13502,
              columnNumber: 15,
            },
          ],
        },
      },
    });

    const resources: SourceResource[] = [
      resource("https://student.example.com/bundle.js", "console.log('bundle');"),
      resource(
        "webpack:///src/components/ExploreItems.jsx",
        `
export default function ExploreItems() {
  useEffect(() => {
    const fetchExploreItems = async () => {
      const response = await fetch("${endpoint}");
      return response.json();
    };
    fetchExploreItems();
  }, []);
}
`
      ),
    ];

    const context = await buildRequestSourceContext({
      request: imageRequest,
      timeline: [apiRequest, imageRequest],
      resources,
      loadResponseBody: async () => undefined,
    });

    expect(context.primarySource).toContain("src/components/ExploreItems.jsx");
    expect(context.primarySource).toContain("fetchExploreItems()");
    expect(context.authoredSource?.method).toBe("source-content");
    expect(context.relationship).toBe("GET /explore → data.items[0].image");
    expect(context.browserInitiator?.label).toContain("setValueForProperty()");
    expect(context.browserInitiator?.label).toContain("bundle.js:13503:16");
  });

  it("does not inspect unrelated API responses for an ordinary Fetch request", async () => {
    const request = makeRequest({
      category: "Fetch",
      url: "https://api.example.com/users",
      path: "/users",
    });
    let loadCount = 0;

    const context = await buildRequestSourceContext({
      request,
      timeline: [
        makeRequest({
          category: "Fetch",
          responseBodyLoaded: false,
        }),
        request,
      ],
      resources: [],
      loadResponseBody: async () => {
        loadCount += 1;
      },
    });

    expect(context.provenance).toBeNull();
    expect(loadCount).toBe(0);
  });
});
