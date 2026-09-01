import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {extname, relative, resolve, sep} from "node:path";

import {localhostHostValidation, localhostOriginValidation, toNodeHandler} from "@modelcontextprotocol/node";
import {createMcpHandler, McpServer} from "@modelcontextprotocol/server";
import {z} from "zod";

import {projectRoot} from "./context";
import {getModelCatalog} from "./models";
import {buildSeriesCoverage, buildSourceCatalog, buildSourceList, buildStoryboard, checkGenerationReadiness, createAssetRevision, getDeliverables, getDeliveryJob, getGenerationJob, getPlan, getProjectState, getQaJob, getRenderJob, getSeries, getSourceCatalog, getSourceJob, getSources, getTimingJob, listProjects, listSeries, prepareGeneration, resolveMediaPath, savePlan, setCover, startDelivery, startGeneration, startQa, startRender, startSourceIngest, startTiming, updateCaption, updateModels, updateTimelineRange, uploadSource, validateScript, verifySeries} from "./service";

type CallToolResult = {
  content: Array<{type: "text"; text: string}>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const result = (value: Record<string, any>): CallToolResult => ({
  content: [{type: "text", text: JSON.stringify(value, null, 2)}],
  structuredContent: value,
});

const run = async (operation: () => unknown | Promise<unknown>): Promise<CallToolResult> => {
  try {
    return result(await operation() as Record<string, any>);
  } catch (error) {
    return {content: [{type: "text", text: error instanceof Error ? error.message : String(error)}], isError: true};
  }
};

export const createMakeVideoMcpServer = () => {
  const server = new McpServer({name: "make-video-mcp", version: "0.1.0"});

  server.registerTool("make_video_list_projects", {
    description: "List video projects available to Make Video.",
    inputSchema: z.object({}),
    annotations: {readOnlyHint: true},
  }, () => result({projects: listProjects()}));

  server.registerTool("make_video_get_project", {
    description: "Read scenes, captions, assets, render stages, models, revisions, and QA for one video project.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => getProjectState(videoId)));

  server.registerTool("make_video_update_caption", {
    description: "Update one caption's text and frame range in the project source of truth.",
    inputSchema: z.object({videoId: z.string().min(1), id: z.string().min(1), text: z.string().min(1), startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, id, ...input}) => run(() => updateCaption(videoId, id, input)));

  server.registerTool("make_video_update_models", {
    description: "Save the selected image and voice models without starting paid generation.",
    inputSchema: z.object({videoId: z.string().min(1), image: z.string().min(1).optional(), video: z.string().min(1).optional(), voice: z.string().min(1).optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, image, video, voice}) => run(() => updateModels(videoId, {image, video, voice})));

  server.registerTool("make_video_generate", {
    description: "Start one configured image, video, voiceover, or music generation job. Poll make_video_get_generation_job for completion. API keys stay on the server environment and are never passed as tool input.",
    inputSchema: z.object({videoId: z.string().min(1), kind: z.enum(["images", "video", "voiceover", "music"]), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, kind, force}) => result(startGeneration(videoId, kind, force ?? false)));

  server.registerTool("make_video_get_generation_job", {
    description: "Read the status of a Make Video image, video, voiceover, or music generation job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getGenerationJob(jobId)));

  server.registerTool("make_video_get_render_job", {
    description: "Read the status of a Remotion still, preview, or final render job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getRenderJob(jobId)));

  server.registerTool("make_video_get_qa_job", {
    description: "Read the status of a deterministic video, image, or generated-clip QA job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getQaJob(jobId)));

  server.registerTool("make_video_render", {
    description: "Start a still, preview, or final Remotion render and return a task id.",
    inputSchema: z.object({videoId: z.string().min(1), kind: z.enum(["still", "preview", "final"]), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, kind, force}) => result(startRender(videoId, kind, force ?? false)));

  server.registerTool("make_video_qa", {
    description: "Run deterministic video, image, or generated-clip QA and return a task id.",
    inputSchema: z.object({videoId: z.string().min(1), kind: z.enum(["video", "images", "generated-videos"])}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, kind}) => result(startQa(videoId, kind)));

  server.registerTool("make_video_ingest_sources", {
    description: "Parse the files registered in a video project into structured source blocks for the host agent to use when making a plan.",
    inputSchema: z.object({videoId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, force}) => result(startSourceIngest(videoId, force ?? true)));

  server.registerTool("make_video_get_sources", {
    description: "Read the structured source blocks available to the host agent for one video project.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => getSources(videoId)));

  server.registerTool("make_video_build_source_catalog", {
    description: "Validate source annotations and build the deterministic catalog of entities, quotations, claims, and illustrations.",
    inputSchema: z.object({videoId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, force}) => run(() => buildSourceCatalog(videoId, force ?? true)));

  server.registerTool("make_video_build_source_list", {
    description: "Build a human-readable SOURCES.md from the indexed source documents and validated source catalog.",
    inputSchema: z.object({videoId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, force}) => run(() => buildSourceList(videoId, force ?? true)));

  server.registerTool("make_video_get_plan", {
    description: "Read the current host-agent video plan for a project.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => ({videoId, plan: getPlan(videoId)})));

  server.registerTool("make_video_save_plan", {
    description: "Save a host-agent-authored, source-referenced video plan without generating media.",
    inputSchema: z.object({videoId: z.string().min(1), plan: z.any()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, plan}) => run(() => savePlan(videoId, plan)));

  server.registerTool("make_video_prepare_generation", {
    description: "Materialize image generation assets from the saved host-agent plan. This writes configuration only and does not call a model.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId}) => run(() => prepareGeneration(videoId)));

  server.registerTool("make_video_build_storyboard", {
    description: "Materialize a storyboard outline from the saved host-agent video plan. It does not generate narration or media.",
    inputSchema: z.object({videoId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, force}) => run(() => buildStoryboard(videoId, force ?? false)));

  server.registerTool("make_video_validate_script", {
    description: "Validate host-agent-authored narration segments and their claim/source references before timing or voice generation.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => validateScript(videoId)));

  server.registerTool("make_video_build_timing", {
    description: "Validate the narration script, then build captions and scene timing from the voice manifest. This does not call a model.",
    inputSchema: z.object({videoId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, force}) => result(startTiming(videoId, force ?? false)));

  server.registerTool("make_video_get_timing_job", {
    description: "Read the status of a narration timing job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getTimingJob(jobId)));

  server.registerTool("make_video_get_source_job", {
    description: "Read the status of a source ingestion job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getSourceJob(jobId)));

  server.registerTool("make_video_check_generation_readiness", {
    description: "Check whether a source-referenced plan, narration script, media configuration, and timing inputs are ready for generation.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => checkGenerationReadiness(videoId)));

  server.registerTool("make_video_request_image_revision", {
    description: "Start a non-destructive image revision job from an existing image asset. Poll make_video_get_generation_job for completion.",
    inputSchema: z.object({videoId: z.string().min(1), assetId: z.string().min(1), modelId: z.string().min(1).nullable().optional(), instruction: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, ...input}) => run(() => createAssetRevision(videoId, input)));

  server.registerTool("make_video_set_cover", {
    description: "Select an existing project image as the cover source without rendering or overwriting thumbnail output.",
    inputSchema: z.object({videoId: z.string().min(1), assetId: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, assetId}) => run(() => setCover(videoId, {assetId})));

  server.registerTool("make_video_get_deliverables", {
    description: "Read the declared delivery variants and the last delivery report for one video project.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => getDeliverables(videoId)));

  server.registerTool("make_video_deliver", {
    description: "Render the declared delivery variants (aspect ratios, clean or captioned cuts, translations, thumbnails, trailers, short extracts) and return a task id. Poll make_video_get_delivery_job for completion.",
    inputSchema: z.object({videoId: z.string().min(1), variantIds: z.array(z.string().min(1)).optional(), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, variantIds, force}) => run(() => startDelivery(videoId, variantIds ?? [], force ?? false)));

  server.registerTool("make_video_get_delivery_job", {
    description: "Read the status of a delivery variant render job.",
    inputSchema: z.object({jobId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({jobId}) => run(() => getDeliveryJob(jobId)));

  server.registerTool("make_video_list_series", {
    description: "List multi-episode series projects that declare an ordered episode plan.",
    inputSchema: z.object({}),
    annotations: {readOnlyHint: true},
  }, () => result({series: listSeries()}));

  server.registerTool("make_video_get_series", {
    description: "Read one series plan and its shared series bible.",
    inputSchema: z.object({seriesId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({seriesId}) => run(() => getSeries(seriesId)));

  server.registerTool("make_video_verify_series", {
    description: "Check a series plan for episode ordering, source coverage and repetition, premature dependencies, chronology errors, contradicted canonical positions, missing bibles, and over-compressed runtimes.",
    inputSchema: z.object({seriesId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({seriesId}) => run(() => verifySeries(seriesId)));

  server.registerTool("make_video_build_series_coverage", {
    description: "Write COVERAGE.md for a verified series: what each episode uses, omits, or reserves.",
    inputSchema: z.object({seriesId: z.string().min(1), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({seriesId, force}) => run(() => buildSeriesCoverage(seriesId, force ?? true)));

  server.registerResource("make-video-projects", "make-video://projects", {
    title: "Make Video projects",
    description: "Available Make Video project identifiers.",
    mimeType: "application/json",
  }, (uri) => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify({projects: listProjects()}, null, 2)}]}));

  for (const videoId of listProjects()) {
    server.registerResource(`make-video-project-${videoId}`, `make-video://projects/${videoId}`, {
      title: `Make Video project: ${videoId}`,
      description: "Current Make Video project state.",
      mimeType: "application/json",
    }, (uri) => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify(getProjectState(videoId), null, 2)}]}));
  }

  return server;
};

export const startStdioServer = async () => {
  const {serveStdio} = await import("@modelcontextprotocol/server/stdio");
  await serveStdio(createMakeVideoMcpServer);
};

const port = () => Number(process.env.MAKE_VIDEO_MCP_PORT ?? 4317);
const dist = resolve(projectRoot, "packages/app/dist");
const publicRoot = resolve(projectRoot, "public");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
};

const readBody = async (request: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};

const readRawBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const parseUpload = (request: IncomingMessage, body: Buffer) => {
  const contentType = request.headers["content-type"] ?? "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("Source upload must use multipart/form-data.");
  const boundary = boundaryMatch[1] ?? boundaryMatch[2];
  const marker = Buffer.from(`--${boundary}`);
  const headerSeparator = Buffer.from("\r\n\r\n");
  let cursor = body.indexOf(marker);
  while (cursor >= 0) {
    const headerStart = cursor + marker.length + 2;
    const headerEnd = body.indexOf(headerSeparator, headerStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(headerStart, headerEnd).toString("utf8");
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), headerEnd + headerSeparator.length);
    if (next < 0) break;
    const disposition = headers.match(/content-disposition:[^\r\n]*name="([^"]+)"[^\r\n]*filename="([^"]*)"/i);
    if (disposition) return {filename: disposition[2], data: body.subarray(headerEnd + headerSeparator.length, next)};
    cursor = body.indexOf(marker, next + 2);
  }
  throw new Error("No source file was found in the upload.");
};

const sendJson = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, {"content-type": "application/json; charset=utf-8"});
  response.end(JSON.stringify(value));
};

const requiredParam = (value: string | null) => {
  if (!value) throw new Error("A required query parameter is missing.");
  return value;
};

export const startHttpServer = () => {
  const mcp = createMcpHandler(createMakeVideoMcpServer, {responseMode: "json"});
  const handleMcp = toNodeHandler(mcp, {onerror: (error) => console.error(error)});
  const validateMcpHost = localhostHostValidation();
  const validateMcpOrigin = localhostOriginValidation();

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (url.pathname === "/mcp") {
        if (!validateMcpHost(request, response) || !validateMcpOrigin(request, response)) return;
        return handleMcp(request, response);
      }
      if (url.pathname === "/api/projects" && request.method === "GET") return sendJson(response, 200, listProjects());
      if (url.pathname === "/api/models" && request.method === "GET") return sendJson(response, 200, await getModelCatalog());
      if (url.pathname === "/api/project" && request.method === "GET") return sendJson(response, 200, getProjectState(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname.startsWith("/api/captions/") && request.method === "PATCH") { const input = await readBody(request); return sendJson(response, 200, updateCaption(input.videoId, decodeURIComponent(url.pathname.slice(14)), input)); }
      if (url.pathname === "/api/timeline" && request.method === "PATCH") { const input = await readBody(request); return sendJson(response, 200, updateTimelineRange(input.videoId, input)); }
      if (url.pathname === "/api/models" && request.method === "PATCH") { const input = await readBody(request); return sendJson(response, 200, updateModels(input.videoId, input)); }
      if (url.pathname === "/api/generate" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startGeneration(input.videoId, input.kind, Boolean(input.force))); }
      if (url.pathname.startsWith("/api/generate/") && request.method === "GET") return sendJson(response, 200, getGenerationJob(decodeURIComponent(url.pathname.slice(14))));
      if (url.pathname === "/api/render" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startRender(input.videoId, input.kind, Boolean(input.force))); }
      if (url.pathname.startsWith("/api/render/") && request.method === "GET") return sendJson(response, 200, getRenderJob(decodeURIComponent(url.pathname.slice(12))));
      if (url.pathname === "/api/qa" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startQa(input.videoId, input.kind)); }
      if (url.pathname.startsWith("/api/qa/") && request.method === "GET") return sendJson(response, 200, getQaJob(decodeURIComponent(url.pathname.slice(9))));
      if (url.pathname === "/api/sources" && request.method === "GET") return sendJson(response, 200, getSources(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname === "/api/sources/catalog" && request.method === "GET") return sendJson(response, 200, getSourceCatalog(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname === "/api/sources/catalog" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 200, await buildSourceCatalog(input.videoId, input.force ?? true)); }
      if (url.pathname === "/api/plan" && request.method === "GET") return sendJson(response, 200, {videoId: requiredParam(url.searchParams.get("videoId")), plan: getPlan(requiredParam(url.searchParams.get("videoId")))});
      if (url.pathname === "/api/plan" && request.method === "PUT") { const input = await readBody(request); return sendJson(response, 200, savePlan(input.videoId, input.plan)); }
      if (url.pathname === "/api/storyboard" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 200, buildStoryboard(input.videoId, input.force ?? true)); }
      if (url.pathname === "/api/generation/prepare" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 200, prepareGeneration(input.videoId)); }
      if (url.pathname === "/api/script/validation" && request.method === "GET") return sendJson(response, 200, validateScript(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname === "/api/timing" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startTiming(input.videoId, Boolean(input.force))); }
      if (url.pathname.startsWith("/api/timing/") && request.method === "GET") return sendJson(response, 200, getTimingJob(decodeURIComponent(url.pathname.slice("/api/timing/".length))));
      if (url.pathname === "/api/generation/readiness" && request.method === "GET") return sendJson(response, 200, checkGenerationReadiness(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname === "/api/sources/upload" && request.method === "POST") { const input = parseUpload(request, await readRawBody(request)); return sendJson(response, 201, uploadSource(requiredParam(url.searchParams.get("videoId")), input.filename, input.data)); }
      if (url.pathname === "/api/sources/ingest" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startSourceIngest(input.videoId, input.force ?? true)); }
      if (url.pathname.startsWith("/api/sources/ingest/") && request.method === "GET") return sendJson(response, 200, getSourceJob(decodeURIComponent(url.pathname.slice("/api/sources/ingest/".length))));
      if (url.pathname === "/api/assets/revisions" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 201, createAssetRevision(input.videoId, input)); }
      if (url.pathname === "/api/cover" && request.method === "PUT") { const input = await readBody(request); return sendJson(response, 200, setCover(input.videoId, input)); }
      if (url.pathname === "/api/deliverables" && request.method === "GET") return sendJson(response, 200, getDeliverables(requiredParam(url.searchParams.get("videoId"))));
      if (url.pathname === "/api/delivery" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 202, startDelivery(input.videoId, Array.isArray(input.variantIds) ? input.variantIds : [], Boolean(input.force))); }
      if (url.pathname.startsWith("/api/delivery/") && request.method === "GET") return sendJson(response, 200, getDeliveryJob(decodeURIComponent(url.pathname.slice("/api/delivery/".length))));
      if (url.pathname === "/api/series" && request.method === "GET") return sendJson(response, 200, listSeries());
      if (url.pathname === "/api/series/detail" && request.method === "GET") return sendJson(response, 200, getSeries(requiredParam(url.searchParams.get("seriesId"))));
      if (url.pathname === "/api/series/verification" && request.method === "GET") return sendJson(response, 200, verifySeries(requiredParam(url.searchParams.get("seriesId"))));
      if (url.pathname === "/api/series/coverage" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 200, buildSeriesCoverage(input.seriesId, input.force ?? true)); }
      if (url.pathname === "/media" && request.method === "GET") {
        const file = resolveMediaPath(requiredParam(url.searchParams.get("path")));
        const size = statSync(file).size;
        const range = request.headers.range;
        if (range) {
          const [startText, endText] = range.replace("bytes=", "").split("-");
          const start = Number(startText); const end = endText ? Number(endText) : size - 1;
          response.writeHead(206, {"content-type": types[extname(file)] ?? "application/octet-stream", "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1});
          return createReadStream(file, {start, end}).pipe(response);
        }
        response.writeHead(200, {"content-type": types[extname(file)] ?? "application/octet-stream", "content-length": size, "accept-ranges": "bytes"});
        return createReadStream(file).pipe(response);
      }

      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const publicFile = resolve(publicRoot, requested);
      const publicRelative = relative(publicRoot, publicFile);
      if (publicRelative !== ".." && !publicRelative.startsWith(`..${sep}`) && existsSync(publicFile) && statSync(publicFile).isFile()) {
        response.writeHead(200, {"content-type": types[extname(publicFile)] ?? "application/octet-stream"});
        return createReadStream(publicFile).pipe(response);
      }
      const file = resolve(dist, requested);
      const distRelative = relative(dist, file);
      const fallback = resolve(dist, "index.html");
      const target = distRelative !== ".." && !distRelative.startsWith(`..${sep}`) && existsSync(file) ? file : fallback;
      if (!existsSync(target)) return sendJson(response, 404, {error: "Build the app first with: cd packages/app && pnpm build"});
      response.writeHead(200, {"content-type": types[extname(target)] ?? "application/octet-stream"});
      response.end(readFileSync(target));
    } catch (error) {
      sendJson(response, 400, {error: error instanceof Error ? error.message : String(error)});
    }
  }).listen(port(), "127.0.0.1", () => console.log(`Make Video MCP: http://127.0.0.1:${port()}`));
};
