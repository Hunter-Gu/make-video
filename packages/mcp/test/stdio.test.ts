import assert from "node:assert/strict";
import {spawn, type ChildProcess} from "node:child_process";
import {createServer, type AddressInfo} from "node:net";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {dirname, resolve} from "node:path";
import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";

test("stdio MCP exposes the core project and production tools", async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const client = new Client({name: "make-video-smoke-test", version: "0.1.0"});
  const transport = new StdioClientTransport({command: process.execPath, args: [resolve(root, "skills/make-video/scripts/mcp.mjs")], cwd: root, stderr: "ignore"});
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = new Set(listed.tools.map((tool) => tool.name));
    for (const name of ["make_video_list_projects", "make_video_get_project", "make_video_generate", "make_video_get_generation_job", "make_video_render", "make_video_qa"]) assert.ok(names.has(name), `missing MCP tool: ${name}`);

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
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
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
