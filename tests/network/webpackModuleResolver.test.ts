import { describe, expect, it } from "vitest";

import { resolveWebpackModuleSource } from "../../src/network/webpackModuleResolver.js";
import type { SourceResource } from "../../src/network/sourceMapResolver.js";
import { makeRequest } from "./helpers.js";

function resource(url: string, content: string): SourceResource {
  return {
    url,
    getContent: async () => content,
  };
}

describe("resolveWebpackModuleSource", () => {
  it("uses the enclosing webpack sourceURL to recover the authored file", async () => {
    const endpoint =
      "https://us-central1-nft-cloud-functions.cloudfunctions.net/explore";
    const bundleUrl = "http://localhost:3000/static/js/bundle.js";
    const bundle = `
      eval("const fetchExploreItems = async () => { const response = await fetch('${endpoint}'); return response.json(); };\\n//# sourceURL=webpack://student-project/./src/components/ExploreItems.jsx");
      eval("console.log('another module');\\n//# sourceURL=webpack://student-project/./src/App.jsx");
    `;

    const result = await resolveWebpackModuleSource(
      makeRequest({
        category: "Fetch",
        url: endpoint,
        path: "/explore",
      }),
      {
        source: "stack",
        label: "bundle.js:1411:32 · fetchExploreItems()",
        url: bundleUrl,
        lineNumber: 1411,
        columnNumber: 32,
        functionName: "fetchExploreItems",
      },
      [resource(bundleUrl, bundle)]
    );

    expect(result).toMatchObject({
      file: "src/components/ExploreItems.jsx",
      functionName: "fetchExploreItems",
      method: "source-content",
      confidence: "medium",
    });
  });

  it("prefers inline source-map content when the module includes it", async () => {
    const endpoint = "https://api.example.com/products";
    const authored = `
export const loadProducts = async () => {
  return fetch("${endpoint}");
};
`;
    const map = encodeURIComponent(
      JSON.stringify({
        version: 3,
        sources: ["webpack:///src/api/products.ts"],
        sourcesContent: [authored],
        mappings: "AAAA",
      })
    );
    const bundleUrl = "http://localhost:5173/assets/index.js";
    const bundle = `eval("fetch('${endpoint}');\\n//# sourceMappingURL=data:application/json,${map}\\n//# sourceURL=webpack:///src/api/products.ts");`;

    const result = await resolveWebpackModuleSource(
      makeRequest({ category: "Fetch", url: endpoint, path: "/products" }),
      {
        source: "stack",
        label: "index.js:10:4",
        url: bundleUrl,
        lineNumber: 10,
        columnNumber: 4,
      },
      [resource(bundleUrl, bundle)]
    );

    expect(result).toMatchObject({
      file: "src/api/products.ts",
      functionName: "loadProducts",
      method: "source-content",
      confidence: "high",
    });
    expect(result?.lineNumber).toBeGreaterThan(1);
  });

  it("does not claim a framework/runtime sourceURL as authored application code", async () => {
    const endpoint = "https://api.example.com/items";
    const bundleUrl = "http://localhost:3000/static/js/bundle.js";
    const bundle = `eval("fetch('${endpoint}');\\n//# sourceURL=webpack:///node_modules/framework/internal.js");`;

    const result = await resolveWebpackModuleSource(
      makeRequest({ category: "Fetch", url: endpoint, path: "/items" }),
      {
        source: "stack",
        label: "bundle.js:20:5",
        url: bundleUrl,
        lineNumber: 20,
        columnNumber: 5,
      },
      [resource(bundleUrl, bundle)]
    );

    expect(result).toBeNull();
  });
});
