import type {LanguageModel} from "ai";
import type {ProjectState} from "@make-video/contracts";
import {z} from "zod";

const ScenePlanSchema = z.object({
  id: z.string(),
  narration: z.string(),
  visualPrompt: z.string(),
  durationSeconds: z.number().positive(),
});

/** Stable output contract for AI-generated video plans. */
export const VideoPlanSchema = z.object({
  title: z.string(),
  language: z.string().default("en"),
  scenes: z.array(ScenePlanSchema).min(1),
});

export type VideoPlan = z.infer<typeof VideoPlanSchema>;

export type PlanGenerationContext = {
  brief: string;
  project?: Partial<ProjectState>;
};

export type PlanGenerationResult = {
  plan: VideoPlan;
  model: string;
  usage?: {inputTokens?: number; outputTokens?: number};
};

/** Backend seam for AI SDK providers; UI code should call a transport instead. */
export type VideoPlanGenerator = {
  model: LanguageModel;
  generate(context: PlanGenerationContext): Promise<PlanGenerationResult>;
};

export const AI_PACKAGE_VERSION = "0.1.0";
