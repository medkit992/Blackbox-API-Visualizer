import type { RequestDiagnosis } from "./diagnosticRules.js";
import { formatInitiatorSource } from "./initiatorSource.js";
import type { RequestSourceContext } from "./requestSourceContext.js";

export function withSourceContext(
  diagnosis: RequestDiagnosis,
  context: RequestSourceContext | null
): RequestDiagnosis {
  if (!context) {
    return diagnosis;
  }

  const evidence = diagnosis.evidence.filter((item) => item.key !== "initiator");

  if (context.primarySource) {
    evidence.push({
      key: "debug-source",
      label: context.authoredSource ? "Start debugging in" : "Likely source",
      value: context.primarySource,
      strength: context.authoredSource ? "strong" : undefined,
    });
  }

  if (context.relationship) {
    evidence.push({
      key: "request-relationship",
      label: "Relationship",
      value: context.relationship,
      strength: "strong",
    });
  }

  const browserInitiator = context.browserInitiator
    ? formatInitiatorSource({
        type: "other",
        url: context.browserInitiator.url,
        lineNumber:
          context.browserInitiator.lineNumber !== undefined
            ? context.browserInitiator.lineNumber - 1
            : undefined,
        stack: undefined,
      }) ?? context.browserInitiator.label
    : null;

  if (browserInitiator && browserInitiator !== context.primarySource) {
    evidence.push({
      key: "browser-initiator",
      label: "Browser initiator",
      value: context.browserInitiator?.label ?? browserInitiator,
    });
  }

  if (context.authoredSource?.generatedLocation) {
    evidence.push({
      key: "generated-location",
      label: "Generated location",
      value: context.authoredSource.generatedLocation,
    });
  }

  return {
    ...diagnosis,
    evidence,
  };
}
