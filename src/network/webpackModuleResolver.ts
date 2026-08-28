import type { InitiatorSource } from "./initiatorSource.js";
import type {
  AuthoredSourceLocation,
  SourceResource,
} from "./sourceMapResolver.js";
import type { NormalizedRequest } from "./types.js";

interface InlineSourceMap {
  version?: unknown;
  sourceRoot?: unknown;
  sources?: unknown;
  sourcesContent?: unknown;
}

interface ModuleCandidate {
  score: number;
  location: AuthoredSourceLocation;
}

const IGNORED_SOURCE_HINT =
  /(?:node_modules|react-dom|webpack\/runtime|webpack\/bootstrap|vite\/dist|@vite\/client)/i;
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)(?:[?#].*)?$/i;
const MAX_ENDPOINT_OCCURRENCES = 16;
const MAX_MODULE_DISTANCE = 180_000;
const AMBIGUOUS_SCORE_DISTANCE = 5;

function stripUrlDecorations(value: string): string {
  return value.split("#", 1)[0]?.split("?", 1)[0] ?? value;
}

function normalizedResourceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

function displaySourcePath(rawSource: string): string {
  let value = rawSource
    .replace(/^webpack:\/\/\/?/i, "")
    .replace(/^webpack-internal:\/\/\/?/i, "")
    .replace(/^vite:\/\/\/?/i, "")
    .replace(/^ng:\/\/\/?/i, "")
    .replace(/^parcel:\/\/\/?/i, "")
    .replace(/^file:\/\/\/?/i, "")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");

  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the original source label when it is not URI encoded.
  }

  value = value.replace(/[?#].*$/, "");

  const srcIndex = value.lastIndexOf("src/");
  if (srcIndex >= 0) {
    return value.slice(srcIndex);
  }

  const segments = value.split("/").filter(Boolean);
  return segments.length > 4 ? segments.slice(-4).join("/") : value || rawSource;
}

function generatedLocation(source: InitiatorSource): string | undefined {
  if (source.generatedLabel) return source.generatedLabel;
  if (!source.url) return undefined;

  let file = stripUrlDecorations(source.url);
  try {
    const parsed = new URL(file);
    file = parsed.pathname.split("/").filter(Boolean).slice(-2).join("/") || parsed.hostname;
  } catch {
    file = file.split("/").filter(Boolean).slice(-2).join("/") || file;
  }

  if (source.lineNumber === undefined) return file;
  return `${file}:${source.lineNumber}${
    source.columnNumber !== undefined ? `:${source.columnNumber}` : ""
  }`;
}

function cleanFunctionName(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\(\)$/, "");
  if (!trimmed || trimmed === "<anonymous>" || trimmed === "anonymous") {
    return undefined;
  }

  const candidate = trimmed.split(".").filter(Boolean).at(-1) ?? trimmed;
  if (candidate.length <= 2) return undefined;
  if (/^[A-Za-z_$]\d+$/.test(candidate) && candidate.length <= 4) return undefined;
  if (["fetch", "request", "then", "callback"].includes(candidate)) return undefined;
  return candidate;
}

function inferFunctionName(content: string, index: number): string | undefined {
  const prefix = content.slice(Math.max(0, index - 5000), index);
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

function lineAndColumn(content: string, index: number): {
  lineNumber: number;
  columnNumber: number;
} {
  const prefix = content.slice(0, index);
  const lines = prefix.split("\n");
  return {
    lineNumber: lines.length,
    columnNumber: (lines.at(-1)?.length ?? 0) + 1,
  };
}

function requestNeedles(request: NormalizedRequest): Array<{
  value: string;
  score: number;
}> {
  const needles: Array<{ value: string; score: number }> = [];

  try {
    const parsed = new URL(request.url);
    needles.push({ value: request.url, score: 130 });
    needles.push({ value: `${parsed.origin}${parsed.pathname}`, score: 120 });
    if (parsed.pathname.length >= 4) needles.push({ value: parsed.pathname, score: 90 });
  } catch {
    needles.push({ value: request.url, score: 130 });
    if (request.path.length >= 4) needles.push({ value: request.path, score: 90 });
  }

  const unique = new Map<string, { value: string; score: number }>();
  for (const needle of needles) {
    if (needle.value.length < 4) continue;
    const existing = unique.get(needle.value);
    if (!existing || needle.score > existing.score) unique.set(needle.value, needle);
  }

  return [...unique.values()].sort((left, right) => right.score - left.score);
}

function occurrenceIndexes(content: string, needle: string): number[] {
  const indexes: number[] = [];
  let from = 0;

  while (indexes.length < MAX_ENDPOINT_OCCURRENCES) {
    const index = content.indexOf(needle, from);
    if (index < 0) break;
    indexes.push(index);
    from = index + Math.max(needle.length, 1);
  }

  return indexes;
}

async function generatedContent(
  source: InitiatorSource,
  resources: readonly SourceResource[]
): Promise<string | null> {
  if (!source.url) return null;
  const target = normalizedResourceUrl(source.url);
  const resource = resources.find(
    (candidate) => normalizedResourceUrl(candidate.url) === target
  );
  return resource ? resource.getContent() : null;
}

function moduleWindow(content: string, endpointIndex: number): {
  start: number;
  end: number;
  content: string;
} {
  const previousEval = content.lastIndexOf("eval(", endpointIndex);
  const nextEval = content.indexOf("eval(", endpointIndex + 1);

  const start =
    previousEval >= 0 && endpointIndex - previousEval <= MAX_MODULE_DISTANCE
      ? previousEval
      : Math.max(0, endpointIndex - MAX_MODULE_DISTANCE);
  const end =
    nextEval > endpointIndex && nextEval - endpointIndex <= MAX_MODULE_DISTANCE
      ? nextEval
      : Math.min(content.length, endpointIndex + MAX_MODULE_DISTANCE);

  return {
    start,
    end,
    content: content.slice(start, end),
  };
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

function parseInlineMap(reference: string): InlineSourceMap | null {
  const decoded = decodeDataSourceMap(reference);
  if (!decoded) return null;

  try {
    const parsed = JSON.parse(decoded) as InlineSourceMap;
    return parsed.version === 3 && Array.isArray(parsed.sources) ? parsed : null;
  } catch {
    return null;
  }
}

function sourceFromInlineMap(
  map: InlineSourceMap,
  request: NormalizedRequest,
  generatedSource: InitiatorSource
): AuthoredSourceLocation | null {
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) return null;

  const sources = map.sources.filter((source): source is string => typeof source === "string");
  const contents = map.sourcesContent as unknown[];
  const needles = requestNeedles(request);
  const matches: Array<{
    score: number;
    source: string;
    content: string;
    index: number;
  }> = [];

  sources.forEach((source, sourceIndex) => {
    if (IGNORED_SOURCE_HINT.test(source)) return;
    const sourceContent = contents[sourceIndex];
    if (typeof sourceContent !== "string") return;

    for (const needle of needles) {
      for (const index of occurrenceIndexes(sourceContent, needle.value)) {
        matches.push({
          score:
            needle.score +
            (source.includes("src/") ? 30 : 0) +
            (SOURCE_EXTENSIONS.test(source) ? 20 : 0),
          source,
          content: sourceContent,
          index,
        });
      }
    }
  });

  if (matches.length === 0) return null;
  matches.sort((left, right) => right.score - left.score);
  const best = matches[0]!;
  const competing = matches.find(
    (match) =>
      displaySourcePath(match.source) !== displaySourcePath(best.source) &&
      match.score >= best.score - AMBIGUOUS_SCORE_DISTANCE
  );
  if (competing) return null;

  const location = lineAndColumn(best.content, best.index);
  const functionName =
    inferFunctionName(best.content, best.index) ?? cleanFunctionName(generatedSource.functionName);
  const generated = generatedLocation(generatedSource);

  return {
    file: displaySourcePath(best.source),
    url: best.source,
    ...location,
    ...(functionName ? { functionName } : {}),
    method: "source-content",
    confidence: "high",
    ...(generated ? { generatedLocation: generated } : {}),
  };
}

function nearestMetadata(
  window: { start: number; content: string },
  endpointIndex: number
): { sourceUrl?: string; inlineMap?: InlineSourceMap } {
  const localEndpoint = endpointIndex - window.start;
  const sourceUrls: Array<{ distance: number; value: string }> = [];
  const maps: Array<{ distance: number; value: InlineSourceMap }> = [];

  for (const match of window.content.matchAll(/sourceURL\s*=\s*([^"'\\\s]+)/g)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    sourceUrls.push({
      distance: Math.abs((match.index ?? 0) - localEndpoint),
      value: raw,
    });
  }

  for (const match of window.content.matchAll(
    /sourceMappingURL\s*=\s*(data:[^"'\\\s]+)/g
  )) {
    const raw = match[1];
    if (!raw) continue;
    const parsed = parseInlineMap(raw);
    if (!parsed) continue;
    maps.push({
      distance: Math.abs((match.index ?? 0) - localEndpoint),
      value: parsed,
    });
  }

  sourceUrls.sort((left, right) => left.distance - right.distance);
  maps.sort((left, right) => left.distance - right.distance);

  return {
    ...(sourceUrls[0] ? { sourceUrl: sourceUrls[0].value } : {}),
    ...(maps[0] ? { inlineMap: maps[0].value } : {}),
  };
}

function moduleCandidate(
  fullContent: string,
  endpointIndex: number,
  needleScore: number,
  request: NormalizedRequest,
  generatedSource: InitiatorSource
): ModuleCandidate | null {
  const window = moduleWindow(fullContent, endpointIndex);
  const metadata = nearestMetadata(window, endpointIndex);

  if (metadata.inlineMap) {
    const mapped = sourceFromInlineMap(metadata.inlineMap, request, generatedSource);
    if (mapped) {
      return {
        score: needleScore + 80,
        location: mapped,
      };
    }
  }

  const rawSourceUrl = metadata.sourceUrl;
  if (!rawSourceUrl || IGNORED_SOURCE_HINT.test(rawSourceUrl)) return null;

  const file = displaySourcePath(rawSourceUrl);
  if (!SOURCE_EXTENSIONS.test(file)) return null;

  const functionName =
    cleanFunctionName(generatedSource.functionName) ??
    inferFunctionName(fullContent, endpointIndex);
  const generated = generatedLocation(generatedSource);

  return {
    score: needleScore + (file.includes("src/") ? 50 : 20),
    location: {
      file,
      url: rawSourceUrl,
      ...(functionName ? { functionName } : {}),
      method: "source-content",
      confidence: "medium",
      ...(generated ? { generatedLocation: generated } : {}),
    },
  };
}

export async function resolveWebpackModuleSource(
  request: NormalizedRequest,
  generatedSource: InitiatorSource | null,
  resources: readonly SourceResource[]
): Promise<AuthoredSourceLocation | null> {
  if (!generatedSource?.url || !/\.m?js(?:[?#].*)?$/i.test(generatedSource.url)) {
    return null;
  }

  const content = await generatedContent(generatedSource, resources);
  if (!content || (!content.includes("sourceURL=") && !content.includes("sourceMappingURL="))) {
    return null;
  }

  const candidates: ModuleCandidate[] = [];

  for (const needle of requestNeedles(request)) {
    for (const index of occurrenceIndexes(content, needle.value)) {
      const candidate = moduleCandidate(
        content,
        index,
        needle.score,
        request,
        generatedSource
      );
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0]!;
  const competing = candidates.find(
    (candidate) =>
      candidate.location.file !== best.location.file &&
      candidate.score >= best.score - AMBIGUOUS_SCORE_DISTANCE
  );

  return competing ? null : best.location;
}
