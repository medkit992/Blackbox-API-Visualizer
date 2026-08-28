import type { SourceResource } from "../network/sourceMapResolver.js";

const contentCache = new Map<string, Promise<string | null>>();
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

export function getSourceResources(): Promise<SourceResource[]> {
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

export function resetSourceResources(): void {
  contentCache.clear();
  resourcesCache = null;
}
