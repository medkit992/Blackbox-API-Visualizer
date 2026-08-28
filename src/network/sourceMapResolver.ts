import type { NormalizedRequest } from "./types.js";
import type { InitiatorSource } from "./initiatorSource.js";

export interface SourceResource {
  url: string;
  getContent(): Promise<string | null>;
}

export interface AuthoredSourceLocation {
  file: string;
  url: string;
  lineNumber?: number;
  columnNumber?: number;
  functionName?: string;
  method: "source-map" | "source-content";
  confidence: "medium" | "high";
  generatedLocation?: string;
}

interface RawSourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: Array<string | null>;
  names?: string[];
  mappings: string;
}

interface MappingSegment {
  generatedColumn: number;
  sourceIndex?: number;
  originalLine?: number;
  originalColumn?: number;
  nameIndex?: number;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const GENERATED_PATH_HINT = /(?:^|\/)(?:dist|build|assets|static|chunks?|bundles?)(?:\/|$)/i;
const GENERATED_FILE_HINT = /(?:^|[.-])(?:bundle|chunk|vendor|runtime|main)(?:[.-]|$)/i;
const HASH_SEGMENT = /(?:^|[.-])[a-f0-9]{7,}(?=\.|$)/i;
const IGNORED_SOURCE_HINT = /(?:node_modules|react-dom|webpack\/runtime|webpack\/bootstrap|vite\/dist|@vite\/client)/i;

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;

  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    if (digit < 0) {
      continue;
    }

    const continuation = (digit & 32) !== 0;
    value += (digit & 31) << shift;

    if (continuation) {
      shift += 5;
      continue;
    }

    const negative = (value & 1) === 1;
    const decoded = value >> 1;
    values.push(negative ? -decoded : decoded);
    value = 0;
    shift = 0;
  }

  return values;
}

function decodeMappings(map: RawSourceMap): MappingSegment[][] {
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  return map.mappings.split(";").map((line) => {
    let generatedColumn = 0;

    return line
      .split(",")
      .filter(Boolean)
      .map((encoded): MappingSegment => {
        const values = decodeVlq(encoded);
        generatedColumn += values[0] ?? 0;

        const result: MappingSegment = { generatedColumn };
        if (values.length < 4) {
          return result;
        }

        sourceIndex += values[1] ?? 0;
        originalLine += values[2] ?? 0;
        originalColumn += values[3] ?? 0;

        result.sourceIndex = sourceIndex;
        result.originalLine = originalLine;
        result.originalColumn = originalColumn;

        if (values.length >= 5) {
          nameIndex += values[4] ?? 0;
          result.nameIndex = nameIndex;
        }

        return result;
      });
  });
}

function stripUrlDecorations(value: string): string {
  return value.split("#", 1)[0]?.split("?", 1)[0] ?? value;
}

function normalizedResourceUrl(value: string): string {
  try {
    return new URL(value).href.split("#", 1)[0] ?? value;
  } catch {
    return value;
  }
}

function displaySourcePath(rawSource: string): string {
  let value = rawSource
    .replace(/^webpack:\/\/\/?/i, "")
    .replace(/^vite:\/\/\/?/i, "")
    .replace(/^file:\/\/\/?/i, "")
    .replace(/^ng:\/\/\/?/i, "")
    .replace(/^parcel:\/\/\/?/i, "")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");

  try {
    const parsed = new URL(rawSource);
    value = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  } catch {
    // Source-map protocols such as webpack:// are intentionally handled above.
  }

  const srcIndex = value.lastIndexOf("src/");
  if (srcIndex >= 0) {
    return value.slice(srcIndex);
  }

  const segments = value.split("/").filter(Boolean);
  return segments.length > 3 ? segments.slice(-3).join("/") : value || rawSource;
}

