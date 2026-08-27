import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {dirname, resolve} from "node:path";
import {Client} from "@modelcontextprotocol/client";
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
