#!/usr/bin/env node
/**
 * Stand-in for the Remotion CLI used by the delivery and MCP end-to-end tests.
 *
 * It writes a real file at the size and length the render was asked for, so the
 * test exercises the checks that compare delivered files against what the
 * project declared instead of accepting any file that happens to exist.
 */
const {spawnSync} = require("node:child_process");
const {mkdirSync} = require("node:fs");
const {dirname} = require("node:path");

const args = process.argv.slice(2);
const flag = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const composition = JSON.parse(flag("props") ?? "{}").state?.composition ?? {};
const width = Number(composition.width) || 1;
const height = Number(composition.height) || 1;
const fps = Number(composition.fps) || 30;

const output = args.find((value) => value.endsWith(".png") || value.endsWith(".mp4"));
if (!output) process.exit(0);
mkdirSync(dirname(output), {recursive: true});

const [start, end] = flag("frames")?.split("-").map(Number) ?? [0, Number(composition.durationInFrames) - 1];
const seconds = (end - start + 1) / fps;
const source = ["-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:r=${fps}:d=${seconds}`];
const result = spawnSync("ffmpeg", output.endsWith(".png")
  ? ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}`, "-frames:v", "1", output]
  : ["-hide_banner", "-loglevel", "error", "-y", ...source, "-f", "lavfi", "-i", `anullsrc=r=48000:cl=mono:d=${seconds}`, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", output],
  {encoding: "utf8"});
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "ffmpeg stub failed\n");
  process.exit(1);
}
