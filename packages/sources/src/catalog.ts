import {log, readJsonFile} from "@make-video/project";
import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve, sep} from "node:path";

import {assertOutputAvailable, loadSourceContext, projectRoot} from "./context";

export const buildCatalog = (videoId: string, force: boolean) => {
  const context = loadSourceContext(videoId);
  const indexFile = resolve(context.sourceDir, "sources/index.json"); const annotationsFile = resolve(context.sourceDir, "SOURCE_ANNOTATIONS.json");
  if (!existsSync(indexFile) || !existsSync(annotationsFile)) throw new Error("Source index and SOURCE_ANNOTATIONS.json are required.");
  const index = readJsonFile(indexFile); const annotations = readJsonFile(annotationsFile);
  const blocks = new Map(index.sources.flatMap((source: any) => source.blocks.map((block: any) => [block.id, block]))); const sourceIds = new Set(index.sources.map((source: any) => source.id)); const allowedTypes = new Set(["person", "place", "date", "event", "concept"]); const entityIds = new Set<string>();
  for (const entity of annotations.entities ?? []) { if (!entity.id || entityIds.has(entity.id) || !allowedTypes.has(entity.type) || !entity.name) throw new Error("Source annotations contain an invalid entity."); entityIds.add(entity.id); if (!entity.sourceBlockIds?.length || entity.sourceBlockIds.some((id: string) => !blocks.has(id))) throw new Error(`Entity ${entity.id} has invalid source blocks.`); }
  for (const quotation of annotations.quotations ?? []) { const block = blocks.get(quotation.sourceBlockId) as any; if (!quotation.id || !quotation.text || !block || !block.text.includes(quotation.text)) throw new Error(`Quotation ${quotation.id ?? "unknown"} is not verbatim in its source block.`); }
  for (const illustration of annotations.illustrations ?? []) { if (!illustration.id || !sourceIds.has(illustration.sourceId) || !illustration.rights || typeof illustration.reuseAllowed !== "boolean") throw new Error("Each illustration needs id, sourceId, rights, and reuseAllowed."); const file = context.resolveConfiguredPath(illustration.path, `illustration ${illustration.id}`); if (!existsSync(file)) throw new Error(`Illustration not found: ${file}`); const relativePublic = relative(resolve(projectRoot, "public"), file); if (relativePublic !== ".." && !relativePublic.startsWith(`..${sep}`)) throw new Error(`Illustration ${illustration.id} must remain canonical outside public/.`); if (illustration.sourceBlockId && !blocks.has(illustration.sourceBlockId)) throw new Error(`Illustration ${illustration.id} has an invalid source block.`); }
  const claimsFile = resolve(context.sourceDir, "CLAIMS.json"); const claims = existsSync(claimsFile) ? readJsonFile(claimsFile).claims ?? [] : [];
  const catalog = {videoId, entities: annotations.entities ?? [], quotations: annotations.quotations ?? [], claims: claims.map((claim: any) => ({id: claim.id, type: claim.type, sourceBlockIds: claim.sourceBlockIds})), illustrations: annotations.illustrations ?? []};
  const output = resolve(context.sourceDir, "sources/catalog.json"); assertOutputAvailable(output, force, `Source catalog for ${videoId}`); mkdirSync(dirname(output), {recursive: true}); writeFileSync(output, `${JSON.stringify(catalog, null, 2)}\n`); log(`Source catalog: ${catalog.entities.length} entities, ${catalog.quotations.length} quotations, ${catalog.claims.length} claims, ${catalog.illustrations.length} illustrations.`);
};
