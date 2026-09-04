import assert from "node:assert/strict";
import {spawn, spawnSync, type ChildProcess} from "node:child_process";
import {chmod, copyFile, mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {createServer, type AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {dirname, resolve} from "node:path";
import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const createFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "make-video-mcp-"));
  const videoId = "mcp-e2e";
  const sourceDir = resolve(root, "src", videoId);
  const publicDir = resolve(root, "public", videoId);
  await mkdir(resolve(sourceDir, "sources"), {recursive: true});
  await mkdir(resolve(sourceDir, "translations"), {recursive: true});
  await mkdir(resolve(publicDir, "audio", "voiceover"), {recursive: true});
  await mkdir(resolve(root, "output", videoId), {recursive: true});
  const remotionBin = resolve(root, "node_modules", ".bin", "remotion");
  await mkdir(dirname(remotionBin), {recursive: true});
  await copyFile(resolve(dirname(fileURLToPath(import.meta.url)), "../../render/test/remotion-stub.cjs"), remotionBin);
  await chmod(remotionBin, 0o755);
  await writeFile(resolve(sourceDir, "video.config.json"), JSON.stringify({
    videoId,
    sources: [{id: "brief", title: "Fixture brief", input: "src/mcp-e2e/sources/brief.md", rights: "test"}],
    composition: {id: "McpE2E", fps: 30, width: 320, height: 180, durationInFrames: 120},
    production: {publicPath: videoId, outputs: {still: "output/mcp-e2e/still.png", silent: "output/mcp-e2e/silent.mp4", unmastered: "output/mcp-e2e/unmastered.mp4", final: "output/mcp-e2e/final.mp4"}, stillFrame: 0, qa: {output: "silent", audioRequired: false}},
    imageGeneration: {model: "gemini-2.5-flash-image", assets: []},
    voice: {model: "gemini-2.5-flash-preview-tts", voiceName: "Kore", direction: "Documentary", timingMode: "narration"},
  }, null, 2));
  await writeFile(resolve(sourceDir, "SCRIPT.md"), "# Narration\n\n- `narration-1`: Alexandria was a center of learning.\n");
  await writeFile(resolve(sourceDir, "SCENE_INDEX.json"), JSON.stringify({version: 1, fps: 30, assets: {}, captions: [], scenes: []}, null, 2));
  await writeFile(resolve(sourceDir, "sources", "index.json"), JSON.stringify({videoId, sources: [{id: "brief", title: "Fixture brief", type: "markdown", origin: "fixture", rights: "test", sha256: "fixture", blocks: [{id: "brief-1", locator: "p1", text: "Alexandria was a center of learning."}]}]}, null, 2));
  await writeFile(resolve(sourceDir, "TIMING_PLAN.json"), JSON.stringify({voiceManifest: `public/${videoId}/audio/voiceover/manifest.json`, scenes: [{id: "scene-1", title: "Opening", type: "image", objective: "Introduce the subject", sourceBlockIds: ["brief-1"], narrationIds: ["narration-1"], minFrames: 1}]}, null, 2));
  await writeFile(resolve(publicDir, "audio", "voiceover", "manifest.json"), JSON.stringify({segments: {"narration-1": {durationSeconds: 1.2}}}, null, 2));
  // Image QA refuses to report a pass without an image to look at, so the fixture
  // carries one. Text detection has its own tests; this one exercises the job path.
  const still = resolve(sourceDir, "fixture.png");
  const drawn = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=64x64", "-frames:v", "1", still], {encoding: "utf8"});
  assert.equal(drawn.status, 0, drawn.stderr);
  await writeFile(resolve(sourceDir, "IMAGE_QA.json"), JSON.stringify({version: 1, images: [{id: "fixture-still", path: `src/${videoId}/fixture.png`, visualIdea: "fixture pattern", allowText: true, minDeviation: 1}]}, null, 2));
  await writeFile(resolve(sourceDir, "translations", "stale.json"), JSON.stringify({language: "xx", scenes: {"scene-removed": {title: "Gone"}}}, null, 2));
  await writeFile(resolve(sourceDir, "DELIVERABLES.json"), JSON.stringify({
    version: 1,
    variants: [
      {id: "thumbnail", kind: "still", width: 160, height: 90, captions: false, frame: 0, output: "output/mcp-e2e/thumbnail.png"},
      {id: "extract", kind: "video", width: 320, height: 180, frames: [0, 15], output: "output/mcp-e2e/extract.mp4"},
      {id: "stale-translation", kind: "still", translation: `src/${videoId}/translations/stale.json`, output: "output/mcp-e2e/stale.png"},
    ],
  }, null, 2));
  const seriesDir = resolve(root, "projects", "mcp-series");
  await mkdir(seriesDir, {recursive: true});
  await writeFile(resolve(seriesDir, "series-plan.json"), JSON.stringify({
    seriesId: "mcp-series",
    title: "Fixture series",
    sourceIndex: `src/${videoId}/sources/index.json`,
    sharedSourceBlockIds: [],
    omittedSourceBlockIds: [],
    episodes: [{id: "one", title: "One", question: "Why?", estimatedMinutes: 5, previous: null, next: null, topics: ["fixture"], sourceBlockIds: ["brief-1"], introduces: ["thesis"], requires: [], timelineEventIds: ["start"], positions: {"reading": "cautious"}}],
  }, null, 2));
  await writeFile(resolve(seriesDir, "SERIES_BIBLE.json"), JSON.stringify({
    version: 1,
    adaptation: {mode: "series", wordsPerMinute: 145},
    rights: {status: "original", intendedUse: "test"},
    sharedFiles: {},
    canonicalPositions: {"reading": "cautious"},
    timeline: [{id: "start", order: 1, label: "Start"}],
    terms: [],
  }, null, 2));
  return {root, videoId, seriesDir};
};

