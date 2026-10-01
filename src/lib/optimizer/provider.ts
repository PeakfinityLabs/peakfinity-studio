import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "@/lib/secrets";

/**
 * LLM provider abstraction for the optimizer. To swap providers, implement
 * OptimizerProvider and change the export at the bottom — nothing else
 * references a vendor SDK.
 */
export type OptimizerProvider = {
  complete: (systemPrompt: string, userPrompt: string) => Promise<string>;
};

const anthropicProvider: OptimizerProvider = {
  async complete(systemPrompt, userPrompt) {
    const apiKey = await getSecret("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    // Built per call with the resolved key so a dashboard rotation takes effect.
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
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
