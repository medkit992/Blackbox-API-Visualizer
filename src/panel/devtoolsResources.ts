import type { SourceResource } from "../network/sourceMapResolver.js";
import type { NormalizedRequest } from "../network/types.js";

const contentCache = new Map<string, Promise<string | null>>();
const capturedContentCache = new Map<string, Promise<string | null>>();
let resourcesCache: Promise<SourceResource[]> | null = null;

function contentFor(resource: chrome.devtools.inspectedWindow.Resource): Promise<string | null> {
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

function contentForCapturedRequest(request: NormalizedRequest): Promise<string | null> {
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

  const devtools = await getDevtoolsResources();
  const combined = new Map<string, SourceResource>();

  for (const resource of [...captured, ...devtools]) {
    if (!combined.has(resource.url)) {
      combined.set(resource.url, resource);
    }
  }

  return [...combined.values()];
}

export function resetSourceResources(): void {
  contentCache.clear();
  capturedContentCache.clear();
  resourcesCache = null;
}
