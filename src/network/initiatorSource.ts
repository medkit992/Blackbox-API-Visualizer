import type { Initiator } from "./types.js";

interface ChromiumCallFrame {
  functionName?: unknown;
  url?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
}

interface ChromiumStackTrace {
  callFrames?: unknown;
  parent?: unknown;
}

export interface InitiatorSource {
  /** Student-friendly label shown first in the debugger. */
  label: string;
  source: "direct" | "stack" | "type";
  url?: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
  /** Exact generated path/location when it differs from the friendly label. */
  generatedLabel?: string;
  /** True when Blackbox removed a likely build/cache hash from the filename. */
  likelyBuiltAsset?: boolean;
}

interface FileDisplay {
  friendlyFileName: string;
  generatedPath: string;
  likelyBuiltAsset: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function cleanFunctionName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().replace(/\(\)$/, "");
  if (!trimmed || trimmed === "<anonymous>" || trimmed === "anonymous") {
    return undefined;
  }

  // Bundlers/minifiers often produce chains such as o.cg.o.cg.fetch. The final
  // segment is normally the only human-readable part, so prefer it when useful.
  const segments = trimmed.split(".").filter(Boolean);
  const candidate = segments.at(-1) ?? trimmed;

  // x0, t1, o, cg, etc. are usually minifier symbols and do not help students.
  if (
    candidate.length <= 2 ||
    (/^[A-Za-z_$]\d+$/.test(candidate) && candidate.length <= 4)
  ) {
    return undefined;
  }

  return candidate;
}

function stripUrlDecoration(rawUrl: string): string {
  const withoutFragment = rawUrl.split("#", 1)[0] ?? rawUrl;
  return withoutFragment.split("?", 1)[0] ?? withoutFragment;
}

function pathSegments(rawUrl: string): string[] {
  const undecorated = stripUrlDecoration(rawUrl);

  try {
    const url = new URL(undecorated);
    return decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);
  } catch {
    const normalized = undecorated
      .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/+/, "")
      .replace(/^\/+/, "");

    return normalized.split("/").filter(Boolean);
  }
}

function generatedPath(rawUrl: string): string {
  const segments = pathSegments(rawUrl);

  if (segments.length >= 2) {
    return segments.slice(-2).join("/");
  }

  if (segments.length === 1) {
    return segments[0];
  }

  return stripUrlDecoration(rawUrl);
}

function looksLikeBuildHash(value: string): boolean {
  return (
    value.length >= 6 &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    /\d/.test(value)
  );
}

function normalizeBuiltFileName(fileName: string): {
  fileName: string;
  changed: boolean;
} {
  const extensionMatch = fileName.match(/(\.(?:[cm]?js|jsx|ts|tsx|css))$/i);
  if (!extensionMatch) {
    return { fileName, changed: false };
  }

  const extension = extensionMatch[1];
  const stem = fileName.slice(0, -extension.length);

  // webpack-style: main.82e7f31e.chunk.js
  const chunkMatch = stem.match(/^(.*)[.-]([A-Za-z0-9_]{6,})\.chunk$/i);
  if (chunkMatch && looksLikeBuildHash(chunkMatch[2])) {
    return {
      fileName: `${chunkMatch[1]}${extension}`,
      changed: true,
    };
  }

  // Prefer the final compact token as the hash. This keeps readable names such
  // as `fetch-utilities-c744d246983ad6ac.js` intact instead of incorrectly
  // treating `utilities-c744...` as one giant hash.
  const finalTokenMatch = stem.match(/^(.*)[.-]([A-Za-z0-9_]{6,})$/);
  if (finalTokenMatch && looksLikeBuildHash(finalTokenMatch[2])) {
    return {
      fileName: `${finalTokenMatch[1]}${extension}`,
      changed: true,
    };
  }

  // Vite/Rollup hashes can themselves contain a hyphen, for example
  // `index-BQTmb-9P.js`. Handle that form only after the safer final-token pass.
  const compoundHashMatch = stem.match(
    /^(.*?)-([A-Za-z0-9_]{4,}-[A-Za-z0-9_-]{2,})$/
  );
  if (compoundHashMatch && looksLikeBuildHash(compoundHashMatch[2])) {
    return {
      fileName: `${compoundHashMatch[1]}${extension}`,
      changed: true,
    };
  }

  return { fileName, changed: false };
}

