import type { RequestDiagnosis } from "./diagnosticRules.js";
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
      ...(context.authoredSource ? { strength: "strong" as const } : {}),
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

  if (
    context.browserInitiator?.label &&
    context.browserInitiator.label !== context.primarySource
  ) {
    evidence.push({
      key: "browser-initiator",
      label: "Browser initiator",
      value: context.browserInitiator.label,
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
