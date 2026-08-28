import type { SourceResource } from "../network/sourceMapResolver.js";
import type { NormalizedRequest } from "../network/types.js";

const contentCache = new Map<string, Promise<string | null>>();
const capturedContentCache = new Map<string, Promise<string | null>>();
const externalContentCache = new Map<string, Promise<string | null>>();
let resourcesCache: Promise<SourceResource[]> | null = null;

const MAX_EXTERNAL_SOURCE_MAP_CHARS = 5_000_000;

function contentFor(
  resource: chrome.devtools.inspectedWindow.Resource
): Promise<string | null> {
  const cached = contentCache.get(resource.url);
  if (cached) {
    return cached;
  }

  const load = new Promise<string | null>((resolve) => {
    try {
      resource.getContent((content) => {
        resolve(typeof content === "string" ? content : null);
      });
    } catch {
      resolve(null);
    }
  });

  contentCache.set(resource.url, load);
  return load;
}

function contentForCapturedRequest(
  request: NormalizedRequest
): Promise<string | null> {
  const cached = capturedContentCache.get(request.id);
  if (cached) {
    return cached;
  }

  if (request.responseBodyLoaded && request.responseBody !== undefined) {
    const loaded = Promise.resolve(request.responseBody);
    capturedContentCache.set(request.id, loaded);
    return loaded;
  }

  const load = new Promise<string | null>((resolve) => {
    try {
      request.raw.getContent((content) => {
        resolve(typeof content === "string" ? content : null);
      });
    } catch {
      resolve(null);
    }
  });

  capturedContentCache.set(request.id, load);
  return load;
}

function fetchSameOriginTextFromInspectedPage(url: string): Promise<string | null> {
  const cached = externalContentCache.get(url);
  if (cached) return cached;

  const load = new Promise<string | null>((resolve) => {
    const target = JSON.stringify(url);
    const expression = `(() => {
      try {
        const targetUrl = new URL(${target}, location.href);
        if (targetUrl.origin !== location.origin) return null;
        const xhr = new XMLHttpRequest();
        xhr.open("GET", targetUrl.href, false);
        xhr.send(null);
        if (xhr.status < 200 || xhr.status >= 300) return null;
        if (typeof xhr.responseText !== "string") return null;
        if (xhr.responseText.length > ${MAX_EXTERNAL_SOURCE_MAP_CHARS}) return null;
        return xhr.responseText;
      } catch {
        return null;
      }
    })()`;

    try {
      chrome.devtools.inspectedWindow.eval(
        expression,
        (result, exceptionInfo) => {
          if (exceptionInfo?.isException || typeof result !== "string") {
            resolve(null);
            return;
          }

          resolve(result);
        }
      );
    } catch {
      resolve(null);
    }
  });

  externalContentCache.set(url, load);
  return load;
}

function getDevtoolsResources(): Promise<SourceResource[]> {
  if (resourcesCache) {
    return resourcesCache;
  }

  resourcesCache = new Promise<SourceResource[]>((resolve) => {
    try {
      chrome.devtools.inspectedWindow.getResources((resources) => {
        resolve(
          resources.map((resource) => ({
            url: resource.url,
            getContent: () => contentFor(resource),
          }))
        );
      });
    } catch {
      resolve([]);
    }
  });

  return resourcesCache;
}

function sourceMapSibling(url: string): string | null {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    if (!/\.(?:m?js|cjs)$/i.test(parsed.pathname)) return null;
    parsed.pathname = `${parsed.pathname}.map`;
    return parsed.href;
  } catch {
    const clean = url.split("#", 1)[0]?.split("?", 1)[0] ?? url;
    return /\.(?:m?js|cjs)$/i.test(clean) ? `${clean}.map` : null;
  }
}

export async function getSourceResources(
  capturedRequests: readonly NormalizedRequest[] = []
): Promise<SourceResource[]> {
  const captured = capturedRequests
    .filter(
      (request) =>
        request.category === "Script" ||
        request.category === "Stylesheet" ||
        /\.map(?:$|[?#])/i.test(request.url)
    )
    .map<SourceResource>((request) => ({
      url: request.url,
      getContent: () => contentForCapturedRequest(request),
    }));

  // Production builds commonly deploy `file.js.map` beside `file.js` without
  // requesting the map during normal page execution. Add a lazy, same-origin
  // candidate so the existing source-map resolver can use it when needed.
  const mapCandidates = capturedRequests
    .filter((request) => request.category === "Script")
    .flatMap<SourceResource>((request) => {
      const mapUrl = sourceMapSibling(request.url);
      return mapUrl
        ? [
            {
              url: mapUrl,
              getContent: () => fetchSameOriginTextFromInspectedPage(mapUrl),
            },
          ]
        : [];
    });

  const devtools = await getDevtoolsResources();
  const combined = new Map<string, SourceResource>();

  for (const resource of [...captured, ...devtools, ...mapCandidates]) {
    if (!combined.has(resource.url)) {
      combined.set(resource.url, resource);
    }
  }

  return [...combined.values()];
}

export function resetSourceResources(): void {
  contentCache.clear();
  capturedContentCache.clear();
  externalContentCache.clear();
  resourcesCache = null;
}
