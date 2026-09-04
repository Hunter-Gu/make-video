import {runCli} from "@make-video/project";
import {createProject} from "./create";
import {installExample} from "./example";
import {linkAssets} from "./link";
import {parseTargetArgs} from "./context";

await runCli(async () => {
  const [mode, ...args] = process.argv.slice(2);
  if (mode !== "link" && mode !== "example" && mode !== "create") throw new Error("Usage: assets.mjs <link|example|create> <video-id> [--force] [--title=…] [--width=…] [--height=…] [--fps=…] [--duration=…]");

  if (mode === "create") {
    const option = (name: string) => args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
    const number = (name: string) => { const value = option(name); return value === undefined ? undefined : Number(value); };
    const known = new Set(["title", "width", "height", "fps", "duration"]);
    const unknown = args.filter((argument) => argument.startsWith("--") && argument !== "--force" && !known.has(argument.slice(2).split("=")[0]));
    if (unknown.length > 0) throw new Error(`Unknown option: ${unknown.join(", ")}`);
    const positionals = args.filter((argument) => !argument.startsWith("--"));
    if (positionals.length !== 1) throw new Error("Exactly one video id is required.");
    createProject({videoId: positionals[0], title: option("title"), width: number("width"), height: number("height"), fps: number("fps"), durationSeconds: number("duration"), force: args.includes("--force")});
  } else {
    const {videoId, force} = parseTargetArgs(args);
    if (mode === "example") installExample(videoId, force);
    else linkAssets(videoId, force);
  }
});
