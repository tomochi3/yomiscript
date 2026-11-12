// Claude through the Messages API, with the user's own API key: structured output in the answer's schema, and the
// server-side fallback on a refusal for the models that have it (Haiku has none).
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Effort } from "./settings.ts";
import { SCHEMA, type Llm } from "./yomite.ts";

/** the models offered in the settings; the first is the default */
export const ANTHROPIC_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;

/** what is needed from the Messages API (the SDK's client, or a stand-in in the tests) */
export interface MessagesClient {
  create(body: MessageCreateParamsNonStreaming): Promise<BetaMessage>;
}

export function requestBody(model: string, effort: Effort, system: string, user: string): MessageCreateParamsNonStreaming {
  const body: MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: { type: "json_schema", schema: SCHEMA } },
  };
  if (!model.startsWith("claude-haiku")) return { ...body, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  return body;
}

/** the text of an answer; throws when the model declined or the answer was cut off */
export function answerText(m: BetaMessage): string {
  if (m.stop_reason === "refusal") throw new Error("the model declined to read this text");
  if (m.stop_reason === "max_tokens") throw new Error("the answer was cut off (max_tokens)");
  return m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export function anthropicLlm(client: MessagesClient, model: string, effort: Effort): Llm {
  return { complete: async (system, user) => answerText(await client.create(requestBody(model, effort, system, user))) };
}

export function anthropicClient(apiKey: string): MessagesClient {
  // the key is the user's own, kept in the extension's storage, and sent only to the API
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return { create: (body) => client.beta.messages.create(body) };
}
