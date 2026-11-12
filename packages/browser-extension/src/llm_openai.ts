// An OpenAI model through the Responses API, with the user's own API key: structured output in the answer's schema.
// The model is chosen in the settings from the account's own model list (listOpenAiModels), so no model name is
// written here. A model without reasoning effort is asked again without it.
import OpenAI from "openai";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import type { Effort } from "./settings.ts";
import { SCHEMA, type Llm } from "./yomite.ts";

/** what is needed from the Responses API (the SDK's client, or a stand-in in the tests) */
export interface ResponsesClient {
  create(body: ResponseCreateParamsNonStreaming): Promise<Response>;
  models(): Promise<string[]>;
}

export function responseBody(model: string, effort: Effort | null, system: string, user: string): ResponseCreateParamsNonStreaming {
  const body: ResponseCreateParamsNonStreaming = {
    model,
    instructions: system,
    input: user,
    text: { format: { type: "json_schema", name: "utterances", schema: SCHEMA, strict: true } },
  };
  return effort ? { ...body, reasoning: { effort } } : body;
}

/** the text of a response; throws when the model refused or the response is incomplete */
export function responseText(r: Response): string {
  for (const item of r.output)
    if (item.type === "message") for (const c of item.content) if (c.type === "refusal") throw new Error(`the model declined to read this text: ${c.refusal}`);
  if (r.status === "incomplete") throw new Error(`the answer was cut off (${r.incomplete_details?.reason ?? "incomplete"})`);
  return r.output_text;
}

const unsupportedReasoning = (e: unknown) => e instanceof Error && /reasoning/i.test(e.message) && /support/i.test(e.message);

export function openAiLlm(client: ResponsesClient, model: string, effort: Effort): Llm {
  let withEffort = true;
  return {
    complete: async (system, user) => {
      try {
        return responseText(await client.create(responseBody(model, withEffort ? effort : null, system, user)));
      } catch (e) {
        if (!withEffort || !unsupportedReasoning(e)) throw e;
        withEffort = false;
        return responseText(await client.create(responseBody(model, null, system, user)));
      }
    },
  };
}

/** the models of a list that can write text (not embeddings, audio, images or moderation), sorted */
export function textModels(ids: string[]): string[] {
  return ids
    .filter((id) => !/embedding|whisper|tts|audio|realtime|transcribe|dall-e|image|moderation|search|davinci|babbage/i.test(id))
    .sort((a, b) => a.localeCompare(b));
}

export function openAiClient(apiKey: string): ResponsesClient {
  // the key is the user's own, kept in the extension's storage, and sent only to the API
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return {
    create: (body) => client.responses.create(body),
    models: async () => {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return textModels(ids);
    },
  };
}
