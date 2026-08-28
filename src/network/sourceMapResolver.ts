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

interface SourceContentMatch {
  score: number;
  sourceIndex: number;
  index: number;
  content: string;
}

interface ResourceContentMatch {
  score: number;
  resource: SourceResource;
  content: string;
  index: number;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/i;
const GENERATED_PATH_HINT = /(?:^|\/)(?:dist|build|assets|static|chunks?|bundles?)(?:\/|$)/i;
const GENERATED_FILE_HINT = /(?:^|[.-])(?:bundle|chunk|vendor|runtime|main)(?:[.-]|$)/i;
const HASH_SEGMENT = /(?:^|[.-])[a-f0-9]{7,}(?=\.|$)/i;
const IGNORED_SOURCE_HINT = /(?:node_modules|react-dom|webpack\/runtime|webpack\/bootstrap|vite\/dist|@vite\/client)/i;
const REQUEST_CALL_HINT = /(?:fetch|axios(?:\.[A-Za-z_$][\w$]*)?|XMLHttpRequest|\$http|request|ky(?:\.[A-Za-z_$][\w$]*)?|superagent(?:\.[A-Za-z_$][\w$]*)?)\s*(?:\.|\()/i;
const MAX_SOURCE_MATCHES_PER_NEEDLE = 20;
const AMBIGUOUS_SCORE_DISTANCE = 5;
const EVAL_MAP_SEARCH_DISTANCE = 24_000;

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;

  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    if (digit < 0) continue;

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
        if (values.length < 4) return result;

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
    // Nonstandard source-map protocols are handled by the replacements above.
  }

  const srcIndex = value.lastIndexOf("src/");
  if (srcIndex >= 0) return value.slice(srcIndex);

  const segments = value.split("/").filter(Boolean);
  return segments.length > 3 ? segments.slice(-3).join("/") : value || rawSource;
}