function fileDisplay(rawUrl: string): FileDisplay {
  const path = generatedPath(rawUrl);
  const segments = path.split("/").filter(Boolean);
  const rawFileName = segments.at(-1) ?? path;
  const normalized = normalizeBuiltFileName(rawFileName);

  return {
    friendlyFileName: normalized.fileName,
    generatedPath: path,
    likelyBuiltAsset: normalized.changed,
  };
}

function appendLocation(
  source: string,
  zeroBasedLineNumber?: number,
  zeroBasedColumnNumber?: number
): string {
  let location = source;

  if (zeroBasedLineNumber !== undefined) {
    location += `:${zeroBasedLineNumber + 1}`;

    if (zeroBasedColumnNumber !== undefined) {
      location += `:${zeroBasedColumnNumber + 1}`;
    }
  }

  return location;
}

function buildSource(
  rawUrl: string,
  source: "direct" | "stack",
  rawFunctionName?: unknown,
  zeroBasedLineNumber?: number,
  zeroBasedColumnNumber?: number
): InitiatorSource {
  const file = fileDisplay(rawUrl);
  const functionName = cleanFunctionName(rawFunctionName);
  const friendlyLocation = appendLocation(
    file.friendlyFileName,
    zeroBasedLineNumber,
    zeroBasedColumnNumber
  );
  const exactLocation = appendLocation(
    file.generatedPath,
    zeroBasedLineNumber,
    zeroBasedColumnNumber
  );

  return {
    // Put the file first. It is normally more actionable than a function name,
    // especially when production code has been minified.
    label: functionName
      ? `${friendlyLocation} · ${functionName}()`
      : friendlyLocation,
    source,
    url: rawUrl,
    ...(functionName ? { functionName } : {}),
    ...(zeroBasedLineNumber !== undefined
      ? { lineNumber: zeroBasedLineNumber + 1 }
      : {}),
    ...(zeroBasedColumnNumber !== undefined
      ? { columnNumber: zeroBasedColumnNumber + 1 }
      : {}),
    ...(exactLocation !== friendlyLocation
      ? { generatedLabel: exactLocation }
      : {}),
    ...(file.likelyBuiltAsset ? { likelyBuiltAsset: true } : {}),
  };
}

function callFramesFromStack(stack: unknown, depth = 0): ChromiumCallFrame[] {
  if (depth > 8) {
    return [];
  }

  const record = asRecord(stack) as ChromiumStackTrace | null;
  if (!record) {
    return [];
  }

  const currentFrames = Array.isArray(record.callFrames)
    ? record.callFrames.filter(
        (frame): frame is ChromiumCallFrame => Boolean(asRecord(frame))
      )
    : [];

  return [
    ...currentFrames,
    ...(record.parent ? callFramesFromStack(record.parent, depth + 1) : []),
  ];
}

function sourceFromStack(stack: unknown): InitiatorSource | null {
  for (const frame of callFramesFromStack(stack)) {
    const url = typeof frame.url === "string" ? frame.url.trim() : "";
    if (!url) {
      continue;
    }

    return buildSource(
      url,
      "stack",
      frame.functionName,
      asNonNegativeInteger(frame.lineNumber),
      asNonNegativeInteger(frame.columnNumber)
    );
  }

  return null;
}

export function getBestInitiatorSource(
  initiator: Initiator | undefined
): InitiatorSource | null {
  if (!initiator) {
    return null;
  }

  if (initiator.url) {
    return buildSource(
      initiator.url,
      "direct",
      undefined,
      initiator.lineNumber
    );
  }

  const stackSource = sourceFromStack(initiator.stack);
  if (stackSource) {
    return stackSource;
  }

  return {
    label: initiator.type,
    source: "type",
  };
}

export function formatInitiatorSource(
  initiator: Initiator | undefined
): string | null {
  return getBestInitiatorSource(initiator)?.label ?? null;
}
