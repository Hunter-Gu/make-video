import {log} from "@make-video/project";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {extname, posix, resolve} from "node:path";

import {assertOutputAvailable, loadSourceContext, projectRoot} from "./context";

type SourceBlock = {locator: string; text: string};
/** What each external reader is for, so a missing one is reported as missing tooling. */
const readers: Record<string, string> = {
  pdftotext: "pdftotext (from poppler-utils) is required to read PDF sources.",
  unzip: "unzip is required to read DOCX and EPUB sources.",
};
const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, {cwd: projectRoot, encoding: "utf8"});
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") throw new Error(`${readers[command] ?? `${command} is required to read this source.`} Install it and try again.`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
};
const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? "";
const decode = (text: string) => text.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)));
const xmlText = (xml: string) => decode(xml.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|w:p)>/gi, "\n\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n +/g, "\n").trim();
const paragraphs = (text: string, locator: string): SourceBlock[] => text.split(/\n\s*\n+/).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean).map((text, index) => ({locator: `${locator}:paragraph-${index + 1}`, text}));
const unzipRead = (file: string, entry: string) => run("unzip", ["-p", file, entry]);
const ingestPdf = (file: string) => run("pdftotext", ["-layout", file, "-"]).split("\f").flatMap((page, index) => paragraphs(page, `page-${index + 1}`));
const ingestDocx = (file: string) => paragraphs(xmlText(unzipRead(file, "word/document.xml").replace(/<w:tab\/?\s*>/g, " ").replace(/<\/w:t>\s*<w:t[^>]*>/g, "")), "document");
/**
 * Read an EPUB in the order the book declares.
 *
 * The archive lists entries in whatever order they were zipped, and it holds more
 * XHTML than the book text — a navigation document, a cover page. Ingesting the
 * listing therefore mixes the table of contents into the source and can put a
 * later chapter first. The spine is the book's own statement of reading order,
 * and everything downstream — plan coverage, chronology, citations — depends on
 * getting it right, so that is what is followed.
 */
const ingestEpub = (file: string) => {
  const rootfile = attribute(unzipRead(file, "META-INF/container.xml").match(/<rootfile\b[^>]*>/i)?.[0] ?? "", "full-path");
  if (!rootfile) throw new Error(`${file} is not a readable EPUB: META-INF/container.xml must name the package document.`);
  const packageDocument = unzipRead(file, rootfile);
  const base = rootfile.includes("/") ? rootfile.slice(0, rootfile.lastIndexOf("/")) : "";
  const manifest = new Map((packageDocument.match(/<item\b[^>]*>/gi) ?? []).map((tag) => [attribute(tag, "id"), tag]));
  const documents = (packageDocument.match(/<itemref\b[^>]*>/gi) ?? [])
    .map((tag) => manifest.get(attribute(tag, "idref")))
    .filter((tag): tag is string => Boolean(tag) && !/(^|\s)nav(\s|$)/i.test(attribute(tag as string, "properties")))
    .map((tag) => posix.join(base, decodeURIComponent(attribute(tag, "href")).split(/[?#]/)[0]))
    .filter((entry) => /\.(xhtml|html|htm)$/i.test(entry));
  if (documents.length === 0) throw new Error(`${file} declares no readable documents in its EPUB spine.`);
  return documents.flatMap((entry, index) => paragraphs(xmlText(unzipRead(file, entry)), `section-${index + 1}`));
};
const ingestWeb = async (url: string) => { const response = await fetch(url); if (!response.ok) throw new Error(`Source request failed (${response.status}): ${url}`); return paragraphs(xmlText(await response.text()), "web"); };

export const ingestSources = async (videoId: string, force: boolean) => {
  const context = loadSourceContext(videoId);
  const sources = context.config.sources;
  if (!Array.isArray(sources) || sources.length === 0) throw new Error(`${videoId} has no sources to ingest.`);
  const outputDir = resolve(context.sourceDir, "sources");
  const indexFile = resolve(outputDir, "index.json");
  assertOutputAvailable(indexFile, force, `Source ingestion for ${videoId}`);
  const seen = new Set<string>(); const indexedSources: any[] = [];
  for (const source of sources) {
    if (!source || typeof source !== "object" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)) throw new Error("Each source needs a unique kebab-case id.");
    if (seen.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`); seen.add(source.id);
    const type = source.type ?? (source.url ? "web" : ({".md": "markdown", ".txt": "text", ".pdf": "pdf", ".docx": "docx", ".epub": "epub"} as any)[extname(source.input ?? "").toLowerCase()]);
    let blocks: SourceBlock[]; let origin: string;
    if (type === "web") { if (typeof source.url !== "string") throw new Error(`${source.id} needs a URL.`); origin = source.url; blocks = await ingestWeb(source.url); }
    else { const file = context.resolveConfiguredPath(source.input, `sources.${source.id}.input`); if (!existsSync(file)) throw new Error(`Source not found: ${file}`); origin = source.input; if (type === "pdf") blocks = ingestPdf(file); else if (type === "docx") blocks = ingestDocx(file); else if (type === "epub") blocks = ingestEpub(file); else if (type === "markdown" || type === "text") blocks = paragraphs(readFileSync(file, "utf8"), "document"); else throw new Error(`Unsupported source type for ${source.id}: ${type}`); }
    indexedSources.push({id: source.id, title: source.title ?? source.id, type, origin, rights: source.rights ?? "unspecified", sha256: createHash("sha256").update(blocks.map((block) => block.text).join("\n")).digest("hex"), blocks: blocks.map((block, index) => ({id: `${source.id}-${index + 1}`, ...block}))});
  }
  mkdirSync(outputDir, {recursive: true}); writeFileSync(indexFile, `${JSON.stringify({videoId, sources: indexedSources}, null, 2)}\n`); log(`Indexed ${indexedSources.length} source(s) for ${videoId}: ${indexFile}`);
};
