import {createReadStream, existsSync, readFileSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {extname, relative, resolve, sep} from "node:path";

import {localhostHostValidation, localhostOriginValidation, toNodeHandler} from "@modelcontextprotocol/node";
import {createMcpHandler} from "@modelcontextprotocol/server";

import {generateVideoPlan} from "../../../packages/ai/src/generator.mjs";
import {createWorkbenchMcpServer} from "./workbench-mcp.mjs";
import {createAssetRevision, getProjectState, listProjects, resolveMediaPath, setCover, updateCaption, updateModels} from "./workbench-service.mjs";
import {projectRoot} from "./video-context.mjs";

const port = Number(process.env.MAKE_VIDEO_WORKBENCH_PORT ?? 4317);
const dist = resolve(projectRoot, "packages/app/dist");
const publicRoot = resolve(projectRoot, "public");
const mcp = createMcpHandler(createWorkbenchMcpServer, {responseMode: "json"});
const handleMcp = toNodeHandler(mcp, {onerror: (error) => console.error(error)});
const validateMcpHost = localhostHostValidation();
const validateMcpOrigin = localhostOriginValidation();
/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} value */
const json = (response, status, value) => { response.writeHead(status, {"content-type": "application/json; charset=utf-8"}); response.end(JSON.stringify(value)); };
/** @param {import("node:http").IncomingMessage} request @returns {Promise<any>} */
const body = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
};
/** @type {Record<string, string>} */
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4"};
/** @param {string | null} value */
const requiredParam = (value) => { if (!value) throw new Error("A required query parameter is missing."); return value; };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    if (url.pathname === "/mcp") {
      if (!validateMcpHost(request, response) || !validateMcpOrigin(request, response)) return;
      return handleMcp(request, response);
    }
    if (url.pathname === "/api/projects" && request.method === "GET") return json(response, 200, listProjects());
    if (url.pathname === "/api/project" && request.method === "GET") return json(response, 200, getProjectState(requiredParam(url.searchParams.get("videoId"))));
    if (url.pathname.startsWith("/api/captions/") && request.method === "PATCH") { const input = await body(request); return json(response, 200, updateCaption(input.videoId, decodeURIComponent(url.pathname.slice(14)), input)); }
    if (url.pathname === "/api/models" && request.method === "PATCH") { const input = await body(request); return json(response, 200, updateModels(input.videoId, input)); }
    if (url.pathname === "/api/plan" && request.method === "POST") { const input = await body(request); return json(response, 200, await generateVideoPlan({brief: input.brief, modelId: input.modelId, project: input.videoId ? getProjectState(input.videoId) : undefined})); }
    if (url.pathname === "/api/assets/revisions" && request.method === "POST") { const input = await body(request); return json(response, 201, createAssetRevision(input.videoId, input)); }
    if (url.pathname === "/api/cover" && request.method === "PUT") { const input = await body(request); return json(response, 200, setCover(input.videoId, input)); }
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
    if (!existsSync(target)) return json(response, 404, {error: "Build the Workbench first with pnpm workbench:build."});
    response.writeHead(200, {"content-type": types[extname(target)] ?? "application/octet-stream"});
    response.end(readFileSync(target));
  } catch (error) {
    json(response, 400, {error: error instanceof Error ? error.message : String(error)});
  }
}).listen(port, "127.0.0.1", () => console.log(`Make Video Workbench: http://127.0.0.1:${port}`));
