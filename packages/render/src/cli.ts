import {runCli} from "@make-video/project";
import {parseTargetArgs} from "./context";
import {runDelivery} from "./delivery";
import {runRender} from "./run";

await runCli(async () => {
  const [action, ...args] = process.argv.slice(2);
  if (action === "deliver") {
    const variantIds = [...new Set(args.filter((argument) => argument.startsWith("--variant=")).flatMap((argument) => argument.slice("--variant=".length).split(",")).filter(Boolean))];
    const {videoId, force} = parseTargetArgs(args.filter((argument) => !argument.startsWith("--variant=")));
    await runDelivery(videoId, {variantIds, force});
  } else {
    if (!["studio", "still", "preview", "final"].includes(action)) throw new Error("Usage: render.mjs <studio|still|preview|final|deliver> <video-id> [--force] [--variant=id]");
    const {videoId, force} = parseTargetArgs(args);
    await runRender(action as "studio" | "still" | "preview" | "final", videoId, force);
  }
});
