import { describe, expect, it } from "vitest";

import {
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

describe("deployed sibling source maps", () => {
  it("maps a production main hash back to the authored source when the sibling map is available", async () => {
    const generatedUrl = "https://student.example.com/static/js/main.82e7f31e.js";
    const mapUrl = `${generatedUrl}.map`;
    const sourceMap = JSON.stringify({
      version: 3,
      file: "main.82e7f31e.js",
      sources: ["webpack:///src/components/ExploreItems.jsx"],
      sourcesContent: [
        `export const fetchExploreItems = async () => fetch("https://api.example.com/explore");`,
      ],
      names: ["fetchExploreItems"],
      mappings: "AAAAA",
    });

    const result = await resolveAuthoredSource(
      makeRequest({
        category: "Fetch",
        url: "https://api.example.com/explore",
        path: "/explore",
      }),
      {
        source: "stack",
        label: "main.js:1:1",
        generatedLabel: "static/js/main.82e7f31e.js:1:1",
        url: generatedUrl,
        lineNumber: 1,
        columnNumber: 1,
      },
      [
        resource(
          generatedUrl,
          `console.log("generated");\n//# sourceMappingURL=main.82e7f31e.js.map`
        ),
        resource(mapUrl, sourceMap),
      ]
    );

    expect(result).toMatchObject({
      file: "src/components/ExploreItems.jsx",
      method: "source-map",
      confidence: "high",
    });
  });
});