function resolveSourceUrl(source: string, mapUrl: string, sourceRoot = ""): string {
  const combined = sourceRoot
    ? `${sourceRoot.replace(/\/$/, "")}/${source.replace(/^\//, "")}`
    : source;

  if (/^(?:webpack|vite|ng|parcel):\/\//i.test(combined)) return combined;

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
  if (comma < 0) return null;

  const metadata = reference.slice(0, comma);
  const payload = reference.slice(comma + 1);

  try {
    return /;base64/i.test(metadata) ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function sourceMapReference(scriptContent: string): string | null {
  // Standalone only. Webpack eval-source-map embeds a map per module inside a
  // JS string; one of those must never be interpreted as the bundle-wide map.
  const matches = [
    ...scriptContent.matchAll(
      /^\s*\/\/[#@]\s*sourceMappingURL\s*=\s*(\S+)\s*$/gm
    ),
    ...scriptContent.matchAll(
      /^\s*\/\*[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)\s*\*\/\s*$/gm
    ),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));

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
  if (exact) return exact.getContent();

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

  // We only use this guessed sibling when it is already exposed as a resource.
  candidates.push(`${stripUrlDecorations(generatedUrl)}.map`);

  for (const mapUrl of [...new Set(candidates)]) {
    const content = await getResourceContent(resources, mapUrl);
    const map = content ? parseSourceMap(content) : null;
    if (map) return { map, mapUrl };
  }

  return null;
}

function generatedLocation(source: InitiatorSource): string | undefined {
  if (source.generatedLabel) return source.generatedLabel;
  if (!source.url) return undefined;

  const file = displaySourcePath(stripUrlDecorations(source.url));
  if (source.lineNumber === undefined) return file;

  return `${file}:${source.lineNumber}${
    source.columnNumber !== undefined ? `:${source.columnNumber}` : ""
  }`;
}

function lineAndColumn(
  content: string,
  index: number
): { lineNumber: number; columnNumber: number } {
  const before = content.slice(0, index);
  const lines = before.split("\n");
  return {
    lineNumber: lines.length,
    columnNumber: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function indexFromLineColumn(
  content: string,
  zeroBasedLine: number,
  zeroBasedColumn: number
): number | null {
  const lines = content.split("\n");
  if (zeroBasedLine < 0 || zeroBasedLine >= lines.length) return null;

  let index = 0;
  for (let line = 0; line < zeroBasedLine; line += 1) {
    index += (lines[line]?.length ?? 0) + 1;
  }

  return index + Math.min(zeroBasedColumn, lines[zeroBasedLine]?.length ?? 0);
}

const RESERVED_FUNCTION_NAMES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "fetch",
  "request",
  "then",
  "callback",
]);

function cleanFunctionName(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\(\)$/, "");
  if (!trimmed || trimmed === "<anonymous>" || trimmed === "anonymous") {
    return undefined;
  }

  const candidate = trimmed.split(".").filter(Boolean).at(-1) ?? trimmed;
  if (RESERVED_FUNCTION_NAMES.has(candidate)) return undefined;
  if (candidate.length <= 2) return undefined;
  if (/^[A-Za-z_$]\d+$/.test(candidate) && candidate.length <= 4) return undefined;
  return candidate;
}

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
      const name = cleanFunctionName(match[1]);
      if (name) candidates.push({ index: match.index ?? 0, name });
    }
  }

  candidates.sort((left, right) => right.index - left.index);
  return candidates[0]?.name;
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
    if (segment.generatedColumn > generatedColumn) break;
    if (segment.sourceIndex !== undefined) selected = segment;
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
  if (!rawSource) return null;

  const sourceContent = map.sourcesContent?.[selected.sourceIndex] ?? null;
  const originalIndex = sourceContent
    ? indexFromLineColumn(
        sourceContent,
        selected.originalLine,
        selected.originalColumn
      )
    : null;
  const inferredName =
    sourceContent && originalIndex !== null
      ? inferFunctionName(sourceContent, originalIndex)
      : undefined;
  const mappedName = cleanFunctionName(
    selected.nameIndex !== undefined ? map.names?.[selected.nameIndex] : undefined
  );
  const functionName = inferredName ?? mappedName;
  const generated = generatedLocation(source);

  return {
    file: displaySourcePath(rawSource),
    url: resolveSourceUrl(rawSource, mapUrl, map.sourceRoot),
    lineNumber: selected.originalLine + 1,
    columnNumber: selected.originalColumn + 1,
    ...(functionName ? { functionName } : {}),
    method: "source-map",
    confidence: "high",
    ...(generated ? { generatedLocation: generated } : {}),
  };
}

