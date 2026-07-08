import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM provider abstraction for the optimizer. To swap providers, implement
 * OptimizerProvider and change the export at the bottom — nothing else
 * references a vendor SDK.
 */
export type OptimizerProvider = {
  complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

const anthropicProvider: OptimizerProvider = {
  async complete(systemPrompt, userPrompt) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    globalForAnthropic.anthropic ??= new Anthropic();
    const response = await globalForAnthropic.anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) throw new Error("Optimizer returned an empty response");
    return text;
  },
};

export const optimizerProvider: OptimizerProvider = anthropicProvider;
