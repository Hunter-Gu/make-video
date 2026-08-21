import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, extname, resolve} from "node:path";

import {assertTargetsUnlocked} from "./approval-lock-lib.mjs";
import {assertOutputsAvailable, loadVideoContext, projectRoot, scriptsDir} from "./video-context.mjs";

const [videoId, ...flags] = process.argv.slice(2);
const force = flags.includes("--force");
const variantFlags = flags.filter((flag) => flag.startsWith("--variant="));
if (!videoId || flags.some((flag) => flag !== "--force" && !flag.startsWith("--variant="))) throw new Error("Usage: render-deliverables.mjs <video-id> [--variant=id] [--force]");
const selectedIds = variantFlags.flatMap((flag) => flag.slice(10).split(",")).filter(Boolean);
const context = loadVideoContext(videoId);
const configFile = resolve(context.sourceDir, "DELIVERABLES.json");
if (!existsSync(configFile)) throw new Error(`Deliverable config not found: ${configFile}`);
const delivery = JSON.parse(readFileSync(configFile, "utf8"));
const variants = selectedIds.length > 0 ? delivery.variants.filter((/** @type {any} */ item) => selectedIds.includes(item.id)) : delivery.variants;
const missing = selectedIds.filter((id) => !delivery.variants.some((/** @type {any} */ item) => item.id === id));
if (missing.length > 0) throw new Error(`Unknown deliverable variants: ${missing.join(", ")}`);

/** @param {string} command @param {string[]} args */
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: projectRoot, env: process.env, stdio: "inherit", encoding: "utf8"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
};

run(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId]);
const reportFile = resolve(projectRoot, "output", videoId, "delivery-report.json");
assertTargetsUnlocked(context, [reportFile]);
const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) : {videoId, variants: {}};
for (const variant of variants) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variant.id) || !["video", "still"].includes(variant.kind)) throw new Error("Each deliverable needs a kebab-case id and video or still kind.");
  const output = context.resolveConfiguredPath(variant.output, `deliverable ${variant.id}.output`);
  const expectedExtension = variant.kind === "still" ? ".png" : ".mp4";
  if (extname(output).toLowerCase() !== expectedExtension) throw new Error(`${variant.id} needs a ${expectedExtension} output.`);
  assertTargetsUnlocked(context, [output]);
  assertOutputsAvailable([output], {force, action: `Deliverable ${variant.id}`});
  const sceneOverrides = variant.translation
    ? JSON.parse(readFileSync(context.resolveConfiguredPath(variant.translation, `deliverable ${variant.id}.translation`), "utf8")).scenes
    : undefined;
  const props = {showCaptions: variant.captions !== false, sceneOverrides, renderWidth: variant.width, renderHeight: variant.height};
  mkdirSync(dirname(output), {recursive: true});
  const frameRange = variant.frames ? `--frames=${variant.frames[0]}-${variant.frames[1] - 1}` : null;
  if (variant.kind === "still") {
    run(process.execPath, [resolve(scriptsDir, "run-remotion.mjs"), "still", "src/index.ts", context.composition.id, output, `--frame=${variant.frame ?? 0}`, `--props=${JSON.stringify(props)}`]);
  } else {
    run(process.execPath, [resolve(scriptsDir, "run-remotion.mjs"), "render", "src/index.ts", context.composition.id, output, "--concurrency=1", `--props=${JSON.stringify(props)}`, ...(frameRange ? [frameRange] : [])]);
  }
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries", "format=duration", "-of", "json", output], {encoding: "utf8"});
  if (probe.status !== 0) throw new Error(`Could not verify ${variant.id}.`);
  const metadata = JSON.parse(probe.stdout);
  const videoStream = metadata.streams?.find((/** @type {any} */ stream) => stream.codec_type === "video");
  if (videoStream?.width !== variant.width || videoStream?.height !== variant.height) throw new Error(`${variant.id} rendered at the wrong dimensions.`);
  report.variants[variant.id] = {output: variant.output, kind: variant.kind, width: videoStream.width, height: videoStream.height, duration: Number(metadata.format?.duration), captions: variant.captions !== false, translation: variant.translation ?? null};
}
report.generatedAt = new Date().toISOString();
mkdirSync(dirname(reportFile), {recursive: true});
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Verified ${variants.length} deliverable variant(s).`);
