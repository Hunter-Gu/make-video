import {log} from "@make-video/project";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {assertOutputAvailable, loadSourceContext} from "./context";

const text = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ").trim();
const bullets = (values: unknown[]) => values.length ? values.map((value) => `\`${text(value)}\``).join(", ") : "none";

export const buildSourceList = (videoId: string, force: boolean) => {
  const context = loadSourceContext(videoId);
  const indexFile = resolve(context.sourceDir, "sources", "index.json");
  if (!existsSync(indexFile)) throw new Error("Source index is required.");
  const index = JSON.parse(readFileSync(indexFile, "utf8"));
  const catalogFile = resolve(context.sourceDir, "sources", "catalog.json");
  const catalog = existsSync(catalogFile) ? JSON.parse(readFileSync(catalogFile, "utf8")) : null;
  const claimsFile = resolve(context.sourceDir, "CLAIMS.json");
  const claims = existsSync(claimsFile) ? new Map((JSON.parse(readFileSync(claimsFile, "utf8")).claims ?? []).map((claim: any) => [claim.id, claim])) : new Map();
  const lines = ["# Sources", "", `Generated for \`${videoId}\`.`, "", "## Source documents", ""];
  for (const source of index.sources ?? []) {
    lines.push(`### ${text(source.title || source.id)}`, "", `- ID: \`${text(source.id)}\``, `- Type: ${text(source.type)}`, `- Origin: \`${text(source.origin)}\``, `- Rights: ${text(source.rights)}`, `- SHA-256: \`${text(source.sha256)}\``, "", "Indexed locations:");
    for (const block of source.blocks ?? []) lines.push(`- \`${text(block.id)}\` — ${text(block.locator)}`);
    lines.push("");
  }
  if (catalog) {
    lines.push("## Claims", "");
    for (const claim of catalog.claims ?? []) {
      const detail = claims.get(claim.id) ?? claim;
      lines.push(`- **${text(claim.id)}** (${text(claim.type)}): ${text(detail.text)}${detail.narrationIds?.length ? ` — narration: ${detail.narrationIds.map(text).join(", ")}` : ""} — source blocks: ${bullets(claim.sourceBlockIds ?? [])}${detail.disclosure ? `; disclosure: ${text(detail.disclosure)}` : ""}`);
    }
    lines.push("", "## Quotations", "");
    for (const quotation of catalog.quotations ?? []) lines.push(`- **${text(quotation.id)}**: “${text(quotation.text)}” — source block: \`${text(quotation.sourceBlockId)}\``);
    lines.push("", "## Entities", "");
    for (const entity of catalog.entities ?? []) lines.push(`- **${text(entity.name)}** (${text(entity.type)}) — source blocks: ${bullets(entity.sourceBlockIds ?? [])}`);
    lines.push("", "## Illustrations", "");
    for (const illustration of catalog.illustrations ?? []) lines.push(`- **${text(illustration.id)}** — ${text(illustration.caption)}; rights: ${text(illustration.rights)}; reuse allowed: ${String(illustration.reuseAllowed)}`);
  }
  const output = resolve(context.sourceDir, "SOURCES.md");
  assertOutputAvailable(output, force, `Source list for ${videoId}`);
  mkdirSync(dirname(output), {recursive: true});
  const content = `${lines.join("\n").trim()}\n`;
  writeFileSync(output, content);
  log(`Source list: ${output}`);
  return content;
};
