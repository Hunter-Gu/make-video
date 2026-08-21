import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

import {McpServer} from "@modelcontextprotocol/server";
import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {z} from "zod";

import {createAssetRevision, getProjectState, listProjects, updateCaption, updateModels} from "./workbench-service.mjs";

/** @typedef {import("@modelcontextprotocol/server").CallToolResult} CallToolResult */

/** @param {Record<string, any>} value @returns {CallToolResult} */
const result = (value) => ({
  content: [{type: "text", text: JSON.stringify(value, null, 2)}],
  structuredContent: value,
});

/** @param {() => Record<string, any>} operation @returns {Promise<CallToolResult>} */
const run = async (operation) => {
  try {
    return result(await operation());
  } catch (error) {
    return {content: [{type: "text", text: error instanceof Error ? error.message : String(error)}], isError: true};
  }
};

export const createWorkbenchMcpServer = () => {
  const server = new McpServer({name: "make-video-workbench", version: "0.1.0"});

  server.registerTool("workbench_list_projects", {
    description: "List video projects available in the Make Video Workbench.",
    inputSchema: z.object({}),
    annotations: {readOnlyHint: true},
  }, () => result({projects: listProjects()}));

  server.registerTool("workbench_get_project", {
    description: "Read scenes, captions, assets, render stages, models, revisions, and QA for one video project.",
    inputSchema: z.object({videoId: z.string().min(1)}),
    annotations: {readOnlyHint: true},
  }, ({videoId}) => run(() => getProjectState(videoId)));

  server.registerTool("workbench_update_caption", {
    description: "Update one caption's text and frame range in the project source of truth.",
    inputSchema: z.object({videoId: z.string().min(1), id: z.string().min(1), text: z.string().min(1), startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, id, ...input}) => run(() => updateCaption(videoId, id, input)));

  server.registerTool("workbench_update_models", {
    description: "Save the selected image and voice models without starting paid generation.",
    inputSchema: z.object({videoId: z.string().min(1), image: z.string().min(1).optional(), voice: z.string().min(1).optional()}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true},
  }, ({videoId, image, voice}) => run(() => updateModels(videoId, {image, voice})));

  server.registerTool("workbench_request_image_revision", {
    description: "Create a non-destructive, versioned image revision request for an existing image asset.",
    inputSchema: z.object({videoId: z.string().min(1), assetId: z.string().min(1), modelId: z.string().min(1).nullable().optional(), instruction: z.string().min(1)}),
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false},
  }, ({videoId, ...input}) => run(() => createAssetRevision(videoId, input)));

  server.registerResource("workbench-projects", "workbench://projects", {
    title: "Make Video projects",
    description: "Available Workbench video project identifiers.",
    mimeType: "application/json",
  }, (uri) => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify({projects: listProjects()}, null, 2)}]}));

  for (const videoId of listProjects()) {
    server.registerResource(`workbench-project-${videoId}`, `workbench://projects/${videoId}`, {
      title: `Make Video project: ${videoId}`,
      description: "Current Workbench project state.",
      mimeType: "application/json",
    }, (uri) => ({contents: [{uri: uri.href, mimeType: "application/json", text: JSON.stringify(getProjectState(videoId), null, 2)}]}));
  }

  return server;
};

const entryFile = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryFile === fileURLToPath(import.meta.url)) serveStdio(createWorkbenchMcpServer);
