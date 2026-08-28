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
  label: string;
  source: "direct" | "stack" | "type";
  url?: string;
  functionName?: string;
  lineNumber?: number;
  columnNumber?: number;
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

  const trimmed = value.trim();
  if (!trimmed || trimmed === "<anonymous>") {
    return undefined;
  }

  return trimmed;
}

function displayPath(rawUrl: string): string {
  const withoutFragment = rawUrl.split("#", 1)[0] ?? rawUrl;
  const withoutQuery = withoutFragment.split("?", 1)[0] ?? withoutFragment;

  try {
    const url = new URL(withoutQuery);
    const segments = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean);

    if (segments.length >= 2) {
      return segments.slice(-2).join("/");
    }

    if (segments.length === 1) {
      return segments[0];
    }

    return url.hostname || withoutQuery;
  } catch {
    const normalized = withoutQuery
      .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/+/, "")
      .replace(/^\/+/, "");
    const segments = normalized.split("/").filter(Boolean);

    if (segments.length >= 2) {
      return segments.slice(-2).join("/");
    }

    return segments[0] || withoutQuery;
  }
}

function formatLabel(
  rawUrl: string,
  functionName?: string,
  zeroBasedLineNumber?: number,
  zeroBasedColumnNumber?: number
): string {
  let location = displayPath(rawUrl);

  if (zeroBasedLineNumber !== undefined) {
    location += `:${zeroBasedLineNumber + 1}`;

    if (zeroBasedColumnNumber !== undefined) {
      location += `:${zeroBasedColumnNumber + 1}`;
    }
  }

  return functionName ? `${functionName}() · ${location}` : location;
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

    const functionName = cleanFunctionName(frame.functionName);
    const lineNumber = asNonNegativeInteger(frame.lineNumber);
    const columnNumber = asNonNegativeInteger(frame.columnNumber);

    return {
      label: formatLabel(url, functionName, lineNumber, columnNumber),
      source: "stack",
      url,
      ...(functionName ? { functionName } : {}),
      ...(lineNumber !== undefined ? { lineNumber: lineNumber + 1 } : {}),
      ...(columnNumber !== undefined ? { columnNumber: columnNumber + 1 } : {}),
    };
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
    return {
      label: formatLabel(initiator.url, undefined, initiator.lineNumber),
      source: "direct",
      url: initiator.url,
      ...(initiator.lineNumber !== undefined
        ? { lineNumber: initiator.lineNumber + 1 }
        : {}),
    };
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
