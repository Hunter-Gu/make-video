import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer, type IncomingMessage, type ServerResponse} from "node:http";
import {extname, relative, resolve, sep} from "node:path";

import {localhostHostValidation, localhostOriginValidation, toNodeHandler} from "@modelcontextprotocol/node";
import {createMcpHandler, McpServer} from "@modelcontextprotocol/server";
import {z} from "zod";

import {projectRoot} from "./context";
import {getModelCatalog} from "./models";
import {createAssetRevision, getGenerationJob, getProjectState, getRenderJob, listProjects, resolveMediaPath, runGeneration, setCover, startGeneration, startRender, updateCaption, updateModels, updateTimelineRange} from "./service";

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
    inputSchema: z.object({videoId: z.string().min(1), image: z.string().min(1).optional(), voice: z.string().min(1).optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, image, voice}) => run(() => updateModels(videoId, {image, voice})));

  server.registerTool("make_video_generate", {
    description: "Run one configured generation action for a project. API keys stay on the server environment and are never passed as tool input.",
    inputSchema: z.object({videoId: z.string().min(1), kind: z.enum(["images", "voiceover", "music"]), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, kind, force}) => run(() => runGeneration(videoId, kind, force ?? false)));

  server.registerTool("make_video_render", {
    description: "Start a still, preview, or final Remotion render and return a task id.",
    inputSchema: z.object({videoId: z.string().min(1), kind: z.enum(["still", "preview", "final"]), force: z.boolean().optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, kind, force}) => result(startRender(videoId, kind, force ?? false)));

  server.registerTool("make_video_request_image_revision", {
    description: "Create a non-destructive, versioned image revision request for an existing image asset.",
    inputSchema: z.object({videoId: z.string().min(1), assetId: z.string().min(1), modelId: z.string().min(1).nullable().optional(), instruction: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, ...input}) => run(() => createAssetRevision(videoId, input)));

  server.registerTool("make_video_set_cover", {
    description: "Select an existing project image as the cover source without rendering or overwriting thumbnail output.",
    inputSchema: z.object({videoId: z.string().min(1), assetId: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, assetId}) => run(() => setCover(videoId, {assetId})));

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
      if (url.pathname === "/api/assets/revisions" && request.method === "POST") { const input = await readBody(request); return sendJson(response, 201, createAssetRevision(input.videoId, input)); }
      if (url.pathname === "/api/cover" && request.method === "PUT") { const input = await readBody(request); return sendJson(response, 200, setCover(input.videoId, input)); }
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