function requestNeedles(
  request: NormalizedRequest
): Array<{ value: string; score: number }> {
  const needles: Array<{ value: string; score: number }> = [];

  try {
    const parsed = new URL(request.url);
    needles.push({ value: request.url, score: 120 });
    needles.push({ value: `${parsed.origin}${parsed.pathname}`, score: 110 });
    if (parsed.pathname.length >= 4) needles.push({ value: parsed.pathname, score: 85 });
  } catch {
    needles.push({ value: request.url, score: 120 });
    if (request.path.length >= 4) needles.push({ value: request.path, score: 85 });
  }

  const unique = new Map<string, { value: string; score: number }>();
  for (const needle of needles) {
    if (needle.value.length < 4) continue;
    const existing = unique.get(needle.value);
    if (!existing || needle.score > existing.score) unique.set(needle.value, needle);
  }

  return [...unique.values()].sort((left, right) => right.score - left.score);
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

function occurrenceIndexes(
  content: string,
  needle: string,
  maximum = MAX_SOURCE_MATCHES_PER_NEEDLE
): number[] {
  const indexes: number[] = [];
  let searchFrom = 0;

  while (indexes.length < maximum) {
    const index = content.indexOf(needle, searchFrom);
    if (index < 0) break;
    indexes.push(index);
    searchFrom = index + Math.max(needle.length, 1);
  }

  return indexes;
}

function nearbyCallBonus(content: string, index: number, length: number): number {
  const nearby = content.slice(
    Math.max(0, index - 220),
    index + length + 120
  );
  return REQUEST_CALL_HINT.test(nearby) ? 30 : 0;
}

function chooseUnambiguousSourceMatch(
  matches: SourceContentMatch[]
): SourceContentMatch | null {
  if (matches.length === 0) return null;
  matches.sort((left, right) => right.score - left.score);

  const best = matches[0]!;
  const competing = matches.find(
    (match) =>
      match.sourceIndex !== best.sourceIndex &&
      match.score >= best.score - AMBIGUOUS_SCORE_DISTANCE
  );

  return competing ? null : best;
}

function findRequestInSourceMap(
  map: RawSourceMap,
  mapUrl: string,
  request: NormalizedRequest,
  source: InitiatorSource
): AuthoredSourceLocation | null {
  if (!map.sourcesContent?.length) return null;

  const matches: SourceContentMatch[] = [];
  const needles = requestNeedles(request);

  map.sourcesContent.forEach((content, sourceIndex) => {
    if (!content) return;
    const rawSource = map.sources[sourceIndex] ?? "";
    if (IGNORED_SOURCE_HINT.test(rawSource)) return;

    for (const needle of needles) {
      for (const index of occurrenceIndexes(content, needle.value)) {
        matches.push({
          score:
            needle.score +
            sourceCandidateScore(rawSource) +
            nearbyCallBonus(content, index, needle.value.length),
          sourceIndex,
          index,
          content,
        });
      }
    }
  });

  const best = chooseUnambiguousSourceMatch(matches);
  if (!best) return null;

  const rawSource = map.sources[best.sourceIndex] ?? "";
  const location = lineAndColumn(best.content, best.index);
  const functionName = inferFunctionName(best.content, best.index);
  const generated = generatedLocation(source);

  return {
    file: displaySourcePath(rawSource),
    url: resolveSourceUrl(rawSource, mapUrl, map.sourceRoot),
    ...location,
    ...(functionName ? { functionName } : {}),
    method: "source-content",
    confidence: best.score >= 135 ? "high" : "medium",
    ...(generated ? { generatedLocation: generated } : {}),
  };
}

function findEmbeddedEvalMap(
  generatedContent: string,
  generatedUrl: string,
  request: NormalizedRequest,
  source: InitiatorSource
): AuthoredSourceLocation | null {
  const needles = requestNeedles(request);
  const endpointMatches: Array<{ index: number; score: number }> = [];

  for (const needle of needles) {
    for (const index of occurrenceIndexes(generatedContent, needle.value, 10)) {
      endpointMatches.push({
        index,
        score: needle.score + nearbyCallBonus(generatedContent, index, needle.value.length),
      });
    }
  }

  endpointMatches.sort((left, right) => right.score - left.score);

  for (const endpoint of endpointMatches) {
    const after = generatedContent.slice(
      endpoint.index,
      endpoint.index + EVAL_MAP_SEARCH_DISTANCE
    );
    const mapMatch = after.match(
      /sourceMappingURL\s*=\s*(data:[^"'\\\s]+)/
    );

    if (mapMatch?.[1]) {
      const decoded = decodeDataSourceMap(mapMatch[1]);
      const map = decoded ? parseSourceMap(decoded) : null;
      if (map) {
        const contentMatch = findRequestInSourceMap(
          map,
          generatedUrl,
          request,
          source
        );
        if (contentMatch && !IGNORED_SOURCE_HINT.test(contentMatch.file)) {
          return contentMatch;
        }
      }
    }

    // Some dev bundles expose sourceURL even when the embedded map cannot be
    // decoded. Exact endpoint + the nearest following sourceURL still gives us a
    // conservative module-level correlation, but no invented original line.
    const sourceUrlMatch = after.match(/sourceURL\s*=\s*([^"'\\\s]+)/);
    const rawSourceUrl = sourceUrlMatch?.[1];
    if (rawSourceUrl && !IGNORED_SOURCE_HINT.test(rawSourceUrl)) {
      const functionName = inferFunctionName(generatedContent, endpoint.index);
      const generated = generatedLocation(source);
      return {
        file: displaySourcePath(rawSourceUrl),
        url: rawSourceUrl,
        ...(functionName ? { functionName } : {}),
        method: "source-content",
        confidence: "medium",
        ...(generated ? { generatedLocation: generated } : {}),
      };
    }
  }

  return null;
}

function chooseUnambiguousResourceMatch(
  matches: ResourceContentMatch[]
): ResourceContentMatch | null {
  if (matches.length === 0) return null;
  matches.sort((left, right) => right.score - left.score);

  const best = matches[0]!;
  const competing = matches.find(
    (match) =>
      match.resource.url !== best.resource.url &&
      match.score >= best.score - AMBIGUOUS_SCORE_DISTANCE
  );

  return competing ? null : best;
}

async function findRequestInAuthoredResources(
  request: NormalizedRequest,
  resources: readonly SourceResource[],
  source: InitiatorSource
): Promise<AuthoredSourceLocation | null> {
  const candidates = resources
    .filter((resource) => SOURCE_EXTENSIONS.test(stripUrlDecorations(resource.url)))
    .filter((resource) => !IGNORED_SOURCE_HINT.test(resource.url))
    .filter(
      (resource) =>
        !GENERATED_PATH_HINT.test(resource.url) && !HASH_SEGMENT.test(resource.url)
    )
    .slice(0, 60);

  const needles = requestNeedles(request);
  const matches: ResourceContentMatch[] = [];

  for (const resource of candidates) {
    const content = await resource.getContent();
    if (!content) continue;

    for (const needle of needles) {
      for (const index of occurrenceIndexes(content, needle.value)) {
        matches.push({
          score:
            needle.score +
            sourceCandidateScore(resource.url) +
            nearbyCallBonus(content, index, needle.value.length),
          resource,
          content,
          index,
        });
      }
    }
  }

  const best = chooseUnambiguousResourceMatch(matches);
  if (!best) return null;

  const location = lineAndColumn(best.content, best.index);
  const functionName = inferFunctionName(best.content, best.index);
  const generated = generatedLocation(source);

  return {
    file: displaySourcePath(best.resource.url),
    url: best.resource.url,
    ...location,
    ...(functionName ? { functionName } : {}),
    method: "source-content",
    confidence: best.score >= 135 ? "high" : "medium",
    ...(generated ? { generatedLocation: generated } : {}),
  };
}

function mergeMappedAndContentSource(
  mapped: AuthoredSourceLocation,
  content: AuthoredSourceLocation | null
): AuthoredSourceLocation {
  if (!content) return mapped;
  if (displaySourcePath(content.file) !== displaySourcePath(mapped.file)) return mapped;

  return {
    ...mapped,
    ...(content.functionName && !mapped.functionName
      ? { functionName: content.functionName }
      : {}),
  };
}

export async function resolveAuthoredSource(
  request: NormalizedRequest,
  generatedSource: InitiatorSource | null,
  resources: readonly SourceResource[]
): Promise<AuthoredSourceLocation | null> {
  if (!generatedSource?.url) return null;

  const generatedContent = await getResourceContent(resources, generatedSource.url);
  if (generatedContent) {
    const loadedMap = await loadSourceMap(
      generatedSource.url,
      generatedContent,
      resources
    );

    if (loadedMap) {
      const positionMatch = mapPosition(
        loadedMap.map,
        loadedMap.mapUrl,
        generatedSource
      );
      const contentMatch = findRequestInSourceMap(
        loadedMap.map,
        loadedMap.mapUrl,
        request,
        generatedSource
      );

      if (positionMatch && !IGNORED_SOURCE_HINT.test(positionMatch.file)) {
        return mergeMappedAndContentSource(positionMatch, contentMatch);
      }

      if (contentMatch && !IGNORED_SOURCE_HINT.test(contentMatch.file)) {
        return contentMatch;
      }
    }

    const evalMatch = findEmbeddedEvalMap(
      generatedContent,
      generatedSource.url,
      request,
      generatedSource
    );
    if (evalMatch) return evalMatch;
  }

  // DevTools may expose authored webpack/vite/etc. resources directly even when
  // the map itself is unavailable. Exact endpoint search is safer than guessing.
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
