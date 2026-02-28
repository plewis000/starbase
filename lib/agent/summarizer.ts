// ============================================================
// FILE: lib/agent/summarizer.ts
// PURPOSE: Conversation summarization — compress older messages
//          into a summary instead of losing them at the 50-msg cap.
//          Uses Haiku for fast, cheap summarization.
// PART OF: Desperado Club
// ============================================================

import { anthropic, getModel } from "./client";

const SUMMARY_WINDOW = 40; // Keep the last N messages as-is
const SUMMARIZE_THRESHOLD = 50; // Start summarizing when total messages exceed this
const MAX_SUMMARY_TOKENS = 500; // Max tokens for the summary

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SummarizedConversation {
  summary: string | null;
  messages: Message[];
  wasSummarized: boolean;
}

/**
 * Given a full conversation history, return a manageable context window:
 * - If under threshold: return all messages as-is
 * - If over threshold: summarize older messages, keep recent ones
 */
export async function prepareConversationContext(
  allMessages: Message[],
  existingSummary: string | null,
): Promise<SummarizedConversation> {
  if (allMessages.length <= SUMMARIZE_THRESHOLD) {
    return {
      summary: existingSummary,
      messages: allMessages,
      wasSummarized: false,
    };
  }

  // Split: older messages get summarized, recent messages stay
  const olderMessages = allMessages.slice(0, allMessages.length - SUMMARY_WINDOW);
  const recentMessages = allMessages.slice(allMessages.length - SUMMARY_WINDOW);

  // Build the older conversation text for summarization
  const olderText = olderMessages
    .map((m) => `${m.role === "user" ? "User" : "Zev"}: ${m.content}`)
    .join("\n");

  const summaryPrompt = existingSummary
    ? `Here is a previous summary of the conversation:\n${existingSummary}\n\nHere are additional messages since that summary:\n${olderText}\n\nProduce an updated, comprehensive summary.`
    : `Here is a conversation between a user and their AI household assistant (Zev):\n${olderText}`;

  try {
    const response = await anthropic.messages.create({
      model: getModel("fast"),
      max_tokens: MAX_SUMMARY_TOKENS,
      system: "You summarize conversations concisely. Capture: key topics discussed, decisions made, user preferences revealed, tasks created/completed, any commitments or follow-ups. Be factual and dense — every sentence should contain useful information. Do not include greetings or pleasantries.",
      messages: [
        {
          role: "user",
          content: `${summaryPrompt}\n\nSummarize this conversation in 3-5 sentences. Focus on facts, decisions, and user preferences.`,
        },
      ],
    });

    const summaryText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();

    return {
      summary: summaryText || existingSummary,
      messages: recentMessages,
      wasSummarized: true,
    };
  } catch (err) {
    console.error("Summarization failed, falling back to truncation:", err);
    // Fallback: just truncate
    return {
      summary: existingSummary,
      messages: recentMessages,
      wasSummarized: false,
    };
  }
}

/**
 * Build the system prompt with conversation summary injected.
 */
export function buildSystemPromptWithSummary(
  baseSystemPrompt: string,
  summary: string | null,
  observationContext: string | null,
): string {
  let prompt = baseSystemPrompt;

  if (summary) {
    prompt += `\n\n<conversation_history_summary>\n${summary}\n</conversation_history_summary>`;
  }

  if (observationContext) {
    prompt += `\n\n<user_context>\n${observationContext}\n</user_context>`;
  }

  return prompt;
}