const call = async (client: Client, name: string, args: Record<string, unknown>) => {
  const response = await client.callTool({name, arguments: args});
  assert.equal(response.isError, undefined, `${name} failed: ${JSON.stringify(response)}`);
  return response.structuredContent as Record<string, any>;
};

const waitForJob = async (client: Client, tool: string, jobId: string) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await call(client, tool, {jobId});
    if (job.status === "succeeded" || job.status === "failed") return job;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error(`${tool} did not finish in time.`);
};

test("stdio MCP exposes the core project and production tools", async () => {
  const root = repositoryRoot;
  const client = new Client({name: "make-video-smoke-test", version: "0.1.0"});
  const transport = new StdioClientTransport({command: process.execPath, args: [resolve(root, "skills/make-video/scripts/mcp.mjs")], cwd: root, stderr: "ignore"});
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const name of ["make_video_list_projects", "make_video_get_project", "make_video_generate", "make_video_get_generation_job", "make_video_render", "make_video_get_render_job", "make_video_qa", "make_video_get_qa_job", "make_video_get_timing_job"]) assert.ok(names.has(name), `missing MCP tool: ${name}`);

    const projects = await client.callTool({name: "make_video_list_projects", arguments: {}});
    assert.equal(projects.isError, undefined);
    assert.ok(projects.structuredContent || projects.content.length > 0);

    const missing = await client.callTool({name: "make_video_get_project", arguments: {videoId: "missing-project"}});
    assert.equal(missing.isError, true);
  } finally {
    await client.close();
  }
});

test("HTTP MCP exposes the same core contract", async () => {
  const root = repositoryRoot;
  const port = await freePort();
  const child = spawn(process.execPath, [resolve(root, "skills/make-video/scripts/mcp.mjs"), "http"], {
    cwd: root,
    env: {...process.env, MAKE_VIDEO_MCP_PORT: String(port)},
    stdio: "ignore",
  });
  const client = new Client({name: "make-video-http-smoke-test", version: "0.1.0"});
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {requestInit: {headers: {Origin: `http://127.0.0.1:${port}`}}});
  try {
    await waitForHttpServer(port, child);
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    assert.ok(names.has("make_video_generate"));
    const projects = await client.callTool({name: "make_video_list_projects", arguments: {}});
    assert.equal(projects.isError, undefined);
    const missing = await client.callTool({name: "make_video_get_project", arguments: {videoId: "missing-project"}});
    assert.equal(missing.isError, true);
  } finally {
    await client.close();
    child.kill();
  }
});

