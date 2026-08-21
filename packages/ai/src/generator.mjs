import {createGateway, generateObject} from "ai";
import {createGoogleGenerativeAI} from "@ai-sdk/google";
import {z} from "zod";

const ScenePlanSchema = z.object({
  id: z.string().min(1),
  narration: z.string().min(1),
  visualPrompt: z.string().min(1),
  durationSeconds: z.number().positive(),
});

const VideoPlanSchema = z.object({
  title: z.string().min(1),
  language: z.string().min(1).default("en"),
  scenes: z.array(ScenePlanSchema).min(1),
});

/** @param {any} project */
const projectSummary = (project) => project ? JSON.stringify({
  videoId: project.videoId,
  composition: project.composition,
  scenes: project.scenes,
  captions: project.captions,
}, null, 2) : "No existing project was selected.";

/** Generate a validated video plan through the AI SDK and the server-side AI Gateway. */
/** @param {{brief?: string; project?: any; modelId?: string}} [options] */
export const generateVideoPlan = async ({brief, project, modelId} = {}) => {
  const prompt = String(brief ?? "").trim();
  if (!prompt) throw new Error("A video brief is required.");
  const geminiKey = process.env.GEMINI_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (!geminiKey && !gatewayKey) throw new Error("GEMINI_API_KEY or AI_GATEWAY_API_KEY is required for plan generation. Keys must stay on the Make Video MCP server.");

  const configuredModel = modelId ?? process.env.AI_PLAN_MODEL;
  const useGemini = Boolean(geminiKey);
  const selectedModel = useGemini
    ? (configuredModel ?? "gemini-2.5-flash").replace(/^google\//, "")
    : (configuredModel ?? "google/gemini-2.5-flash");
  const provider = useGemini ? createGoogleGenerativeAI({apiKey: geminiKey}) : createGateway({apiKey: gatewayKey});
  const result = await generateObject({
    model: provider(selectedModel),
    schema: VideoPlanSchema,
    schemaName: "video_plan",
    schemaDescription: "A scene-by-scene plan for an image-led documentary or knowledge video.",
    system: "You are a documentary video planner. Create concise, factual, image-led plans. Each scene needs narration, a visual generation prompt, and a positive duration in seconds. Do not invent sources or claim certainty where the brief is uncertain.",
    prompt: `Brief:\n${prompt}\n\nExisting project context:\n${projectSummary(project)}`,
  });

  return {
    plan: result.object,
    model: selectedModel,
    usage: result.usage ? {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    } : undefined,
  };
};
