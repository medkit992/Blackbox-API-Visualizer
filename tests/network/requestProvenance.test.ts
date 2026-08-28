import { describe, expect, it } from "vitest";

import { findRequestProvenance } from "../../src/network/requestProvenance.js";
import { makeRequest } from "./helpers.js";

describe("findRequestProvenance", () => {
  it("traces a resource URL back to the exact API response value that supplied it", async () => {
    const apiRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "Fetch",
      method: "GET",
      url: "https://api.example.com/explore",
      path: "/explore",
      responseBodyLoaded: false,
      responseBody: undefined,
    });

    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      url: "https://cdn.example.com/nfts/dragon.png",
      path: "/nfts/dragon.png",
    });

    const provenance = await findRequestProvenance(
      imageRequest,
      [apiRequest, imageRequest],
      async (request) => {
        request.responseBodyLoaded = true;
        request.responseBody = JSON.stringify({
          items: [
            { id: 1, image: "https://cdn.example.com/nfts/other.png" },
            { id: 2, image: "https://cdn.example.com/nfts/dragon.png" },
          ],
        });
      }
    );

    expect(provenance?.request.id).toBe(apiRequest.id);
    expect(provenance?.valuePath).toBe("data.items[1].image");
    expect(provenance?.confidence).toBe("high");
  });

  it("resolves relative resource URLs against the API request origin", async () => {
    const apiRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "XHR",
      url: "https://example.com/api/products",
      path: "/api/products",
      responseBodyLoaded: true,
      responseBody: JSON.stringify({ image: "/media/product.png" }),
    });

    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      url: "https://example.com/media/product.png",
      path: "/media/product.png",
    });

    const provenance = await findRequestProvenance(
      imageRequest,
      [apiRequest, imageRequest],
      async () => undefined
    );

    expect(provenance?.valuePath).toBe("data.image");
  });

  it("uses the inspected document as the base for page-relative values returned by another API host", async () => {
    const documentRequest = makeRequest({
      startedAt: "2026-08-28T11:59:59.000Z",
      category: "Document",
      url: "https://student.example.com/explore",
      path: "/explore",
    });
    const apiRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "Fetch",
      url: "https://api.example.com/items",
      path: "/items",
      responseBodyLoaded: true,
      responseBody: JSON.stringify({ image: "/media/nft.png" }),
    });
    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      url: "https://student.example.com/media/nft.png",
      path: "/media/nft.png",
    });

    const provenance = await findRequestProvenance(
      imageRequest,
      [documentRequest, apiRequest, imageRequest],
      async () => undefined
    );

    expect(provenance?.request.id).toBe(apiRequest.id);
    expect(provenance?.valuePath).toBe("data.image");
  });

  it("does not load large or binary Fetch responses while looking for provenance", async () => {
    const binaryRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "Fetch",
      responseMimeType: "application/octet-stream",
      responseSize: 5000,
      responseBodyLoaded: false,
    });
    const largeRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.100Z",
      category: "XHR",
      responseMimeType: "application/json",
      responseSize: 3 * 1024 * 1024,
      responseBodyLoaded: false,
    });
    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      url: "https://cdn.example.com/target.png",
    });
    let loadCount = 0;

    const result = await findRequestProvenance(
      imageRequest,
      [binaryRequest, largeRequest, imageRequest],
      async () => {
        loadCount += 1;
      }
    );

    expect(result).toBeNull();
    expect(loadCount).toBe(0);
  });

  it("does not invent a relationship when the URL is absent", async () => {
    const apiRequest = makeRequest({
      startedAt: "2026-08-28T12:00:00.000Z",
      category: "Fetch",
      responseBodyLoaded: true,
      responseBody: JSON.stringify({ image: "https://cdn.example.com/other.png" }),
    });

    const imageRequest = makeRequest({
      startedAt: "2026-08-28T12:00:01.000Z",
      category: "Image",
      url: "https://cdn.example.com/target.png",
    });

    expect(
      await findRequestProvenance(
        imageRequest,
        [apiRequest, imageRequest],
        async () => undefined
      )
    ).toBeNull();
  });
});
