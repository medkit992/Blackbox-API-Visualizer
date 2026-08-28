import { describe, expect, it } from "vitest";

import {
  formatAuthoredSource,
  resolveAuthoredSource,
  type SourceResource,
} from "../../src/network/sourceMapResolver.js";
import { makeRequest } from "./helpers.js";

function resource(url: string, content: string): SourceResource {
  return {
    url,
    getContent: async () => content,
  };
}

describe("resolveAuthoredSource", () => {
  it("uses source-map sourcesContent to find the authored file and surrounding function", async () => {
    const sourceContent = `
export default function ExploreItems() {
  useEffect(() => {
    const fetchExploreItems = async () => {
      const response = await fetch(
        "https://us-central1-nft-cloud-functions.cloudfunctions.net/explore"
      );
      return response.json();
    };

    fetchExploreItems();
  }, []);
}
`;

    const sourceMap = JSON.stringify({
      version: 3,
      file: "main.82e7f31e.js",
      sourceRoot: "",
      sources: ["webpack:///src/components/ExploreItems.jsx"],
      sourcesContent: [sourceContent],
      names: [],
      mappings: "AAAA",
    });

    const generatedUrl = "https://example.com/static/js/main.82e7f31e.js";
    const generatedContent = `console.log("bundle");\n//# sourceMappingURL=data:application/json,${encodeURIComponent(sourceMap)}`;

    const result = await resolveAuthoredSource(
      makeRequest({
        category: "Fetch",
        url: "https://us-central1-nft-cloud-functions.cloudfunctions.net/explore",
        path: "/explore",
      }),
      {
        label: "main.js:2:40",
        generatedLabel: "static/js/main.82e7f31e.js:2:40",
        source: "stack",
        url: generatedUrl,
        lineNumber: 2,
        columnNumber: 40,
      },
      [resource(generatedUrl, generatedContent)]
    );

    expect(result).toMatchObject({
      file: "src/components/ExploreItems.jsx",
      functionName: "fetchExploreItems",
      method: "source-content",
      confidence: "high",
    });
    expect(formatAuthoredSource(result!)).toContain("ExploreItems.jsx");
    expect(formatAuthoredSource(result!)).toContain("fetchExploreItems()");
  });

  it("uses a standard source-map position when source content cannot identify the endpoint", async () => {
    const sourceMap = JSON.stringify({
      version: 3,
      sources: ["webpack:///src/api/users.ts"],
      sourcesContent: ["export const value = 1;"],
      names: ["loadUsers"],
      mappings: "AAAAA",
    });

    const generatedUrl = "https://example.com/assets/app.abcd1234.js";
    const generatedContent = `fetch("/unknown");\n//# sourceMappingURL=data:application/json,${encodeURIComponent(sourceMap)}`;

    const result = await resolveAuthoredSource(
      makeRequest({ url: "https://api.example.com/not-present", path: "/not-present" }),
      {
        label: "app.js:1:1",
        generatedLabel: "assets/app.abcd1234.js:1:1",
        source: "stack",
        url: generatedUrl,
        lineNumber: 1,
        columnNumber: 1,
      },
      [resource(generatedUrl, generatedContent)]
    );

    expect(result).toMatchObject({
      file: "src/api/users.ts",
      lineNumber: 1,
      columnNumber: 1,
      functionName: "loadUsers",
      method: "source-map",
      confidence: "high",
    });
  });

  it("can correlate against authored DevTools resources even without a source-map file", async () => {
    const generatedUrl = "https://example.com/bundle.js";
    const authoredUrl = "webpack:///src/services/catalog.ts";

    const result = await resolveAuthoredSource(
      makeRequest({
        url: "https://api.example.com/catalog",
        path: "/catalog",
      }),
      {
        label: "bundle.js:400:10",
        source: "stack",
        url: generatedUrl,
        lineNumber: 400,
        columnNumber: 10,
      },
      [
        resource(generatedUrl, "console.log('generated');"),
        resource(
          authoredUrl,
          `export async function loadCatalog() {\n  return fetch("https://api.example.com/catalog");\n}`
        ),
      ]
    );

    expect(result).toMatchObject({
      file: "src/services/catalog.ts",
      functionName: "loadCatalog",
      method: "source-content",
    });
  });

  it("does not treat an embedded webpack eval-module source map as the map for the whole bundle", async () => {
    const wrongMap = encodeURIComponent(
      JSON.stringify({
        version: 3,
        sources: ["webpack:///node_modules/framework/internal.js"],
        sourcesContent: ["export function internal() {}"],
        names: ["internal"],
        mappings: "AAAAA",
      })
    );

    const generatedUrl = "https://example.com/bundle.js";
    const generatedContent = `eval("code\\n//# sourceMappingURL=data:application/json,${wrongMap}");`;

    const result = await resolveAuthoredSource(
      makeRequest({
        url: "https://api.example.com/explore",
        path: "/explore",
      }),
      {
        label: "bundle.js:10:5",
        source: "stack",
        url: generatedUrl,
        lineNumber: 10,
        columnNumber: 5,
      },
      [
        resource(generatedUrl, generatedContent),
        resource(
          "webpack:///src/ExploreItems.jsx",
          `const fetchExploreItems = async () => fetch("https://api.example.com/explore");`
        ),
      ]
    );

    expect(result).toMatchObject({
      file: "src/ExploreItems.jsx",
      functionName: "fetchExploreItems",
      method: "source-content",
    });
    expect(result?.url).not.toContain("node_modules");
  });

  it("resolves the matching module from a webpack eval-source-map bundle", async () => {
    const endpoint = "https://api.example.com/explore";
    const authoredSource = `
export const fetchExploreItems = async () => {
  const response = await fetch("${endpoint}");
  return response.json();
};
`;
    const moduleMap = encodeURIComponent(
      JSON.stringify({
        version: 3,
        sources: ["webpack:///src/components/ExploreItems.jsx"],
        sourcesContent: [authoredSource],
        names: ["fetchExploreItems"],
        mappings: "AAAAA",
      })
    );

    const generatedUrl = "https://student.example.com/bundle.js";
    const generatedContent = `eval("const fetchExploreItems=async()=>fetch('${endpoint}');\\n//# sourceMappingURL=data:application/json,${moduleMap}\\n//# sourceURL=webpack:///src/components/ExploreItems.jsx");`;

    const result = await resolveAuthoredSource(
      makeRequest({ url: endpoint, path: "/explore", category: "Fetch" }),
      {
        label: "bundle.js:20:12",
        source: "stack",
        url: generatedUrl,
        lineNumber: 20,
        columnNumber: 12,
      },
      [resource(generatedUrl, generatedContent)]
    );

    expect(result).toMatchObject({
      file: "src/components/ExploreItems.jsx",
      functionName: "fetchExploreItems",
      method: "source-content",
    });
  });

  it("returns no authored source when two files are equally plausible", async () => {
    const endpoint = "https://api.example.com/shared";
    const generatedUrl = "https://example.com/bundle.js";
    const sharedRequest = `export const load = async () => fetch("${endpoint}");`;

    const result = await resolveAuthoredSource(
      makeRequest({ url: endpoint, path: "/shared", category: "Fetch" }),
      {
        label: "bundle.js:20:10",
        source: "stack",
        url: generatedUrl,
        lineNumber: 20,
        columnNumber: 10,
      },
      [
        resource(generatedUrl, "console.log('bundle');"),
        resource("webpack:///src/first.ts", sharedRequest),
        resource("webpack:///src/second.ts", sharedRequest),
      ]
    );

    expect(result).toBeNull();
  });
});
