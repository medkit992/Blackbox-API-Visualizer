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
