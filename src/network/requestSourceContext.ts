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

async function resolveForRequest(
  request: NormalizedRequest,
  resources: readonly SourceResource[]
): Promise<{
  initiator: InitiatorSource | null;
  authored: AuthoredSourceLocation | null;
}> {
  const initiator = getBestInitiatorSource(request.initiator);
  const authored = await resolveAuthoredSource(request, initiator, resources);
  return { initiator, authored };
}

export async function buildRequestSourceContext({
  request,
  timeline,
  resources,
  loadResponseBody,
}: RequestSourceContextInput): Promise<RequestSourceContext> {
  const browser = await resolveForRequest(request, resources);
  const provenance = await findRequestProvenance(request, timeline, loadResponseBody);

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
