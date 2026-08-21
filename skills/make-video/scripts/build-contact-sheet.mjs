import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";

import {assertOutputsAvailable, loadVideoContext, parseTargetArgs, projectRoot, scriptsDir} from "./video-context.mjs";

const {videoId, force} = parseTargetArgs(process.argv.slice(2));
const context = loadVideoContext(videoId);
const sceneIndex = JSON.parse(readFileSync(resolve(context.sourceDir, "SCENE_INDEX.json"), "utf8"));
const reviewDir = resolve(projectRoot, "output", videoId, "review");
const htmlFile = resolve(reviewDir, "index.html");
assertOutputsAvailable([htmlFile], {force, action: `Contact sheet for ${videoId}`});
mkdirSync(resolve(reviewDir, "frames"), {recursive: true});

const run = (/** @type {string[]} */ args) => {
  const result = spawnSync(process.execPath, [resolve(scriptsDir, "run-remotion.mjs"), ...args], {cwd: projectRoot, env: process.env, stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const linked = spawnSync(process.execPath, [resolve(scriptsDir, "link-assets.mjs"), videoId], {cwd: projectRoot, env: process.env, stdio: "inherit"});
if (linked.status !== 0) process.exit(linked.status ?? 1);
for (const scene of sceneIndex.scenes) {
  const frameFile = resolve(reviewDir, "frames", `${scene.id}.png`);
  if (!existsSync(frameFile) || force) {
    const frame = Math.floor((scene.startFrame + scene.endFrame) / 2);
    run(["still", "src/index.ts", context.composition.id, frameFile, `--frame=${frame}`]);
  }
}

const escape = (/** @type {unknown} */ value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const cards = sceneIndex.scenes.map((/** @type {any} */ scene) => `<article data-scene="${escape(scene.id)}"><img src="frames/${escape(scene.id)}.png"><div><b>${escape(scene.id)}</b><span>${(scene.startFrame / sceneIndex.fps).toFixed(2)}–${(scene.endFrame / sceneIndex.fps).toFixed(2)}s</span><small>Sources: ${escape((scene.sourceBlockIds ?? []).join(", ") || "none")}</small><small>Assets: ${escape((scene.assetIds ?? []).join(", ") || "none")}</small></div></article>`).join("");
const videoPath = existsSync(context.outputs.silent) ? relative(reviewDir, context.outputs.silent) : null;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(videoId)} review</title><style>body{margin:0;background:#09101a;color:#f5ecdc;font:15px system-ui}main{max-width:1500px;margin:auto;padding:40px}h1{font:48px Georgia}video{width:100%;max-height:70vh;background:#000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}article{background:#121d2b;border:1px solid #2b3c51}article img{width:100%;aspect-ratio:16/9;object-fit:cover}article div{display:grid;grid-template-columns:1fr auto;gap:8px;padding:14px}small{grid-column:1/-1;color:#aeb9c8}form{position:sticky;bottom:0;background:#101a28eF;padding:18px;margin-top:28px;display:flex;gap:10px;flex-wrap:wrap}input,select,button{padding:10px;background:#182538;color:#fff;border:1px solid #3a4d65}input[name=note]{flex:1;min-width:260px}</style></head><body><main><h1>${escape(videoId)} review</h1>${videoPath ? `<video controls src="${escape(videoPath)}"></video>` : "<p>No rendered preview yet.</p>"}<h2>Storyboard contact sheet</h2><div class="grid">${cards}</div><form id="feedback"><select name="scene">${sceneIndex.scenes.map((/** @type {any} */ scene) => `<option>${escape(scene.id)}</option>`).join("")}</select><input name="time" type="number" step="0.01" placeholder="seconds"><input name="region" placeholder="x,y,width,height"><input name="note" required placeholder="Feedback"><button>Export JSON</button></form></main><script>document.querySelectorAll('article').forEach(card=>card.onclick=()=>document.querySelector('[name=scene]').value=card.dataset.scene);document.querySelector('video')?.addEventListener('timeupdate',e=>document.querySelector('[name=time]').value=e.target.currentTime.toFixed(2));document.querySelector('#feedback').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.videoId=${JSON.stringify(videoId)};data.createdAt=new Date().toISOString();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='feedback-'+data.scene+'.json';a.click();URL.revokeObjectURL(a.href)};</script></body></html>`;
writeFileSync(htmlFile, html);
console.log(`Interactive contact sheet: ${htmlFile}`);
