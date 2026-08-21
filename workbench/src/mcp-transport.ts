import {Client, StreamableHTTPClientTransport} from "@modelcontextprotocol/client";

import type {Caption, ProjectState, WorkbenchTransport} from "./types";

let connection: Promise<Client> | null = null;

const getClient = () => {
  connection ??= (async () => {
    const client = new Client({name: "make-video-workbench-ui", version: "0.1.0"});
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", window.location.href)));
    return client;
  })();
  return connection;
};

const call = async <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
  const client = await getClient();
  const response = await client.callTool({name, arguments: args});
  if (response.isError) {
    const message = response.content.find((item) => item.type === "text");
    throw new Error(message?.type === "text" ? message.text : "Workbench MCP request failed.");
  }
  return response.structuredContent as T;
};

export const mcpTransport: WorkbenchTransport = {
  listProjects: async () => (await call<{projects: string[]}>("workbench_list_projects", {})).projects,
  getProject: (videoId) => call<ProjectState>("workbench_get_project", {videoId}),
  updateCaption: async (videoId, caption: Caption) => { await call("workbench_update_caption", {videoId, ...caption}); },
  updateModels: async (videoId, models) => { await call("workbench_update_models", {videoId, ...models}); },
  createAssetRevision: async (videoId, input) => { await call("workbench_request_image_revision", {videoId, ...input}); },
};