test("MCP completes the host-agent preparation and deterministic production path", async () => {
  const fixture = await createFixture();
  const client = new Client({name: "make-video-e2e-test", version: "0.1.0"});
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(repositoryRoot, "skills/make-video/scripts/mcp.mjs")],
    cwd: repositoryRoot,
    env: {...process.env, MAKE_VIDEO_PROJECT_ROOT: fixture.root},
    stderr: "ignore",
  });
  const plan = {
    version: 1,
    title: "Fixture history",
    adaptationMode: "documentary",
    audience: "general",
    language: "en",
    durationSeconds: 1.2,
    sourceBlockIds: ["brief-1"],
    chapters: [{id: "chapter-1", title: "Opening", objective: "Introduce the subject", sourceBlockIds: ["brief-1"], sceneIds: ["scene-1"]}],
    scenes: [{id: "scene-1", chapterId: "chapter-1", title: "Opening", type: "image", objective: "Introduce the subject", sourceBlockIds: ["brief-1"], visualDirection: "A quiet archival library."}],
  };
  try {
    await client.connect(transport);
    const projects = await call(client, "make_video_list_projects", {});
    assert.deepEqual(projects.projects, [fixture.videoId]);
    const sources = await call(client, "make_video_get_sources", {videoId: fixture.videoId});
    assert.equal(sources.sources[0].blocks[0].id, "brief-1");
    const saved = await call(client, "make_video_save_plan", {videoId: fixture.videoId, plan});
    assert.equal(saved.title, plan.title);
    const prepared = await call(client, "make_video_prepare_generation", {videoId: fixture.videoId});
    assert.deepEqual(prepared.preparedSceneIds, ["scene-1"]);
    const storyboard = await call(client, "make_video_build_storyboard", {videoId: fixture.videoId, force: true});
    assert.match(String(storyboard.content), /Fixture history/);
    const script = await call(client, "make_video_validate_script", {videoId: fixture.videoId});
    assert.equal(script.passed, true);
    const readiness = await call(client, "make_video_check_generation_readiness", {videoId: fixture.videoId});
    assert.equal(readiness.passed, true);
    const timingStart = await call(client, "make_video_build_timing", {videoId: fixture.videoId, force: true});
    const timing = await waitForJob(client, "make_video_get_timing_job", timingStart.id);
    assert.equal(timing.status, "succeeded", timing.error);
    const project = await call(client, "make_video_get_project", {videoId: fixture.videoId});
    assert.equal(project.captions[0].id, "narration-1");
    const qaStart = await call(client, "make_video_qa", {videoId: fixture.videoId, kind: "images"});
    const qa = await waitForJob(client, "make_video_get_qa_job", qaStart.id);
    assert.equal(qa.status, "succeeded");
    const renderStart = await call(client, "make_video_render", {videoId: fixture.videoId, kind: "still"});
    const render = await waitForJob(client, "make_video_get_render_job", renderStart.id);
    assert.equal(render.status, "succeeded", render.error);
    const renderedProject = await call(client, "make_video_get_project", {videoId: fixture.videoId});
    assert.equal(renderedProject.stages.find((stage: any) => stage.id === "still")?.exists, true);

    const deliverables = await call(client, "make_video_get_deliverables", {videoId: fixture.videoId});
    assert.equal(deliverables.variants[0].id, "thumbnail");
    assert.equal(deliverables.variants[0].captions, false);
    const deliveryStart = await call(client, "make_video_deliver", {videoId: fixture.videoId, variantIds: ["thumbnail"]});
    const delivery = await waitForJob(client, "make_video_get_delivery_job", deliveryStart.id);
    assert.equal(delivery.status, "succeeded", delivery.error);
    const delivered = await call(client, "make_video_get_deliverables", {videoId: fixture.videoId});
    assert.equal(delivered.report.variants.thumbnail.output, "output/mcp-e2e/thumbnail.png");
    assert.equal(delivered.report.variants.thumbnail.width, 160);
    assert.equal(delivered.report.variants.thumbnail.passed, true);

    const extractStart = await call(client, "make_video_deliver", {videoId: fixture.videoId, variantIds: ["extract"]});
    const extract = await waitForJob(client, "make_video_get_delivery_job", extractStart.id);
    assert.equal(extract.status, "succeeded", extract.error);
    const withExtract = await call(client, "make_video_get_deliverables", {videoId: fixture.videoId});
    assert.equal(withExtract.report.variants.extract.passed, true);
    assert.ok(Math.abs(withExtract.report.variants.extract.duration - 15 / 30) <= 0.25, JSON.stringify(withExtract.report.variants.extract));
    const blocked = await client.callTool({name: "make_video_deliver", arguments: {videoId: fixture.videoId, variantIds: ["missing-variant"]}});
    assert.equal(blocked.isError, true);
    const staleStart = await call(client, "make_video_deliver", {videoId: fixture.videoId, variantIds: ["stale-translation"]});
    const stale = await waitForJob(client, "make_video_get_delivery_job", staleStart.id);
    assert.equal(stale.status, "failed");
    assert.match(String(stale.error), /unknown scene: scene-removed/);

    const series = await call(client, "make_video_list_series", {});
    assert.deepEqual(series.series, ["mcp-series"]);
    const verification = await call(client, "make_video_verify_series", {seriesId: "mcp-series"});
    assert.equal(verification.passed, true, verification.errors?.join(" "));
    assert.equal(verification.coverage.assignedBlocks, 1);
    const coverage = await call(client, "make_video_build_series_coverage", {seriesId: "mcp-series", force: true});
    assert.match(String(coverage.content), /Fixture series coverage/);

    await writeFile(resolve(fixture.seriesDir, "series-plan.json"), JSON.stringify({
      seriesId: "mcp-series",
      title: "Fixture series",
      sourceIndex: `src/${fixture.videoId}/sources/index.json`,
      sharedSourceBlockIds: [],
      omittedSourceBlockIds: [],
      episodes: [
        {id: "one", title: "One", question: "Why?", estimatedMinutes: 5, previous: null, next: "two", topics: [], sourceBlockIds: ["brief-1"], introduces: [], requires: ["thesis"], timelineEventIds: [], positions: {}},
        {id: "two", title: "Two", question: "And then?", estimatedMinutes: 5, previous: "one", next: null, topics: [], sourceBlockIds: ["brief-1"], introduces: ["thesis"], requires: [], timelineEventIds: [], positions: {"reading": "confident"}},
      ],
    }, null, 2));
    const rejected = await call(client, "make_video_verify_series", {seriesId: "mcp-series"});
    assert.equal(rejected.passed, false);
    assert.ok(rejected.errors.some((error: string) => error.includes('requires "thesis"')), rejected.errors.join(" "));
    assert.ok(rejected.errors.some((error: string) => error.includes("repeated by episodes")), rejected.errors.join(" "));
    assert.ok(rejected.errors.some((error: string) => error.includes("contradicts the series position")), rejected.errors.join(" "));
  } finally {
    await client.close();
    await rm(fixture.root, {recursive: true, force: true});
  }
});

