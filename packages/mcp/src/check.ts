import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {resolve} from "node:path";

import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

const entry = resolve(process.argv[1] ?? "mcp.mjs");
const expectedTools = [
  "make_video_get_project",
  "make_video_list_projects",
  "make_video_request_image_revision",
  "make_video_set_cover",
  "make_video_update_caption",
  "make_video_update_models",
];

const checkStdio = async () => {
  const transport = new StdioClientTransport({command: process.execPath, args: [entry, "stdio"], cwd: process.cwd(), stderr: "pipe"});
  const client = new Client({name: "make-video-mcp-check", version: "0.1.0"});
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), expectedTools);
    const projects = await client.callTool({name: "make_video_list_projects", arguments: {}});
    assert.equal(projects.isError, undefined);
    assert.ok(JSON.stringify(projects.structuredContent).includes("library-of-alexandria"));
    const project = await client.callTool({name: "make_video_get_project", arguments: {videoId: "library-of-alexandria"}});
    assert.equal(project.isError, undefined);
    assert.ok(JSON.stringify(project.structuredContent).includes("LibraryOfAlexandria"));
    const rejected = await client.callTool({name: "make_video_request_image_revision", arguments: {videoId: "library-of-alexandria", assetId: "missing", instruction: "test"}});
    assert.equal(rejected.isError, true);
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === "make-video://projects"));
    return {toolCount: tools.tools.length, resourceCount: resources.resources.length};
  } finally {
    await client.close();
  }
};

const checkHttp = async () => {
  const port = 44000 + process.pid % 1000;
  const frontend = spawn(process.execPath, [entry, "http"], {cwd: process.cwd(), env: {...process.env, MAKE_VIDEO_MCP_PORT: String(port)}, stdio: ["ignore", "pipe", "pipe"]});
  try {
    await Promise.race([
      new Promise<void>((resolveReady, reject) => {
        frontend.stdout.on("data", (chunk) => { if (String(chunk).includes("Make Video MCP")) resolveReady(); });
        frontend.once("exit", (code) => reject(new Error(`Make Video MCP server exited early: ${code}`)));
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Make Video MCP startup timed out.")), 5000)),
    ]);
    const client = new Client({name: "make-video-mcp-http-check", version: "0.1.0"});
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      const response = await client.callTool({name: "make_video_get_project", arguments: {videoId: "library-of-alexandria"}});
      assert.equal(response.isError, undefined);
      assert.ok(JSON.stringify(response.structuredContent).includes("LibraryOfAlexandria"));
    } finally {
      await client.close();
    }
  } finally {
    frontend.kill();
    if (frontend.exitCode === null) await once(frontend, "exit");
  }
};

export const runCheck = async () => {
  const {toolCount, resourceCount} = await checkStdio();
  await checkHttp();
  console.log(`✓ Make Video MCP: ${toolCount} tools, ${resourceCount} resources, stdio and Streamable HTTP calls passed.`);
};
