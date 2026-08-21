import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

import {loadVideoContext, parseTargetArgs, projectRoot} from "./video-context.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const output = resolve(projectRoot, "output", videoId, "review.html");
if (existsSync(output) && !force) {
  throw new Error(`Review package exists: ${output}. Pass --force to refresh it.`);
}

/** @param {string} value */
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
/** @param {string} file */
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
/** @param {string} title @param {string | null} body */
const section = (title, body) =>
  body ? `<section><h2>${escape(title)}</h2><pre>${escape(body)}</pre></section>` : "";
/** @param {string} title @param {string} file */
const jsonSection = (title, file) => {
  const value = read(file);
  return value ? section(title, JSON.stringify(JSON.parse(value), null, 2)) : "";
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escape(videoId)} review</title><style>
body{margin:0;background:#0b1018;color:#eee7dc;font:16px/1.55 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:64px 28px}h1{font:52px Georgia,serif}h2{color:#d8aa50;margin-top:0}section{background:#121a25;border:1px solid #29384c;padding:28px;margin:22px 0}pre{white-space:pre-wrap;font:15px/1.6 ui-monospace,monospace}.status{color:#aeb9c8}</style></head>
<body><main><div class="status">Production review package</div><h1>${escape(videoId)}</h1>
${section("Production plan", read(resolve(context.sourceDir, "PRODUCTION_PLAN.md")))}
${section("Narration script", read(resolve(context.sourceDir, "SCRIPT.md")))}
${section("Storyboard", read(resolve(context.sourceDir, "STORYBOARD.md")))}
${jsonSection("Scene index", resolve(context.sourceDir, "SCENE_INDEX.json"))}
${jsonSection("Timing plan", resolve(context.sourceDir, "TIMING_PLAN.json"))}
${jsonSection("Generation estimate", resolve(context.sourceDir, "GENERATION_ESTIMATE.json"))}
${jsonSection("Generation approval", resolve(context.sourceDir, "GENERATION_APPROVAL.json"))}
${jsonSection("Candidates", resolve(context.sourceDir, "CANDIDATES.json"))}
${jsonSection("Deliverables", resolve(context.sourceDir, "DELIVERABLES.json"))}
${jsonSection("Visual bible", resolve(context.sourceDir, "VISUAL_BIBLE.json"))}
${jsonSection("Character bible", resolve(context.sourceDir, "CHARACTER_BIBLE.json"))}
${section("Historical constraints", read(resolve(context.sourceDir, "PROMPT_CONSTRAINTS.md")))}
${jsonSection("Source index", resolve(context.sourceDir, "sources/index.json"))}
${jsonSection("Source catalog", resolve(context.sourceDir, "sources/catalog.json"))}
${jsonSection("Generated images", resolve(context.publicDir, "images/generated/manifest.json"))}
${jsonSection("Generated video", resolve(context.publicDir, "video/generated/manifest.json"))}
${jsonSection("Voiceover", resolve(context.publicDir, "audio/voiceover/manifest.json"))}
${jsonSection("Technical QA", resolve(projectRoot, "output", videoId, "qa-report.json"))}
${jsonSection("Clip QA", resolve(projectRoot, "output", videoId, "clip-qa-report.json"))}
${jsonSection("Image QA", resolve(projectRoot, "output", videoId, "image-qa-report.json"))}
${jsonSection("Delivery report", resolve(projectRoot, "output", videoId, "delivery-report.json"))}
</main></body></html>`;

mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, html);
console.log(`Review package: ${output}`);
