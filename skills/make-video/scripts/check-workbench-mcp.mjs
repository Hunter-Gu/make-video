import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";

import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

import {projectRoot} from "./video-context.mjs";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["skills/make-video/scripts/workbench-mcp.mjs"],
  cwd: projectRoot,
  stderr: "pipe",
});
const client = new Client({name: "make-video-workbench-check", version: "0.1.0"});
let toolCount = 0;
let resourceCount = 0;

try {
  await client.connect(transport);
  const tools = await client.listTools();
  toolCount = tools.tools.length;
  const names = tools.tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), ["workbench_get_project", "workbench_list_projects", "workbench_request_image_revision", "workbench_update_caption", "workbench_update_models"]);
  const projects = await client.callTool({name: "workbench_list_projects", arguments: {}});
  assert.equal(projects.isError, undefined);
  assert.ok(JSON.stringify(projects.structuredContent).includes("library-of-alexandria"));
  const project = await client.callTool({name: "workbench_get_project", arguments: {videoId: "library-of-alexandria"}});
  assert.equal(project.isError, undefined);
  assert.ok(JSON.stringify(project.structuredContent).includes("LibraryOfAlexandria"));
  const rejected = await client.callTool({name: "workbench_request_image_revision", arguments: {videoId: "library-of-alexandria", assetId: "missing", instruction: "test"}});
  assert.equal(rejected.isError, true);
  const resources = await client.listResources();
  resourceCount = resources.resources.length;
  assert.ok(resources.resources.some((resource) => resource.uri === "workbench://projects"));
} finally {
  await client.close();
}

const port = 44000 + process.pid % 1000;
const frontend = spawn(process.execPath, ["skills/make-video/scripts/workbench-server.mjs"], {cwd: projectRoot, env: {...process.env, MAKE_VIDEO_WORKBENCH_PORT: String(port)}, stdio: ["ignore", "pipe", "pipe"]});
try {
  await Promise.race([
    new Promise((resolve, reject) => {
      frontend.stdout.on("data", (chunk) => { if (String(chunk).includes("Make Video Workbench")) resolve(undefined); });
      frontend.once("exit", (code) => reject(new Error(`Workbench server exited early: ${code}`)));
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Workbench server startup timed out.")), 5000)),
  ]);
  const httpClient = new Client({name: "make-video-workbench-http-check", version: "0.1.0"});
  try {
    await httpClient.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    const response = await httpClient.callTool({name: "workbench_get_project", arguments: {videoId: "library-of-alexandria"}});
    assert.equal(response.isError, undefined);
    assert.ok(JSON.stringify(response.structuredContent).includes("LibraryOfAlexandria"));
  } finally {
    await httpClient.close();
  }
} finally {
  frontend.kill();
  if (frontend.exitCode === null) await once(frontend, "exit");
}

console.log(`✓ MCP Workbench: ${toolCount} tools, ${resourceCount} resources, stdio and Streamable HTTP calls passed.`);
