/** @param {string[]} args */
export const parseGenerationArgs = (args) => {
  const force = args.includes("--force");
  const assetFlags = args.filter((argument) => argument.startsWith("--asset="));
  const unknownFlags = args.filter((argument) => argument.startsWith("--") && argument !== "--force" && !argument.startsWith("--asset="));
  const positionals = args.filter((argument) => !argument.startsWith("--"));
  if (unknownFlags.length > 0) throw new Error(`Unknown option: ${unknownFlags.join(", ")}`);
  if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
  const assetIds = [...new Set(assetFlags.flatMap((flag) => flag.slice(8).split(",")).filter(Boolean))];
  if (assetIds.some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) throw new Error("--asset IDs must use kebab-case.");
  return {videoId: positionals[0], force, assetIds};
};
