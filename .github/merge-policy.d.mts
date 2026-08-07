export type MergePolicyDefinition = {
  protectedFiles: string[];
  protectedPrefixes: string[];
};

export type MergePolicyResult = {
  classification: "auto" | "protected";
  protectedPaths: string[];
  paths: string[];
};

export function classifyChangedPaths(
  paths: string[],
  definition?: MergePolicyDefinition,
): MergePolicyResult;
