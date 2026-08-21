declare module "@make-video/ai/server" {
  import type {PlanGenerationResult} from "@make-video/ai";

  export function generateVideoPlan(options?: {
    brief?: string;
    project?: unknown;
    modelId?: string;
  }): Promise<PlanGenerationResult>;
}
