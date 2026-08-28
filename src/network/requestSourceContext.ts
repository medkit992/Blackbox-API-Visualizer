import {
  formatInitiatorSource,
  getBestInitiatorSource,
  type InitiatorSource,
} from "./initiatorSource.js";
import {
  findRequestProvenance,
  formatProvenance,
  type RequestProvenance,
  type ResponseBodyLoader,
} from "./requestProvenance.js";
import {
  formatAuthoredSource,
  resolveAuthoredSource,
  type AuthoredSourceLocation,
  type SourceResource,
} from "./sourceMapResolver.js";
import type { NormalizedRequest } from "./types.js";
import { resolveWebpackModuleSource } from "./webpackModuleResolver.js";

export interface RequestSourceContext {
  primarySource: string | null;
  authoredSource: AuthoredSourceLocation | null;
  provenance: RequestProvenance | null;
  browserInitiator: InitiatorSource | null;
  provenanceInitiator: InitiatorSource | null;
  relationship: string | null;
}

export interface RequestSourceContextInput {
  request: NormalizedRequest;
  timeline: readonly NormalizedRequest[];
  resources: readonly SourceResource[];
  loadResponseBody: ResponseBodyLoader;
}

const PROVENANCE_TARGETS = new Set<NormalizedRequest["category"]>([
  "Image",
  "Media",
  "Font",
  "Script",
  "Stylesheet",
  "TextTrack",
  "Manifest",
  "Prefetch",
  "Other",
]);

function sameResource(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;

  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = "";
    b.hash = "";
    return a.href === b.href;
  } catch {
    return left === right;
  }
}

async function resolveForRequest(
  request: NormalizedRequest,
  resources: readonly SourceResource[]
): Promise<{
  initiator: InitiatorSource | null;
  authored: AuthoredSourceLocation | null;
}> {
  const initiator = getBestInitiatorSource(request.initiator);

  // Development bundles can contain many authored modules in one generated file.
  // Resolve the exact module/sourceURL around the endpoint before falling back to
  // bundle-level source-map or source-content correlation.
  const webpackModule = await resolveWebpackModuleSource(
    request,
    initiator,
    resources
  );

  const resolved =
    webpackModule ?? (await resolveAuthoredSource(request, initiator, resources));

  // A text search that simply rediscovers the generated bundle is useful as a
  // browser location, but it is not authored source. Keep it as the initiator
  // fallback instead of presenting bundle.js/main.js as the original file.
  const authored =
    resolved && !sameResource(resolved.url, initiator?.url) ? resolved : null;

  return { initiator, authored };
}

export async function buildRequestSourceContext({
  request,
  timeline,
  resources,
  loadResponseBody,
}: RequestSourceContextInput): Promise<RequestSourceContext> {
  const browser = await resolveForRequest(request, resources);
  const provenance = PROVENANCE_TARGETS.has(request.category)
    ? await findRequestProvenance(request, timeline, loadResponseBody)
    : null;

  if (provenance) {
    const parent = await resolveForRequest(provenance.request, resources);
    const primarySource = parent.authored
      ? formatAuthoredSource(parent.authored)
      : formatInitiatorSource(provenance.request.initiator);

    return {
      primarySource,
      authoredSource: parent.authored,
      provenance,
      browserInitiator: browser.initiator,
      provenanceInitiator: parent.initiator,
      relationship: formatProvenance(provenance),
    };
  }

  return {
    primarySource: browser.authored
      ? formatAuthoredSource(browser.authored)
      : formatInitiatorSource(request.initiator),
    authoredSource: browser.authored,
    provenance: null,
    browserInitiator: browser.initiator,
    provenanceInitiator: null,
    relationship: null,
  };
}