function resolveSourceUrl(source: string, mapUrl: string, sourceRoot = ""): string {
  const combined = sourceRoot ? `${sourceRoot.replace(/\/$/, "")}/${source.replace(/^\//, "")}` : source;

  if (/^(?:webpack|vite|ng|parcel):\/\//i.test(combined)) {
    return combined;
  }

  try {
    return new URL(combined, mapUrl).href;
  } catch {
    return combined;
  }
}

function parseSourceMap(value: string): RawSourceMap | null {
  try {
    const parsed = JSON.parse(value) as Partial<RawSourceMap>;
    if (
      parsed.version !== 3 ||
      !Array.isArray(parsed.sources) ||
      typeof parsed.mappings !== "string"
    ) {
      return null;
    }

    return parsed as RawSourceMap;
  } catch {
    return null;
  }
}

function decodeDataSourceMap(reference: string): string | null {
  const comma = reference.indexOf(",");
  if (comma < 0) {
    return null;
  }

  const metadata = reference.slice(0, comma);
  const payload = reference.slice(comma + 1);

  try {
    return /;base64/i.test(metadata)
      ? atob(payload)
      : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function sourceMapReference(scriptContent: string): string | null {
  const matches = [
    ...scriptContent.matchAll(/(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=\s*([^\s*]+)(?:\s*\*\/)?/g),
  ];

  return matches.at(-1)?.[1]?.trim() ?? null;
}

async function getResourceContent(
  resources: readonly SourceResource[],
  targetUrl: string
): Promise<string | null> {
  const normalizedTarget = normalizedResourceUrl(targetUrl);
  const exact = resources.find(
    (resource) => normalizedResourceUrl(resource.url) === normalizedTarget
  );
  if (exact) {
    return exact.getContent();
  }

  const targetPath = stripUrlDecorations(targetUrl);
  const byPath = resources.find(
    (resource) => stripUrlDecorations(resource.url) === targetPath
  );
  return byPath ? byPath.getContent() : null;
}

async function loadSourceMap(
  generatedUrl: string,
  generatedContent: string,
  resources: readonly SourceResource[]
): Promise<{ map: RawSourceMap; mapUrl: string } | null> {
  const reference = sourceMapReference(generatedContent);

  if (reference?.startsWith("data:")) {
    const decoded = decodeDataSourceMap(reference);
    const map = decoded ? parseSourceMap(decoded) : null;
    return map ? { map, mapUrl: generatedUrl } : null;
  }

  const candidates: string[] = [];
  if (reference) {
    try {
      candidates.push(new URL(reference, generatedUrl).href);
    } catch {
      candidates.push(reference);
    }
  }

  const cleanGeneratedUrl = stripUrlDecorations(generatedUrl);
  candidates.push(`${cleanGeneratedUrl}.map`);

  for (const mapUrl of [...new Set(candidates)]) {
    const content = await getResourceContent(resources, mapUrl);
    const map = content ? parseSourceMap(content) : null;
    if (map) {
      return { map, mapUrl };
    }
  }

  return null;
}

function generatedLocation(source: InitiatorSource): string | undefined {
  if (!source.url) {
    return undefined;
  }

  const file = displaySourcePath(stripUrlDecorations(source.url));
  if (source.lineNumber === undefined) {
    return file;
  }

  return `${file}:${source.lineNumber}${source.columnNumber !== undefined ? `:${source.columnNumber}` : ""}`;
}

function mapPosition(
  map: RawSourceMap,
  mapUrl: string,
  source: InitiatorSource
): AuthoredSourceLocation | null {
  if (source.lineNumber === undefined || source.columnNumber === undefined) {
    return null;
  }

  const lines = decodeMappings(map);
  const segments = lines[source.lineNumber - 1] ?? [];
  const generatedColumn = Math.max(0, source.columnNumber - 1);

  let selected: MappingSegment | undefined;
  for (const segment of segments) {
    if (segment.generatedColumn > generatedColumn) {
      break;
    }
    if (segment.sourceIndex !== undefined) {
      selected = segment;
    }
  }

  if (
    !selected ||
    selected.sourceIndex === undefined ||
    selected.originalLine === undefined ||
    selected.originalColumn === undefined
  ) {
    return null;
  }

  const rawSource = map.sources[selected.sourceIndex];
  if (!rawSource) {
    return null;
  }

  const url = resolveSourceUrl(rawSource, mapUrl, map.sourceRoot);
  const functionName =
    selected.nameIndex !== undefined ? map.names?.[selected.nameIndex] : undefined;

  return {
    file: displaySourcePath(rawSource),
    url,
    lineNumber: selected.originalLine + 1,
    columnNumber: selected.originalColumn + 1,
    ...(functionName ? { functionName } : {}),
    method: "source-map",
    confidence: "high",
    generatedLocation: generatedLocation(source),
  };
}

function lineAndColumn(content: string, index: number): { lineNumber: number; columnNumber: number } {
  const before = content.slice(0, index);
  const lines = before.split("\n");
  return {
    lineNumber: lines.length,
    columnNumber: (lines.at(-1)?.length ?? 0) + 1,
  };
}

const RESERVED_FUNCTION_NAMES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "fetch",
  "request",
]);

function inferFunctionName(content: string, index: number): string | undefined {
  const start = Math.max(0, index - 3500);
  const prefix = content.slice(start, index);
  const candidates: Array<{ index: number; name: string }> = [];
  const patterns = [
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    /(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*\{/g,
  ];

  for (const pattern of patterns) {
    for (const match of prefix.matchAll(pattern)) {
      const name = match[1];
      if (name && !RESERVED_FUNCTION_NAMES.has(name)) {
        candidates.push({ index: match.index ?? 0, name });
      }
    }
  }

  candidates.sort((a, b) => b.index - a.index);
  return candidates[0]?.name;
}

function requestNeedles(request: NormalizedRequest): Array<{ value: string; score: number }> {
  const needles: Array<{ value: string; score: number }> = [];

  try {
    const parsed = new URL(request.url);
    needles.push({ value: request.url, score: 120 });
    needles.push({ value: `${parsed.origin}${parsed.pathname}`, score: 110 });
    if (parsed.pathname.length >= 4) {
      needles.push({ value: parsed.pathname, score: 85 });
    }
  } catch {
    needles.push({ value: request.url, score: 120 });
    if (request.path.length >= 4) {
      needles.push({ value: request.path, score: 85 });
    }
  }

  return [...new Map(needles.map((needle) => [needle.value, needle])).values()]
    .filter((needle) => needle.value.length >= 4)
    .sort((a, b) => b.score - a.score);
}

function sourceCandidateScore(source: string): number {
  let score = 0;
  if (SOURCE_EXTENSIONS.test(source)) score += 20;
  if (/\bsrc\//i.test(source)) score += 20;
  if (GENERATED_PATH_HINT.test(source) || GENERATED_FILE_HINT.test(source)) score -= 20;
  if (HASH_SEGMENT.test(source)) score -= 20;
  if (IGNORED_SOURCE_HINT.test(source)) score -= 100;
  return score;
}

function findRequestInSourceMap(
  map: RawSourceMap,
  mapUrl: string,
  request: NormalizedRequest,
  source: InitiatorSource
): AuthoredSourceLocation | null {
  if (!map.sourcesContent?.length) {
    return null;
  }

  let best:
    | {
        score: number;
        sourceIndex: number;
        index: number;
        content: string;
      }
    | undefined;

  const needles = requestNeedles(request);

  map.sourcesContent.forEach((content, sourceIndex) => {
    if (!content) return;
    const rawSource = map.sources[sourceIndex] ?? "";
    if (IGNORED_SOURCE_HINT.test(rawSource)) return;

    for (const needle of needles) {
      const index = content.indexOf(needle.value);
      if (index < 0) continue;

      const nearby = content.slice(Math.max(0, index - 180), index + needle.value.length + 80);
      const callBonus = /(?:fetch|axios|XMLHttpRequest|\$http|request)\s*(?:\.|\()/i.test(nearby)
        ? 25
        : 0;
      const score = needle.score + sourceCandidateScore(rawSource) + callBonus;

      if (!best || score > best.score) {
        best = { score, sourceIndex, index, content };
      }
    }
  });

  if (!best) {
    return null;
  }

  const rawSource = map.sources[best.sourceIndex] ?? "";
  const url = resolveSourceUrl(rawSource, mapUrl, map.sourceRoot);
  const location = lineAndColumn(best.content, best.index);
  const functionName = inferFunctionName(best.content, best.index);

  return {
    file: displaySourcePath(rawSource),
    url,
    ...location,
    ...(functionName ? { functionName } : {}),
    method: "source-content",
    confidence: best.score >= 130 ? "high" : "medium",
    generatedLocation: generatedLocation(source),
  };
}

async function findRequestInAuthoredResources(
  request: NormalizedRequest,
  resources: readonly SourceResource[],
  source: InitiatorSource
): Promise<AuthoredSourceLocation | null> {
  const candidates = resources
    .filter((resource) => SOURCE_EXTENSIONS.test(stripUrlDecorations(resource.url)))
    .filter((resource) => !IGNORED_SOURCE_HINT.test(resource.url))
    .filter((resource) => !GENERATED_PATH_HINT.test(resource.url) && !HASH_SEGMENT.test(resource.url))
    .slice(0, 60);

  const needles = requestNeedles(request);
  let best:
    | {
        score: number;
        resource: SourceResource;
        content: string;
        index: number;
      }
    | undefined;

  for (const resource of candidates) {
    const content = await resource.getContent();
    if (!content) continue;

    for (const needle of needles) {
      const index = content.indexOf(needle.value);
      if (index < 0) continue;

      const nearby = content.slice(Math.max(0, index - 180), index + needle.value.length + 80);
      const callBonus = /(?:fetch|axios|XMLHttpRequest|\$http|request)\s*(?:\.|\()/i.test(nearby)
        ? 25
        : 0;
      const score = needle.score + sourceCandidateScore(resource.url) + callBonus;

      if (!best || score > best.score) {
        best = { score, resource, content, index };
      }
    }
  }

  if (!best) {
    return null;
  }

  const location = lineAndColumn(best.content, best.index);
  const functionName = inferFunctionName(best.content, best.index);

  return {
    file: displaySourcePath(best.resource.url),
    url: best.resource.url,
    ...location,
    ...(functionName ? { functionName } : {}),
    method: "source-content",
    confidence: best.score >= 130 ? "high" : "medium",
    generatedLocation: generatedLocation(source),
  };
}

export async function resolveAuthoredSource(
  request: NormalizedRequest,
  generatedSource: InitiatorSource | null,
  resources: readonly SourceResource[]
): Promise<AuthoredSourceLocation | null> {
  if (!generatedSource?.url) {
    return null;
  }

  const generatedContent = await getResourceContent(resources, generatedSource.url);
  if (generatedContent) {
    const loadedMap = await loadSourceMap(
      generatedSource.url,
      generatedContent,
      resources
    );

    if (loadedMap) {
      const contentMatch = findRequestInSourceMap(
        loadedMap.map,
        loadedMap.mapUrl,
        request,
        generatedSource
      );
      if (contentMatch) {
        return contentMatch;
      }

      const positionMatch = mapPosition(
        loadedMap.map,
        loadedMap.mapUrl,
        generatedSource
      );
      if (positionMatch && !IGNORED_SOURCE_HINT.test(positionMatch.file)) {
        return positionMatch;
      }
    }
  }

  return findRequestInAuthoredResources(request, resources, generatedSource);
}

export function formatAuthoredSource(location: AuthoredSourceLocation): string {
  let value = location.file;
  if (location.lineNumber !== undefined) {
    value += `:${location.lineNumber}`;
    if (location.columnNumber !== undefined) {
      value += `:${location.columnNumber}`;
    }
  }

  return location.functionName ? `${value} · ${location.functionName}()` : value;
}
