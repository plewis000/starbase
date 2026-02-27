import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Model routing — Haiku for simple queries, Sonnet for complex operations
export type ModelTier = "fast" | "smart";

const MODELS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-sonnet-4-6-20250514",
};

// Cost per 1K tokens (for tracking)
export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },
  "claude-sonnet-4-6-20250514": { input: 0.003, output: 0.015 },
};

export function getModel(tier: ModelTier): string {
  return MODELS[tier];
}

// Determine model tier based on message complexity
export function routeModel(message: string): ModelTier {
  const lower = message.toLowerCase();

  // Smart model for: budget analysis, complex queries, multi-step operations
  const smartPatterns = [
    /budget.*summary|spending.*breakdown|financial.*review/,
    /create.*and.*then|first.*then.*finally/,
    /analyze|compare|recommend|suggest|plan/,
    /weekly.*review|daily.*brief|monthly.*report/,
    /split.*transaction|recategorize.*all/,
    /what.*should|how.*much.*can|am.*i.*on.*track/,
  ];

  if (smartPatterns.some((p) => p.test(lower))) {
    return "smart";
  }

  // Everything else uses fast model
  return "fast";
}

// Safety: max tokens per response and per conversation
export const MAX_RESPONSE_TOKENS = 2048;
export const MAX_TOOL_ROUNDS = 10; // Max tool-use loops before forcing a text response
export const MAX_CONVERSATION_MESSAGES = 50; // Cap conversation history sent to Claude

export { anthropic };
