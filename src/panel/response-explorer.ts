export type ResponseExplorerNode = {
  key: string;
  path: string;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  value?: string;
  childCount?: number;
};

export type ResponseExplorerSelection = {
  path: string;
  type: ResponseExplorerNode["type"];
  value: string;
};