test("the stdio protocol stream carries nothing but JSON-RPC frames", async () => {
  // The service runs in-process, so anything it prints on stdout lands between
  // the server's frames. Some hosts skip an unparseable line; others drop the
  // session. Drive it over raw stdio rather than a client, which hides this.
  const fixture = await createFixture();
  const child = spawn(process.execPath, [resolve(repositoryRoot, "skills/make-video/scripts/mcp.mjs")], {
    cwd: repositoryRoot,
    env: {...process.env, MAKE_VIDEO_PROJECT_ROOT: fixture.root},
    stdio: ["pipe", "pipe", "ignore"],
  });
  let raw = "";
  child.stdout.on("data", (chunk) => { raw += String(chunk); });
  const send = (value: unknown) => child.stdin.write(`${JSON.stringify(value)}\n`);
  const lines = () => raw.split("\n").filter((line) => line.trim().length > 0);
  const waitForLines = async (count: number) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (lines().length >= count) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    throw new Error(`only ${lines().length} of ${count} responses arrived: ${raw.slice(0, 200)}`);
  };
  try {
    send({jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "stdout-probe", version: "1"}}});
    await waitForLines(1);
    send({jsonrpc: "2.0", method: "notifications/initialized"});
    // linkAssets reports that a project's runtime links are ready.
    send({jsonrpc: "2.0", id: 2, method: "tools/call", params: {name: "make_video_get_project", arguments: {videoId: fixture.videoId}}});
    await waitForLines(2);

    for (const line of lines()) assert.doesNotThrow(() => JSON.parse(line), `stdout is not a JSON-RPC frame: ${line.slice(0, 120)}`);
  } finally {
    child.kill();
    await rm(fixture.root, {recursive: true, force: true});
  }
});

const freePort = async () => {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolvePromise()); });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return port;
};

const waitForHttpServer = async (port: number, child: ChildProcess) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`MCP HTTP server exited with status ${child.exitCode}.`);
    try { const response = await fetch(`http://127.0.0.1:${port}/api/projects`); if (response.ok) return; } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  throw new Error("MCP HTTP server did not start in time.");
};
